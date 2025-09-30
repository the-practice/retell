import { Router, Request, Response } from 'express';
import { db, schema } from '../db';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { CacheService } from '../services/cache.service';
import { AvailityService } from '../services/availity.service';
import { IntakeQService } from '../services/intakeq.service';

const router = Router();
const cacheService = new CacheService();
const availityService = new AvailityService();
const intakeqService = new IntakeQService();

/**
 * Search for existing client (HIPAA verification)
 */
router.post('/search-client', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, dob } = req.body;

    if (!phone || !dob) {
      res.status(400).json({ error: 'Phone and date of birth required for verification' });
      return;
    }

    // Search local database
    const clients = await db
      .select()
      .from(schema.clients)
      .where(and(eq(schema.clients.phone, phone), eq(schema.clients.dob, dob)))
      .limit(1);

    if (clients.length === 0) {
      res.status(404).json({ error: 'No client found with provided phone and date of birth' });
      return;
    }

    const client = clients[0];

    // Update verification status
    await db
      .update(schema.clients)
      .set({ phoneVerified: true, dobVerified: true })
      .where(eq(schema.clients.id, client.id));

    // Get recent appointments
    const appointments = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.clientId, client.id))
      .orderBy(schema.appointments.dateTime)
      .limit(5);

    res.json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        insuranceCompany: client.insuranceCompany,
        hasInsurance: !!client.insurancePolicyNumber,
      },
      recentAppointments: appointments.map((apt) => ({
        id: apt.id,
        dateTime: apt.dateTime,
        type: apt.type,
        format: apt.format,
        status: apt.status,
      })),
    });
  } catch (error: any) {
    console.error('[Tools] Error searching client:', error);
    res.status(500).json({ error: 'Failed to search client' });
  }
});

/**
 * Create new client
 */
