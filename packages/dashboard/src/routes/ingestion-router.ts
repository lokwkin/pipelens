import { Router } from 'express';
import { PipelineMeta } from 'pipelens';
import { StorageAdapter } from '../storage/storage-adapter';

/**
 * Creates and returns a router for log ingestion from applications using lib-ts
 * These routes are used by the ApiStorageAdapter to send logs to the dashboard
 */
export function setupIngestionRouter(storageAdapter: StorageAdapter): Router {
  const router = Router();

  // Initiate a pipeline run
  router.post('/pipeline/start', async (req, res) => {
    try {
      const pipelineMeta: PipelineMeta = req.body;

      if (!pipelineMeta || !pipelineMeta.runId || !pipelineMeta.name) {
        res.status(400).json({ error: 'Invalid pipeline data. Required fields: runId, name' });
        return;
      }

      await storageAdapter.initiateRun(pipelineMeta);
      res.status(201).json({ success: true, runId: pipelineMeta.runId });
    } catch (error) {
      console.error('Error initiating pipeline run:', error);
      res.status(500).json({ error: 'Failed to initiate pipeline run' });
    }
  });

  // Finish a pipeline run
  router.post('/pipeline/finish', async (req, res) => {
    try {
      const { pipelineMeta, status } = req.body;

      if (!pipelineMeta || !pipelineMeta.runId || !status) {
        res.status(400).json({
          error: 'Invalid request. Required fields: pipelineMeta (with runId), status',
        });
        return;
      }

      await storageAdapter.finishRun(pipelineMeta, status);
      res.json({ success: true });
    } catch (error) {
      console.error('Error finishing pipeline run:', error);
      res.status(500).json({ error: 'Failed to finish pipeline run' });
    }
  });

  // Record a step start
  router.post('/step/start', async (req, res) => {
    try {
      const { runId, step } = req.body;

      if (!runId || !step || !step.key) {
        res.status(400).json({
          error: 'Invalid request. Required fields: runId, step (with key)',
        });
        return;
      }

      await storageAdapter.initiateStep(runId, step);
      res.status(201).json({ success: true });
    } catch (error) {
      console.error('Error initiating step:', error);
      res.status(500).json({ error: 'Failed to initiate step' });
    }
  });

  // Record a step finish
  router.post('/step/finish', async (req, res) => {
    try {
      const { runId, step } = req.body;

      if (!runId || !step || !step.key) {
        res.status(400).json({
          error: 'Invalid request. Required fields: runId, step (with key)',
        });
        return;
      }

      await storageAdapter.finishStep(runId, step);
      res.json({ success: true });
    } catch (error) {
      console.error('Error finishing step:', error);
      res.status(500).json({ error: 'Failed to finish step' });
    }
  });

  // Batch log submission - for efficient network usage
  router.post('/batch', async (req, res) => {
    try {
      const events = req.body;

      if (!Array.isArray(events)) {
        res.status(400).json({
          error: 'Invalid batch request. Expected an array of events',
        });
        return;
      }

      for (const event of events) {
        if (event.type === 'pipeline') {
          if (event.operation === 'start') {
            await storageAdapter.initiateRun(event.meta);
          } else if (event.operation === 'finish') {
            await storageAdapter.finishRun(event.meta, event.status);
          }
        } else if (event.type === 'step') {
          if (event.operation === 'start') {
            await storageAdapter.initiateStep(event.runId, event.step);
          } else if (event.operation === 'finish') {
            await storageAdapter.finishStep(event.runId, event.step);
          }
        } else {
          console.warn(`Unknown event type in batch: ${JSON.stringify(event)}`);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error processing batch log:', error);
      res.status(500).json({ error: 'Failed to process batch log' });
    }
  });

  return router;
}
