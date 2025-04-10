import { Request, Response, Router } from 'express';
import { PipelineMeta, StepMeta } from 'steps-track';
import { StorageAdapter } from '../storage/storage-adapter';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

/**
 * Creates and returns a router for log ingestion from applications using lib-ts
 * These routes are used by the ApiStorageAdapter to send logs to the dashboard
 */
export function setupIngestionRouter(storageAdapter: StorageAdapter, upload: multer.Multer): Router {
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
      const { pipeline, steps } = req.body;

      if (!pipeline || !Array.isArray(steps)) {
        res.status(400).json({
          error: 'Invalid batch request. Required fields: pipeline, steps (array)',
        });
        return;
      }

      // Process pipeline
      if (pipeline.operation === 'start') {
        await storageAdapter.initiateRun(pipeline.meta);
      } else if (pipeline.operation === 'finish') {
        await storageAdapter.finishRun(pipeline.meta, pipeline.status);
      }

      // Process steps
      for (const stepEntry of steps) {
        if (stepEntry.operation === 'start') {
          await storageAdapter.initiateStep(pipeline.meta.runId, stepEntry.step);
        } else if (stepEntry.operation === 'finish') {
          await storageAdapter.finishStep(pipeline.meta.runId, stepEntry.step);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error processing batch log:', error);
      res.status(500).json({ error: 'Failed to process batch log' });
    }
  });

  // Upload endpoint for steps files (handles both single and multiple files)
  router.post('/upload', upload.array('stepsFiles', 10), (req: Request, res: Response) => {
    try {
      const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];

      if (files.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      const results: Array<{ filename: string; success: boolean; message: string; data?: any }> = [];

      // Process each file
      for (const file of files) {
        try {
          // Process the in-memory file buffer
          const data = file.buffer.toString('utf8');
          const jsonData = JSON.parse(data) as PipelineMeta;

          const importedPipelineMeta = _importFromPipelineOutput(jsonData, storageAdapter);

          // Add success result
          results.push({
            filename: file.originalname,
            success: true,
            message: `Successfully imported data from file ${file.originalname} (Run ID: ${importedPipelineMeta.runId}, total steps: ${importedPipelineMeta.steps?.length || 0})`,
            data: {
              runId: importedPipelineMeta.runId,
              startTime: importedPipelineMeta.time?.startTs,
              endTime: importedPipelineMeta.time?.endTs,
              stepCount: importedPipelineMeta.steps?.length || 0,
            },
          });
        } catch (parseError) {
          // Add error result
          results.push({
            filename: file.originalname,
            success: false,
            message: parseError instanceof Error ? parseError.message : 'Unknown error',
          });

          console.error(`Error processing file ${file.originalname}:`, parseError);
        }
      }

      // Always return the same format for consistency
      res.json({
        success: true,
        results,
      });
    } catch (error) {
      console.error('Error handling file upload:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process files',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}

function _importFromPipelineOutput(input: any, storageAdapter: StorageAdapter): PipelineMeta {
  let pipelineMeta: PipelineMeta;
  if (input['logVersion'] === undefined) {
    // check if it is from old format
    if (Array.isArray(input) && input[0]?.key && input[0]?.time?.startTs) {
      // construct pipeline meta from old format
      const steps = input as StepMeta[];
      pipelineMeta = {
        logVersion: 0,
        runId: uuidv4(),
        time: steps[0].time,
        name: steps[0].name,
        key: steps[0].key,
        records: steps[0].records || (steps[0] as any)['record'], // backward compatibility
        steps: steps.map((step) => ({ ...step, records: step.records || (step as any)['record'] })) as StepMeta[],
      };
    } else {
      throw new Error('Invalid input');
    }
  } else if (input['logVersion'] === 1) {
    pipelineMeta = input as PipelineMeta;
    // Validate inputs
    if (!pipelineMeta.runId) {
      throw new Error('runId is missing from input');
    }
    if (!pipelineMeta.time?.startTs) {
      throw new Error('startTs is missing from input');
    }
    if (!pipelineMeta.steps) {
      throw new Error('steps is missing from input');
    }
  } else {
    throw new Error('Invalid input');
  }

  for (const step of pipelineMeta.steps) {
    storageAdapter.finishStep(pipelineMeta.runId, step);
  }
  storageAdapter.finishRun(
    pipelineMeta,
    pipelineMeta.time.endTs ? (pipelineMeta.error ? 'failed' : 'completed') : 'running',
  );
  return pipelineMeta;
}