router.post('/create-new-client', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      phone,
      dob,
      email,
      address,
      city,
      state,
      zipCode,
      insuranceCompany,
      insurancePolicyNumber,
      insuranceGroupNumber,
      insuranceHolderName,
      insuranceHolderDob,
      insuranceHolderRelation,
    } = req.body;

    if (!name || !phone || !dob) {
      res.status(400).json({ error: 'Name, phone, and date of birth are required' });
      return;
    }

    // Check if client already exists
    const existing = await db
      .select()
      .from(schema.clients)
      .where(and(eq(schema.clients.phone, phone), eq(schema.clients.dob, dob)))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: 'Client already exists', client: existing[0] });
      return;
    }

    // Create client locally
    const [newClient] = await db
      .insert(schema.clients)
      .values({
        name,
        phone,
        dob,
        email: email || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        insuranceCompany: insuranceCompany || null,
        insurancePolicyNumber: insurancePolicyNumber || null,
        insuranceGroupNumber: insuranceGroupNumber || null,
        insuranceHolderName: insuranceHolderName || null,
        insuranceHolderDob: insuranceHolderDob || null,
        insuranceHolderRelation: insuranceHolderRelation || null,
        phoneVerified: true,
        dobVerified: true,
      })
      .returning();

    // Async sync to IntakeQ (non-blocking)
    intakeqService
      .createClient({
        Name: name,
        Phone: phone,
        DateOfBirth: dob,
        Email: email,
        Address: address,
        City: city,
        State: state,
        PostalCode: zipCode,
      })
      .then(async (intakeqClient) => {
        await db
          .update(schema.clients)
          .set({ intakeqId: intakeqClient.Id })
          .where(eq(schema.clients.id, newClient.id));
        console.log(`[Tools] Synced new client ${newClient.id} to IntakeQ`);
      })
      .catch((error) => {
        console.error('[Tools] Failed to sync client to IntakeQ:', error);
      });

    res.json({
      success: true,
      client: {
        id: newClient.id,
        name: newClient.name,
        phone: newClient.phone,
        email: newClient.email,
        hasInsurance: !!insurancePolicyNumber,
      },
    });
  } catch (error: any) {
    console.error('[Tools] Error creating client:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

/**
 * Check provider availability
 */
router.post('/check-availability', async (req: Request, res: Response): Promise<void> => {
  try {
    const { providerName, startDate, endDate, appointmentType } = req.body;

    if (!providerName || !startDate || !appointmentType) {
      res.status(400).json({ error: 'Provider name, start date, and appointment type required' });
      return;
    }

    // Get provider
    const providers = await db
      .select()
      .from(schema.providers)
      .where(eq(schema.providers.name, providerName))
      .limit(1);

    if (providers.length === 0) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    const provider = providers[0];

    // Check if provider can handle this appointment type
    const providerAppointmentTypes = JSON.parse(provider.appointmentTypes);
    if (!providerAppointmentTypes.includes(appointmentType)) {
      res.status(400).json({ error: `${providerName} does not offer ${appointmentType} appointments` });
      return;
    }

    // Get existing appointments
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

    const existingAppointments = await db
      .select()
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.providerId, provider.id),
          gte(schema.appointments.dateTime, start),
          lte(schema.appointments.dateTime, end)
        )
      );

    // Parse working hours
    const workingHours = JSON.parse(provider.workingHours);

    // Generate available slots (simplified - should be more sophisticated)
    const availableSlots = generateAvailableSlots(workingHours, existingAppointments, start, end, appointmentType);

    res.json({
      success: true,
      provider: {
        id: provider.id,
        name: provider.name,
      },
      availableSlots: availableSlots.slice(0, 10), // Return first 10 slots
      message: availableSlots.length > 0 ? `Found ${availableSlots.length} available slots` : 'No availability found for this date range',
    });
  } catch (error: any) {
    console.error('[Tools] Error checking availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

/**
 * Book appointment (write-behind cache)
 */
router.post('/book-appointment', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const { clientId, providerId, dateTime, type, format } = req.body;

    if (!clientId || !providerId || !dateTime || !type || !format) {
      res.status(400).json({ error: 'All appointment fields required' });
      return;
    }

    // Get duration based on type
    const durations: Record<string, number> = {
      comprehensive_evaluation: 60,
      follow_up: 15,
      ketamine_consultation: 30,
    };
    const duration = durations[type] || 60;

    // Create appointment in local database (FAST)
    const [appointment] = await db
      .insert(schema.appointments)
      .values({
        clientId,
        providerId,
        dateTime: new Date(dateTime),
        duration,
        type,
        format,
        status: 'scheduled',
      })
      .returning();

    // Write to cache for async IntakeQ sync
    const payload = {
      ClientId: clientId,
      ProviderId: providerId,
      DateTime: dateTime,
      Duration: duration,
      ServiceName: type.replace('_', ' '),
    };

    await cacheService.cacheAppointment(appointment.id, payload);

    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      appointment: {
        id: appointment.id,
        dateTime: appointment.dateTime,
        type: appointment.type,
        format: appointment.format,
        duration: appointment.duration,
      },
      message: 'Appointment booked successfully',
      responseTime: `${responseTime}ms`,
    });
  } catch (error: any) {
    console.error('[Tools] Error booking appointment:', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

/**
 * Verify insurance
 */
router.post('/verify-insurance', async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      res.status(400).json({ error: 'Client ID required' });
      return;
    }

    // Get client
    const clients = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId)).limit(1);

    if (clients.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const client = clients[0];

    if (!client.insuranceCompany || !client.insurancePolicyNumber) {
      res.status(400).json({ error: 'No insurance information on file' });
      return;
    }

    // Check if insurance is accepted
    if (!availityService.isAccepted(client.insuranceCompany)) {
      res.json({
        success: false,
        message: `We do not accept ${client.insuranceCompany}. We are in-network with Aetna, Florida Blue, Cigna, Medicare, and Tricare only. HMOs and Medicaid are not accepted.`,
      });
      return;
    }

    // Verify eligibility
    const verification = await availityService.verifyClientInsurance(clientId);

    res.json({
      success: true,
      eligibilityStatus: verification.eligibilityStatus,
      coverageLevel: verification.coverageLevel,
      copay: verification.copay,
      deductible: verification.deductible,
      coinsurance: verification.coinsurance,
      message: verification.copay
        ? `Your copay for this visit is $${verification.copay.toFixed(2)}`
        : 'Insurance verified successfully',
    });
  } catch (error: any) {
    console.error('[Tools] Error verifying insurance:', error);
    res.status(500).json({ error: 'Failed to verify insurance', message: error.message });
  }
});

