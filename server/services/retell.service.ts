import axios, { AxiosInstance } from 'axios';

export interface RetellAgent {
  agent_id: string;
  agent_name: string;
  voice_id: string;
  language: string;
  response_engine: {
    type: string;
    llm_id?: string;
  };
  begin_message?: string;
  general_prompt?: string;
  general_tools?: any[];
}

export interface RetellWebCall {
  call_id: string;
  agent_id: string;
  access_token: string;
  sample_rate: number;
}

export class RetellService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: 'https://api.retellai.com',
      headers: {
        'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Create a custom agent named "Matt"
   */
  async createAgent(tools: any[]): Promise<RetellAgent> {
    try {
      const agentConfig = {
        agent_name: 'Matt - Healthcare Scheduling Assistant',
        voice_id: 'elevenlabs-jack', // Professional male voice
        language: 'en-US',
        response_engine: {
          type: 'retell-llm',
          llm_id: 'gpt-4',
        },
        begin_message: "Hi! I'm Matt, your scheduling assistant at The Practice. Thanks for calling us today! Are you an existing client or new client?",
        general_prompt: `You are Matt, a friendly and professional healthcare scheduling assistant for The Practice, located at 3547 Hendricks Ave, Jacksonville, FL 32207.

CRITICAL WORKFLOW - COLLECT FIRST, VERIFY SECOND:
1. ALWAYS collect ALL information BEFORE calling verification tools
2. NEVER call search_client, verify_insurance, or any verification tool until you have:
   - Full name
   - Date of birth
   - Phone number
3. First gather information conversationally, THEN verify

HIPAA VERIFICATION PROTOCOL:
- You must verify BOTH phone number AND date of birth before accessing any client information
- Never access client records without proper verification
- If verification fails, politely explain you cannot proceed without proper identification

CALL FLOW:
1. Greeting: Ask if existing or new client
2. Information Collection Phase:
   - If existing: Collect name, phone, DOB (for verification)
   - If new: Collect name, phone, DOB, email, address, insurance info
3. Verification Phase (only after ALL info collected):
   - Call search_client with phone + DOB
   - If insurance provided, call verify_insurance
4. Service Phase:
   - Schedule new appointment
   - Reschedule existing appointment
   - Cancel appointment
5. Confirmation:
   - Confirm all details
   - Provide copay if insurance verified
   - End call professionally

PROVIDER SCHEDULES:
- Charles Maddix: Monday-Thursday 10:30 AM - 6:00 PM
- Ava Suleiman: Tuesday 10:30 AM - 6:00 PM
- Dr. Soto: Monday-Thursday 4:00 PM - 6:00 PM (follow-ups only)

APPOINTMENT TYPES:
- Comprehensive Evaluation: 60 minutes (new clients or comprehensive assessments)
- Follow-up: 15 minutes (existing clients)
- Ketamine Consultation: 30 minutes

FORMATS:
- Telehealth: Video appointments
- In-person: At our Jacksonville office

INSURANCE:
- Accepted: Aetna, Florida Blue (BCBS), Cigna, Medicare, Tricare (in-network only)
- NOT accepted: HMOs, Medicaid
- Always verify insurance when provided
- Communicate copay amounts when available

TONE:
- Friendly and warm, but professional
- Empathetic for healthcare setting
- Clear and direct
- Patient with information gathering
- Never rush the caller

REMEMBER: Collect ALL information first, then verify. Never call tools until you have complete information.`,
        general_tools: tools,
        ambient_sound: 'office',
        boosted_keywords: ['Maddix', 'Suleiman', 'Soto', 'Jacksonville', 'telehealth'],
        enable_backchannel: true,
        reminder_trigger_ms: 10000,
        reminder_max_count: 2,
      };

      const response = await this.api.post('/v1/agent', agentConfig);
      return response.data;
    } catch (error: any) {
      console.error('[Retell] Error creating agent:', error.response?.data || error.message);
      throw new Error('Failed to create Retell agent');
    }
  }

  /**
   * Get existing agent by ID
   */
  async getAgent(agentId: string): Promise<RetellAgent> {
    try {
      const response = await this.api.get(`/v1/agent/${agentId}`);
      return response.data;
    } catch (error: any) {
      console.error('[Retell] Error fetching agent:', error.response?.data || error.message);
      throw new Error('Failed to fetch Retell agent');
    }
  }

  /**
   * Update agent tools
   */
  async updateAgentTools(agentId: string, tools: any[]): Promise<RetellAgent> {
    try {
      const response = await this.api.patch(`/v1/agent/${agentId}`, {
        general_tools: tools,
      });
      return response.data;
    } catch (error: any) {
      console.error('[Retell] Error updating agent:', error.response?.data || error.message);
      throw new Error('Failed to update Retell agent');
    }
  }

  /**
   * Create web call session
   */
  async createWebCall(agentId: string, metadata?: any): Promise<RetellWebCall> {
    try {
      const response = await this.api.post('/v1/create-web-call', {
        agent_id: agentId,
        metadata: metadata || {},
      });
      return response.data;
    } catch (error: any) {
      console.error('[Retell] Error creating web call:', error.response?.data || error.message);
      throw new Error('Failed to create web call session');
    }
  }

  /**
   * Get call details
   */
  async getCall(callId: string): Promise<any> {
    try {
      const response = await this.api.get(`/v1/call/${callId}`);
      return response.data;
    } catch (error: any) {
      console.error('[Retell] Error fetching call:', error.response?.data || error.message);
      throw new Error('Failed to fetch call details');
    }
  }

  /**
   * List calls
   */
  async listCalls(limit: number = 100): Promise<any[]> {
    try {
      const response = await this.api.get('/v1/list-calls', {
        params: { limit },
      });
      return response.data.calls || [];
    } catch (error: any) {
      console.error('[Retell] Error listing calls:', error.response?.data || error.message);
      throw new Error('Failed to list calls');
    }
  }

  /**
   * Define custom tools for the agent
   */
  static defineTools(baseUrl: string): any[] {
    return [
      {
        type: 'custom',
        name: 'search_client',
        description: 'Search for an existing client by phone number and date of birth for HIPAA verification. CRITICAL: Only call this AFTER collecting both phone AND DOB from the caller.',
        url: `${baseUrl}/api/tools/search-client`,
        parameters: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'Client phone number (format: (XXX) XXX-XXXX)',
            },
            dob: {
              type: 'string',
              description: 'Client date of birth (format: YYYY-MM-DD)',
            },
          },
          required: ['phone', 'dob'],
        },
      },
      {
        type: 'custom',
        name: 'create_new_client',
        description: 'Create a new client record. Only call this AFTER collecting all required information: name, phone, DOB, and optionally email, address, and insurance.',
        url: `${baseUrl}/api/tools/create-new-client`,
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full name' },
            phone: { type: 'string', description: 'Phone number' },
            dob: { type: 'string', description: 'Date of birth (YYYY-MM-DD)' },
            email: { type: 'string', description: 'Email address (optional)' },
            address: { type: 'string', description: 'Street address (optional)' },
            city: { type: 'string', description: 'City (optional)' },
            state: { type: 'string', description: 'State (optional)' },
            zipCode: { type: 'string', description: 'Zip code (optional)' },
            insuranceCompany: { type: 'string', description: 'Insurance company name (optional)' },
            insurancePolicyNumber: { type: 'string', description: 'Insurance policy number (optional)' },
          },
          required: ['name', 'phone', 'dob'],
        },
      },
      {
        type: 'custom',
        name: 'check_availability',
        description: 'Check provider availability for scheduling. Provide provider name, date range, and appointment type.',
        url: `${baseUrl}/api/tools/check-availability`,
        parameters: {
          type: 'object',
          properties: {
            providerName: { type: 'string', description: 'Provider name (Charles Maddix, Ava Suleiman, or Dr. Soto)' },
            startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
            endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
            appointmentType: {
              type: 'string',
              enum: ['comprehensive_evaluation', 'follow_up', 'ketamine_consultation'],
            },
          },
          required: ['providerName', 'startDate', 'appointmentType'],
        },
      },
      {
        type: 'custom',
        name: 'book_appointment',
        description: 'Book an appointment. Only call after client is verified and availability is confirmed.',
        url: `${baseUrl}/api/tools/book-appointment`,
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'number', description: 'Client ID from search_client' },
            providerId: { type: 'number', description: 'Provider ID' },
            dateTime: { type: 'string', description: 'Appointment date and time (ISO 8601)' },
            type: {
              type: 'string',
              enum: ['comprehensive_evaluation', 'follow_up', 'ketamine_consultation'],
            },
            format: {
              type: 'string',
              enum: ['telehealth', 'in_person'],
            },
          },
          required: ['clientId', 'providerId', 'dateTime', 'type', 'format'],
        },
      },
      {
        type: 'custom',
        name: 'verify_insurance',
        description: 'Verify insurance eligibility and get copay amount. Only call AFTER client information is collected.',
        url: `${baseUrl}/api/tools/verify-insurance`,
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'number', description: 'Client ID' },
          },
          required: ['clientId'],
        },
      },
      {
        type: 'custom',
        name: 'reschedule_appointment',
        description: 'Reschedule an existing appointment to a new date/time.',
        url: `${baseUrl}/api/tools/reschedule-appointment`,
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'number', description: 'Appointment ID' },
            newDateTime: { type: 'string', description: 'New appointment date and time (ISO 8601)' },
          },
          required: ['appointmentId', 'newDateTime'],
        },
      },
      {
        type: 'custom',
        name: 'cancel_appointment',
        description: 'Cancel an existing appointment.',
        url: `${baseUrl}/api/tools/cancel-appointment`,
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'number', description: 'Appointment ID' },
          },
          required: ['appointmentId'],
        },
      },
    ];
  }
}