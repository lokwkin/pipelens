import express from 'express';
import opener from 'opener';
import path from 'path';
import { StorageAdapter } from '../storage/storage-adapter';

/**
 * Launches a web dashboard to visualize pipeline runs
 * @param storageAdapter The storage adapter instance to fetch data from
 * @param port The port to run the dashboard server on (default: 3000)
 * @returns A promise that resolves when the server is started
 */
export async function launchDashboard(storageAdapter: StorageAdapter, port: number = 3000): Promise<void> {
  const app = express();

  // Serve static files
  app.use(express.static(path.join(__dirname, 'public')));

  // API endpoints
  app.get('/api/pipelines', async (req, res) => {
    try {
      const pipelines = await storageAdapter.listPipelines();
      res.json(pipelines);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/runs/:pipeline', async (req, res) => {
    try {
      const pipelineName = req.params.pipeline;
      const options = {
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        status: req.query.status as 'completed' | 'failed' | 'running' | undefined,
      };

      const runs = await storageAdapter.listRuns(pipelineName, options);
      res.json(runs);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/run/:runId', async (req, res) => {
    try {
      const runId = req.params.runId;
      const runData = await storageAdapter.getRunData(runId);
      res.json(runData);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Serve the main HTML file for any other route
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Start the server
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`Dashboard running at http://localhost:${port}`);
      opener(`http://localhost:${port}`);
      resolve();
    });
  });
}