/**
 * Reschedule appointment
 */
router.post('/reschedule-appointment', async (req: Request, res: Response): Promise<void> => {
  try {
    const { appointmentId, newDateTime } = req.body;

    if (!appointmentId || !newDateTime) {
      res.status(400).json({ error: 'Appointment ID and new date/time required' });
      return;
    }

    // Update appointment
    const [updated] = await db
      .update(schema.appointments)
      .set({
        dateTime: new Date(newDateTime),
        status: 'rescheduled',
        updatedAt: new Date(),
      })
      .where(eq(schema.appointments.id, appointmentId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    // Async sync to IntakeQ
    if (updated.intakeqId) {
      intakeqService
        .updateAppointment(updated.intakeqId, {
          DateTime: newDateTime,
        })
        .catch((error) => {
          console.error('[Tools] Failed to sync reschedule to IntakeQ:', error);
        });
    }

    res.json({
      success: true,
      appointment: {
        id: updated.id,
        dateTime: updated.dateTime,
        type: updated.type,
        format: updated.format,
      },
      message: 'Appointment rescheduled successfully',
    });
  } catch (error: any) {
    console.error('[Tools] Error rescheduling appointment:', error);
    res.status(500).json({ error: 'Failed to reschedule appointment' });
  }
});

/**
 * Cancel appointment
 */
router.post('/cancel-appointment', async (req: Request, res: Response): Promise<void> => {
  try {
    const { appointmentId } = req.body;

    if (!appointmentId) {
      res.status(400).json({ error: 'Appointment ID required' });
      return;
    }

    // Update appointment status
    const [cancelled] = await db
      .update(schema.appointments)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(schema.appointments.id, appointmentId))
      .returning();

    if (!cancelled) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    // Async sync to IntakeQ
    if (cancelled.intakeqId) {
      intakeqService.cancelAppointment(cancelled.intakeqId).catch((error) => {
        console.error('[Tools] Failed to sync cancellation to IntakeQ:', error);
      });
    }

    res.json({
      success: true,
      message: 'Appointment cancelled successfully',
    });
  } catch (error: any) {
    console.error('[Tools] Error cancelling appointment:', error);
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

/**
 * Helper: Generate available slots
 */
function generateAvailableSlots(
  workingHours: any,
  existingAppointments: any[],
  startDate: Date,
  endDate: Date,
  appointmentType: string
): string[] {
  const slots: string[] = [];
  const durations: Record<string, number> = {
    comprehensive_evaluation: 60,
    follow_up: 15,
    ketamine_consultation: 30,
  };
  const slotDuration = durations[appointmentType] || 60;

  const current = new Date(startDate);
  while (current <= endDate) {
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][current.getDay()];
    const dayHours = workingHours[dayName];

    if (dayHours) {
      const [startHour, startMin] = dayHours.start.split(':').map(Number);
      const [endHour, endMin] = dayHours.end.split(':').map(Number);

      const dayStart = new Date(current);
      dayStart.setHours(startHour, startMin, 0, 0);

      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, endMin, 0, 0);

      const slotTime = new Date(dayStart);
      while (slotTime < dayEnd) {
        const slotEnd = new Date(slotTime.getTime() + slotDuration * 60000);

        // Check if slot conflicts with existing appointments
        const hasConflict = existingAppointments.some((apt) => {
          const aptStart = new Date(apt.dateTime);
          const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
          return (slotTime < aptEnd && slotEnd > aptStart);
        });

        if (!hasConflict && slotTime > new Date()) {
          slots.push(slotTime.toISOString());
        }

        slotTime.setMinutes(slotTime.getMinutes() + 15); // 15-minute increments
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

export default router;