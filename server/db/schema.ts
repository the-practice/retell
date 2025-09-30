import { pgTable, serial, varchar, timestamp, integer, boolean, text, pgEnum } from 'drizzle-orm/pg-core';

// Enums
export const appointmentStatusEnum = pgEnum('appointment_status', ['scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled']);
export const appointmentFormatEnum = pgEnum('appointment_format', ['telehealth', 'in_person']);
export const appointmentTypeEnum = pgEnum('appointment_type', ['comprehensive_evaluation', 'follow_up', 'ketamine_consultation']);
export const syncStatusEnum = pgEnum('sync_status', ['pending', 'synced', 'failed']);
export const callStatusEnum = pgEnum('call_status', ['initiated', 'ringing', 'in_progress', 'completed', 'failed', 'busy', 'no_answer']);

// Clients table
export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  intakeqId: varchar('intakeq_id', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  dob: varchar('dob', { length: 10 }).notNull(), // Format: YYYY-MM-DD
  email: varchar('email', { length: 255 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 2 }),
  zipCode: varchar('zip_code', { length: 10 }),

  // Insurance details
  insuranceCompany: varchar('insurance_company', { length: 255 }),
  insurancePolicyNumber: varchar('insurance_policy_number', { length: 100 }),
  insuranceGroupNumber: varchar('insurance_group_number', { length: 100 }),
  insuranceHolderName: varchar('insurance_holder_name', { length: 255 }),
  insuranceHolderDob: varchar('insurance_holder_dob', { length: 10 }),
  insuranceHolderRelation: varchar('insurance_holder_relation', { length: 50 }),

  // HIPAA verification
  phoneVerified: boolean('phone_verified').default(false),
  dobVerified: boolean('dob_verified').default(false),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Providers table
export const providers = pgTable('providers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  npi: varchar('npi', { length: 10 }), // National Provider Identifier

  // Working hours (stored as JSON)
  workingHours: text('working_hours').notNull(), // JSON: {monday: {start: '10:30', end: '18:00'}, ...}

  // Appointment types this provider handles
  appointmentTypes: text('appointment_types').notNull(), // JSON array of appointment types

  // Restrictions
  followUpOnly: boolean('follow_up_only').default(false),

  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Appointments table
export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  intakeqId: varchar('intakeq_id', { length: 255 }),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  providerId: integer('provider_id').references(() => providers.id).notNull(),

  dateTime: timestamp('date_time').notNull(),
  duration: integer('duration').notNull(), // in minutes

  type: appointmentTypeEnum('type').notNull(),
  format: appointmentFormatEnum('format').notNull(),
  status: appointmentStatusEnum('status').default('scheduled'),

  // Insurance verification at booking
  insuranceVerified: boolean('insurance_verified').default(false),
  copayAmount: integer('copay_amount'), // in cents

  notes: text('notes'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Voice calls table
export const voiceCalls = pgTable('voice_calls', {
  id: serial('id').primaryKey(),
  retellCallId: varchar('retell_call_id', { length: 255 }),
  retellAgentId: varchar('retell_agent_id', { length: 255 }),

  clientId: integer('client_id').references(() => clients.id),
  phoneNumber: varchar('phone_number', { length: 20 }),

  status: callStatusEnum('status').default('initiated'),
  duration: integer('duration'), // in seconds

  // Call transcript and metadata
  transcript: text('transcript'),
  summary: text('summary'),

  // Appointment created during call
  appointmentId: integer('appointment_id').references(() => appointments.id),

  startedAt: timestamp('started_at').defaultNow(),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Appointment cache for write-behind pattern
export const appointmentCache = pgTable('appointment_cache', {
  id: serial('id').primaryKey(),
  appointmentId: integer('appointment_id').references(() => appointments.id).notNull(),

  // Sync status
  syncStatus: syncStatusEnum('sync_status').default('pending'),
  retryCount: integer('retry_count').default(0),
  lastSyncAttempt: timestamp('last_sync_attempt'),
  errorMessage: text('error_message'),

  // Payload to sync
  payload: text('payload').notNull(), // JSON payload for IntakeQ

  createdAt: timestamp('created_at').defaultNow(),
  syncedAt: timestamp('synced_at'),
});

// Insurance verification cache
export const insuranceVerificationCache = pgTable('insurance_verification_cache', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').references(() => clients.id).notNull(),

  // Availity response
  eligibilityStatus: varchar('eligibility_status', { length: 50 }),
  copayAmount: integer('copay_amount'), // in cents
  deductible: integer('deductible'), // in cents
  deductibleMet: integer('deductible_met'), // in cents
  coinsurance: integer('coinsurance'), // percentage
  coverageLevel: varchar('coverage_level', { length: 50 }),

  // Response metadata
  responseData: text('response_data'), // Full JSON response

  verifiedAt: timestamp('verified_at').defaultNow(),
  expiresAt: timestamp('expires_at'), // Cache for 24 hours
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type VoiceCall = typeof voiceCalls.$inferSelect;
export type NewVoiceCall = typeof voiceCalls.$inferInsert;
export type AppointmentCache = typeof appointmentCache.$inferSelect;
export type NewAppointmentCache = typeof appointmentCache.$inferInsert;
export type InsuranceVerificationCache = typeof insuranceVerificationCache.$inferSelect;
export type NewInsuranceVerificationCache = typeof insuranceVerificationCache.$inferInsert;