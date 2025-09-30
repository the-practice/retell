import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import toolsRoutes from './routes/tools.routes';
import agentRoutes from './routes/agent.routes';
import { CacheService } from './services/cache.service';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/tools', toolsRoutes);
app.use('/api', agentRoutes);

// Cache stats endpoint
const cacheService = new CacheService();
app.get('/api/cache/stats', async (req, res) => {
  try {
    const stats = await cacheService.getCacheStats();
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Retry failed syncs endpoint
app.post('/api/cache/retry-failed', async (req, res) => {
  try {
    await cacheService.retryFailedSyncs();
    res.json({ success: true, message: 'Failed syncs reset to pending' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retry syncs' });
  }
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] Healthcare Scheduling API running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start background sync job
  cacheService.startSyncJob();
  console.log('[Server] Background cache sync job started');
});

export default app;