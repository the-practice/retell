import axios, { AxiosInstance } from 'axios';

export interface IntakeQClient {
  Id: string;
  Name: string;
  Email: string;
  Phone: string;
  DateOfBirth: string;
  Address?: string;
  City?: string;
  State?: string;
  PostalCode?: string;
}

export interface IntakeQAppointment {
  Id: string;
  ClientId: string;
  ProviderId: string;
  DateTime: string;
  Duration: number;
  ServiceName: string;
  Status: string;
}

export class IntakeQService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: 'https://intakeq.com/api/v1',
      headers: {
        'X-Api-Key': process.env.INTAKEQ_API_KEY || '',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Search for clients by phone or email
   */
  async searchClients(query: { phone?: string; email?: string }): Promise<IntakeQClient[]> {
    try {
      const response = await this.api.get('/clients', {
        params: query,
      });
      return response.data;
    } catch (error: any) {
      console.error('[IntakeQ] Error searching clients:', error.response?.data || error.message);
      throw new Error('Failed to search clients in IntakeQ');
    }
  }

  /**
   * Get a single client by ID
   */
  async getClient(clientId: string): Promise<IntakeQClient> {
    try {
      const response = await this.api.get(`/clients/${clientId}`);
      return response.data;
    } catch (error: any) {
      console.error('[IntakeQ] Error fetching client:', error.response?.data || error.message);
      throw new Error('Failed to fetch client from IntakeQ');
    }
  }

  /**
   * Create a new client
   */
  async createClient(clientData: {
    Name: string;
    Email?: string;
    Phone: string;
    DateOfBirth: string;
    Address?: string;
    City?: string;
    State?: string;
    PostalCode?: string;
  }): Promise<IntakeQClient> {
    try {
      const response = await this.api.post('/clients', clientData);
      return response.data;
    } catch (error: any) {
      console.error('[IntakeQ] Error creating client:', error.response?.data || error.message);
      throw new Error('Failed to create client in IntakeQ');
    }
  }

  /**
   * Get appointments for a date range
   */
  async getAppointments(startDate: Date, endDate: Date): Promise<IntakeQAppointment[]> {
    try {
      const response = await this.api.get('/appointments', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('[IntakeQ] Error fetching appointments:', error.response?.data || error.message);
      throw new Error('Failed to fetch appointments from IntakeQ');
    }
  }

  /**
   * Create a new appointment
   */
  async createAppointment(appointmentData: {
    ClientId: string;
    ProviderId: string;
    DateTime: string;
    Duration: number;
    ServiceName: string;
  }): Promise<IntakeQAppointment> {
    try {
      const response = await this.api.post('/appointments', appointmentData);
      return response.data;
    } catch (error: any) {
      console.error('[IntakeQ] Error creating appointment:', error.response?.data || error.message);
      throw new Error('Failed to create appointment in IntakeQ');
    }
  }

  /**
   * Update an appointment
   */
  async updateAppointment(appointmentId: string, updates: Partial<IntakeQAppointment>): Promise<IntakeQAppointment> {
    try {
      const response = await this.api.put(`/appointments/${appointmentId}`, updates);
      return response.data;
    } catch (error: any) {
      console.error('[IntakeQ] Error updating appointment:', error.response?.data || error.message);
      throw new Error('Failed to update appointment in IntakeQ');
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string): Promise<void> {
    try {
      await this.api.delete(`/appointments/${appointmentId}`);
    } catch (error: any) {
      console.error('[IntakeQ] Error cancelling appointment:', error.response?.data || error.message);
      throw new Error('Failed to cancel appointment in IntakeQ');
    }
  }

  /**
   * Get providers
   */
  async getProviders(): Promise<any[]> {
    try {
      const response = await this.api.get('/practitioners');
      return response.data;
    } catch (error: any) {
      console.error('[IntakeQ] Error fetching providers:', error.response?.data || error.message);
      throw new Error('Failed to fetch providers from IntakeQ');
    }
  }

  /**
   * Get provider availability
   */
  async getProviderAvailability(providerId: string, startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const response = await this.api.get(`/practitioners/${providerId}/availability`, {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('[IntakeQ] Error fetching provider availability:', error.response?.data || error.message);
      throw new Error('Failed to fetch provider availability from IntakeQ');
    }
  }
}