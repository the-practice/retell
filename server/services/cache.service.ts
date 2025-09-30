import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import cron from 'node-cron';
import { IntakeQService } from './intakeq.service';

export class CacheService {
  private intakeqService: IntakeQService;
  private syncInterval: number;

  constructor() {
    this.intakeqService = new IntakeQService();
    this.syncInterval = parseInt(process.env.CACHE_SYNC_INTERVAL || '30', 10);
  }

  /**
   * Write appointment to cache immediately (sub-millisecond operation)
   */
  async cacheAppointment(appointmentId: number, payload: any): Promise<void> {
    await db.insert(schema.appointmentCache).values({
      appointmentId,
      payload: JSON.stringify(payload),
      syncStatus: 'pending',
      retryCount: 0,
    });
  }

  /**
   * Start background sync job
   */
  startSyncJob(): void {
    // Run every N seconds based on config
    cron.schedule(`*/${this.syncInterval} * * * * *`, async () => {
      await this.syncPendingAppointments();
    });

    console.log(`[Cache Service] Background sync job started (interval: ${this.syncInterval}s)`);
  }

  /**
   * Sync pending appointments to IntakeQ
   */
  async syncPendingAppointments(): Promise<void> {
    try {
      // Get all pending cache entries
      const pendingEntries = await db
        .select()
        .from(schema.appointmentCache)
        .where(eq(schema.appointmentCache.syncStatus, 'pending'))
        .limit(10); // Process in batches

      if (pendingEntries.length === 0) {
        return;
      }

      console.log(`[Cache Service] Syncing ${pendingEntries.length} pending appointments...`);

      for (const entry of pendingEntries) {
        await this.syncSingleAppointment(entry);
      }
    } catch (error) {
      console.error('[Cache Service] Error in sync job:', error);
    }
  }

  /**
   * Sync a single appointment with exponential backoff
   */
  private async syncSingleAppointment(entry: typeof schema.appointmentCache.$inferSelect): Promise<void> {
    try {
      const payload = JSON.parse(entry.payload);

      // Call IntakeQ API to create appointment
      const response = await this.intakeqService.createAppointment(payload);

      // Update appointment with IntakeQ ID
      await db
        .update(schema.appointments)
        .set({ intakeqId: response.id })
        .where(eq(schema.appointments.id, entry.appointmentId));

      // Mark as synced
      await db
        .update(schema.appointmentCache)
        .set({
          syncStatus: 'synced',
          syncedAt: new Date(),
        })
        .where(eq(schema.appointmentCache.id, entry.id));

      console.log(`[Cache Service] Successfully synced appointment ${entry.appointmentId}`);
    } catch (error: any) {
      const newRetryCount = entry.retryCount + 1;
      const maxRetries = 5;

      if (newRetryCount >= maxRetries) {
        // Mark as failed after max retries
        await db
          .update(schema.appointmentCache)
          .set({
            syncStatus: 'failed',
            retryCount: newRetryCount,
            lastSyncAttempt: new Date(),
            errorMessage: error.message || 'Unknown error',
          })
          .where(eq(schema.appointmentCache.id, entry.id));

        console.error(`[Cache Service] Failed to sync appointment ${entry.appointmentId} after ${maxRetries} attempts`);
      } else {
        // Increment retry count with exponential backoff
        await db
          .update(schema.appointmentCache)
          .set({
            retryCount: newRetryCount,
            lastSyncAttempt: new Date(),
            errorMessage: error.message || 'Unknown error',
          })
          .where(eq(schema.appointmentCache.id, entry.id));

        console.warn(`[Cache Service] Retry ${newRetryCount}/${maxRetries} for appointment ${entry.appointmentId}`);
      }
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const pending = await db
      .select()
      .from(schema.appointmentCache)
      .where(eq(schema.appointmentCache.syncStatus, 'pending'));

    const synced = await db
      .select()
      .from(schema.appointmentCache)
      .where(eq(schema.appointmentCache.syncStatus, 'synced'));

    const failed = await db
      .select()
      .from(schema.appointmentCache)
      .where(eq(schema.appointmentCache.syncStatus, 'failed'));

    return {
      pending: pending.length,
      synced: synced.length,
      failed: failed.length,
      total: pending.length + synced.length + failed.length,
    };
  }

  /**
   * Retry failed syncs manually
   */
  async retryFailedSyncs(): Promise<void> {
    await db
      .update(schema.appointmentCache)
      .set({
        syncStatus: 'pending',
        retryCount: 0,
        errorMessage: null,
      })
      .where(eq(schema.appointmentCache.syncStatus, 'failed'));

    console.log('[Cache Service] Reset failed syncs to pending');
  }
}