import axios, { AxiosInstance } from 'axios';
import { db, schema } from '../db';
import { eq, and, gt } from 'drizzle-orm';

interface AvailityTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface EligibilityRequest {
  memberId: string;
  dateOfBirth: string;
  firstName: string;
  lastName: string;
  providerNpi: string;
  serviceDate?: string;
}

interface EligibilityResponse {
  eligibilityStatus: string;
  coverageLevel: string;
  copay?: number;
  deductible?: number;
  deductibleMet?: number;
  coinsurance?: number;
  planDetails?: any;
}

export class AvailityService {
  private api: AxiosInstance;
  private tokenCache: { token: string; expiresAt: Date } | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: process.env.AVAILITY_API_BASE_URL || 'https://api.availity.com',
      timeout: 30000,
    });
  }

  /**
   * Get OAuth2 access token (with caching)
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.tokenCache && this.tokenCache.expiresAt > new Date()) {
      return this.tokenCache.token;
    }

    try {
      const response = await axios.post<AvailityTokenResponse>(
        process.env.AVAILITY_TOKEN_URL || 'https://api.availity.com/availity/v1/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.AVAILITY_CLIENT_ID || '',
          client_secret: process.env.AVAILITY_CLIENT_SECRET || '',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const expiresAt = new Date(Date.now() + (response.data.expires_in - 60) * 1000);
      this.tokenCache = {
        token: response.data.access_token,
        expiresAt,
      };

      return response.data.access_token;
    } catch (error: any) {
      console.error('[Availity] Error getting access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Availity');
    }
  }

  /**
   * Check insurance eligibility
   */
  async checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse> {
    try {
      const token = await this.getAccessToken();

      const response = await this.api.post(
        '/availity/v1/coverages',
        {
          memberId: request.memberId,
          dateOfBirth: request.dateOfBirth,
          firstName: request.firstName,
          lastName: request.lastName,
          providerNpi: request.providerNpi,
          serviceDate: request.serviceDate || new Date().toISOString().split('T')[0],
          serviceType: ['30'], // Health Benefit Plan Coverage
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = response.data;

      // Parse Availity response
      const eligibilityResponse: EligibilityResponse = {
        eligibilityStatus: data.eligibilityStatus || 'unknown',
        coverageLevel: data.coverageLevel || 'unknown',
        copay: this.parseCopay(data),
        deductible: this.parseDeductible(data),
        deductibleMet: this.parseDeductibleMet(data),
        coinsurance: this.parseCoinsurance(data),
        planDetails: data,
      };

      return eligibilityResponse;
    } catch (error: any) {
      console.error('[Availity] Error checking eligibility:', error.response?.data || error.message);
      throw new Error('Failed to verify insurance eligibility');
    }
  }

  /**
   * Check and cache eligibility for a client
   */
  async verifyClientInsurance(clientId: number): Promise<EligibilityResponse> {
    // Check cache first
    const cached = await this.getCachedVerification(clientId);
    if (cached) {
      return cached;
    }

    // Get client details
    const client = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId)).limit(1);

    if (!client.length) {
      throw new Error('Client not found');
    }

    const clientData = client[0];

    if (!clientData.insurancePolicyNumber) {
      throw new Error('No insurance information on file');
    }

    // Parse name
    const nameParts = clientData.name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];

    // Check eligibility
    const result = await this.checkEligibility({
      memberId: clientData.insurancePolicyNumber,
      dateOfBirth: clientData.dob,
      firstName,
      lastName,
      providerNpi: '1234567890', // Default NPI - should be replaced with actual provider NPI
    });

    // Cache the result (valid for 24 hours)
    await this.cacheVerification(clientId, result);

    return result;
  }

  /**
   * Get cached verification if not expired
   */
  private async getCachedVerification(clientId: number): Promise<EligibilityResponse | null> {
    const cached = await db
      .select()
      .from(schema.insuranceVerificationCache)
      .where(
        and(
          eq(schema.insuranceVerificationCache.clientId, clientId),
          gt(schema.insuranceVerificationCache.expiresAt, new Date())
        )
      )
      .orderBy(schema.insuranceVerificationCache.verifiedAt)
      .limit(1);

    if (!cached.length) {
      return null;
    }

    const record = cached[0];
    return {
      eligibilityStatus: record.eligibilityStatus || 'unknown',
      coverageLevel: record.coverageLevel || 'unknown',
      copay: record.copayAmount ? record.copayAmount / 100 : undefined,
      deductible: record.deductible ? record.deductible / 100 : undefined,
      deductibleMet: record.deductibleMet ? record.deductibleMet / 100 : undefined,
      coinsurance: record.coinsurance || undefined,
      planDetails: record.responseData ? JSON.parse(record.responseData) : undefined,
    };
  }

  /**
   * Cache verification result
   */
  private async cacheVerification(clientId: number, result: EligibilityResponse): Promise<void> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(schema.insuranceVerificationCache).values({
      clientId,
      eligibilityStatus: result.eligibilityStatus,
      coverageLevel: result.coverageLevel,
      copayAmount: result.copay ? Math.round(result.copay * 100) : null,
      deductible: result.deductible ? Math.round(result.deductible * 100) : null,
      deductibleMet: result.deductibleMet ? Math.round(result.deductibleMet * 100) : null,
      coinsurance: result.coinsurance || null,
      responseData: JSON.stringify(result.planDetails),
      expiresAt,
    });
  }

  /**
   * Parse copay from Availity response
   */
  private parseCopay(data: any): number | undefined {
    try {
      const benefits = data.planInformation?.benefits || [];
      const copayBenefit = benefits.find((b: any) => b.code === 'B' && b.coverageLevel === '30');
      if (copayBenefit && copayBenefit.amount) {
        return parseFloat(copayBenefit.amount);
      }
    } catch (error) {
      console.warn('[Availity] Error parsing copay:', error);
    }
    return undefined;
  }

  /**
   * Parse deductible from Availity response
   */
  private parseDeductible(data: any): number | undefined {
    try {
      const benefits = data.planInformation?.benefits || [];
      const deductibleBenefit = benefits.find((b: any) => b.code === 'C' && b.coverageLevel === '30');
      if (deductibleBenefit && deductibleBenefit.amount) {
        return parseFloat(deductibleBenefit.amount);
      }
    } catch (error) {
      console.warn('[Availity] Error parsing deductible:', error);
    }
    return undefined;
  }

  /**
   * Parse deductible met from Availity response
   */
  private parseDeductibleMet(data: any): number | undefined {
    try {
      const benefits = data.planInformation?.benefits || [];
      const deductibleMetBenefit = benefits.find((b: any) => b.code === 'C' && b.coverageLevel === '30');
      if (deductibleMetBenefit && deductibleMetBenefit.amountMet) {
        return parseFloat(deductibleMetBenefit.amountMet);
      }
    } catch (error) {
      console.warn('[Availity] Error parsing deductible met:', error);
    }
    return undefined;
  }

  /**
   * Parse coinsurance from Availity response
   */
  private parseCoinsurance(data: any): number | undefined {
    try {
      const benefits = data.planInformation?.benefits || [];
      const coinsuranceBenefit = benefits.find((b: any) => b.code === 'A' && b.coverageLevel === '30');
      if (coinsuranceBenefit && coinsuranceBenefit.percent) {
        return parseFloat(coinsuranceBenefit.percent);
      }
    } catch (error) {
      console.warn('[Availity] Error parsing coinsurance:', error);
    }
    return undefined;
  }

  /**
   * Check if insurance is in-network
   */
  isInNetwork(insuranceCompany: string): boolean {
    const inNetworkCompanies = ['aetna', 'florida blue', 'bcbs', 'blue cross', 'cigna', 'medicare', 'tricare'];

    return inNetworkCompanies.some((company) =>
      insuranceCompany.toLowerCase().includes(company)
    );
  }

  /**
   * Check if insurance is accepted (no HMOs or Medicaid)
   */
  isAccepted(insuranceCompany: string, planType?: string): boolean {
    const insuranceLower = insuranceCompany.toLowerCase();

    // Reject HMOs and Medicaid
    if (insuranceLower.includes('hmo') || insuranceLower.includes('medicaid')) {
      return false;
    }

    // Check if in-network
    return this.isInNetwork(insuranceCompany);
  }
}