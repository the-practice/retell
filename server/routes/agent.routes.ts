import { Router, Request, Response } from 'express';
import { RetellService } from '../services/retell.service';
import { db, schema } from '../db';

const router = Router();
const retellService = new RetellService();

/**
 * Create or update Retell agent
 */
router.post('/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const tools = RetellService.defineTools(baseUrl);

    const agent = await retellService.createAgent(tools);

    res.json({
      success: true,
      agent: {
        id: agent.agent_id,
        name: agent.agent_name,
      },
    });
  } catch (error: any) {
    console.error('[Agent Routes] Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

/**
 * Get agent details
 */
router.get('/agents/:agentId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const agent = await retellService.getAgent(agentId);

    res.json({
      success: true,
      agent,
    });
  } catch (error: any) {
    console.error('[Agent Routes] Error fetching agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

/**
 * Create web call session
 */
router.post('/agents/:agentId/authorize', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const { metadata } = req.body;

    const webCall = await retellService.createWebCall(agentId, metadata);

    // Log call initiation
    await db.insert(schema.voiceCalls).values({
      retellCallId: webCall.call_id,
      retellAgentId: agentId,
      phoneNumber: metadata?.phoneNumber || null,
      status: 'initiated',
    });

    res.json({
      success: true,
      callId: webCall.call_id,
      accessToken: webCall.access_token,
      sampleRate: webCall.sample_rate,
    });
  } catch (error: any) {
    console.error('[Agent Routes] Error creating web call:', error);
    res.status(500).json({ error: 'Failed to create web call session' });
  }
});

/**
 * Get call details
 */
router.get('/calls/:callId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { callId } = req.params;

    // Get from Retell
    const retellCall = await retellService.getCall(callId);

    // Get from local DB
    const localCalls = await db
      .select()
      .from(schema.voiceCalls)
      .where(schema.voiceCalls.retellCallId === callId)
      .limit(1);

    res.json({
      success: true,
      call: {
        ...retellCall,
        local: localCalls[0] || null,
      },
    });
  } catch (error: any) {
    console.error('[Agent Routes] Error fetching call:', error);
    res.status(500).json({ error: 'Failed to fetch call details' });
  }
});

/**
 * List recent calls
 */
router.get('/calls', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const calls = await db
      .select()
      .from(schema.voiceCalls)
      .orderBy(schema.voiceCalls.createdAt)
      .limit(limit);

    res.json({
      success: true,
      calls,
    });
  } catch (error: any) {
    console.error('[Agent Routes] Error listing calls:', error);
    res.status(500).json({ error: 'Failed to list calls' });
  }
});

/**
 * Webhook endpoint for Retell call events
 */
router.post('/webhooks/retell', async (req: Request, res: Response): Promise<void> => {
  try {
    const event = req.body;

    console.log('[Agent Routes] Retell webhook event:', event.event);

    // Update call record based on event
    if (event.call_id) {
      const updates: any = {};

      switch (event.event) {
        case 'call_started':
          updates.status = 'in_progress';
          updates.startedAt = new Date();
          break;
        case 'call_ended':
          updates.status = 'completed';
          updates.endedAt = new Date();
          updates.duration = event.call_duration;
          updates.transcript = event.transcript;
          break;
        case 'call_analyzed':
          updates.summary = event.call_summary;
          break;
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(schema.voiceCalls)
          .set(updates)
          .where(schema.voiceCalls.retellCallId === event.call_id);
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Agent Routes] Error handling webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;