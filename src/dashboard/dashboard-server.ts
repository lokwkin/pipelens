import express from 'express';
import path from 'path';
import { StorageAdapter } from '../storage/storage-adapter';
import { FileStorageAdapter } from '../storage/file-storage-adapter';
import { Step } from '../step';

export class DashboardServer {
  private app: express.Application;
  private port: number;
  private storageAdapter: StorageAdapter;

  constructor(options: { port?: number; storageAdapter?: StorageAdapter }) {
    this.port = options.port || 3000;
    this.storageAdapter = options.storageAdapter || new FileStorageAdapter('runs');
    this.app = express();

    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Setup API routes
    this.setupRoutes();
  }

  private setupRoutes() {
    // Get all pipelines
    this.app.get('/api/pipelines', async (req, res) => {
      try {
        const pipelines = await this.storageAdapter.listPipelines();
        res.json(pipelines);
      } catch (error) {
        console.error('Error listing pipelines:', error);
        res.status(500).json({ error: 'Failed to list pipelines' });
      }
    });

    // Get runs for a pipeline with filtering and pagination
    this.app.get('/api/runs/:pipelineName', async (req, res) => {
      try {
        const { pipelineName } = req.params;
        const { startDate, endDate, status, limit, offset } = req.query;

        const options: any = {};

        if (startDate) {
          options.startDate = new Date(startDate as string);
        }

        if (endDate) {
          options.endDate = new Date(endDate as string);
        }

        if (status) {
          options.status = status as string;
        }

        if (limit) {
          options.limit = parseInt(limit as string, 10);
        }

        if (offset) {
          options.offset = parseInt(offset as string, 10);
        }

        const runs = await this.storageAdapter.listRuns(pipelineName, options);
        console.log('runs', runs);
        res.json(runs);
      } catch (error) {
        console.error('Error listing runs:', error);
        res.status(500).json({ error: 'Failed to list runs' });
      }
    });

    // Get run details
    this.app.get('/api/run/:runId', async (req, res) => {
      try {
        const { runId } = req.params;
        const runData = await this.storageAdapter.getRunData(runId);
        res.json(runData);
      } catch (error) {
        console.error('Error getting run data:', error);
        res.status(500).json({ error: 'Failed to get run data' });
      }
    });

    // Get steps for a run
    this.app.get('/api/steps/:runId', async (req, res) => {
      try {
        const { runId } = req.params;
        const steps = await this.storageAdapter.listSteps(runId);
        res.json(steps);
      } catch (error) {
        console.error('Error listing steps:', error);
        res.status(500).json({ error: 'Failed to list steps' });
      }
    });

    // Get step statistics
    this.app.get('/api/step-stats/:pipelineName/:stepName', async (req, res) => {
      try {
        const { pipelineName, stepName } = req.params;
        const { startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate as string).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000; // Default to last 30 days
        const end = endDate ? new Date(endDate as string).getTime() : Date.now();

        const timeRange = { start, end };

        const stats = await this.storageAdapter.getStepTimeseries(pipelineName, stepName, timeRange);
        res.json(stats);
      } catch (error) {
        console.error('Error getting step statistics:', error);
        res.status(500).json({ error: 'Failed to get step statistics' });
      }
    });

    // Generate Gantt chart for a run
    this.app.get('/api/charts/gantt/:runId', async (req, res) => {
      try {
        const { runId } = req.params;
        const runData = await this.storageAdapter.getRunData(runId);

        // Create a temporary Step instance to generate the chart
        const tempStep = new Step('temp');

        // Apply the run data to the step (this is a simplified approach)
        Object.assign(tempStep, runData);

        // Generate the chart URL
        const chartUrl = tempStep.ganttQuickchart();

        res.json({ url: chartUrl });
      } catch (error) {
        console.error('Error generating Gantt chart:', error);
        res.status(500).json({ error: 'Failed to generate Gantt chart' });
      }
    });

    // Generate execution graph for a run
    this.app.get('/api/charts/execution-graph/:runId', async (req, res) => {
      try {
        const { runId } = req.params;
        const runData = await this.storageAdapter.getRunData(runId);

        // Create a temporary Step instance to generate the chart
        const tempStep = new Step('temp');

        // Apply the run data to the step (this is a simplified approach)
        Object.assign(tempStep, runData);

        // Generate the chart URL
        const chartUrl = tempStep.executionGraphQuickchart();

        res.json({ url: chartUrl });
      } catch (error) {
        console.error('Error generating execution graph:', error);
        res.status(500).json({ error: 'Failed to generate execution graph' });
      }
    });

    // Generate step timeseries chart
    this.app.get('/api/charts/step-timeseries/:pipelineName/:stepName', async (req, res) => {
      try {
        const { pipelineName, stepName } = req.params;
        const { startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate as string).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000;
        const end = endDate ? new Date(endDate as string).getTime() : Date.now();

        const timeRange = { start, end };

        // Get step timeseries data
        const timeseriesData = await this.storageAdapter.getStepTimeseries(pipelineName, stepName, timeRange);

        // Generate chart URL (placeholder implementation)
        const chartUrl = this.generateTimeseriesChartUrl(timeseriesData);

        res.json({ url: chartUrl });
      } catch (error) {
        console.error('Error generating step timeseries chart:', error);
        res.status(500).json({ error: 'Failed to generate step timeseries chart' });
      }
    });

    // Get step names for a pipeline (new endpoint)
    this.app.get('/api/step-names/:pipelineName', async (req, res) => {
      try {
        const { pipelineName } = req.params;

        // This is a placeholder implementation
        // In a real implementation, you would query the storage adapter
        // to get all unique step names for a given pipeline

        // For now, we'll return a static list of step names
        const stepNames = ['load_config', 'parsing', 'preprocess', 'page_1', 'page_2', 'page_3', 'sample-error'];

        res.json(stepNames);
      } catch (error) {
        console.error('Error getting step names:', error);
        res.status(500).json({ error: 'Failed to get step names' });
      }
    });

    // Default route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }

  // Helper method to generate a timeseries chart URL
  private generateTimeseriesChartUrl(timeseriesData: any[]): string {
    // This is a placeholder implementation
    // In a real implementation, you would use a charting library or service

    // For now, we'll return a static chart URL
    const labels = timeseriesData.map((point) => new Date(point.timestamp).toLocaleDateString());
    const values = timeseriesData.map((point) => point.value);

    const chartConfig = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Step Duration (ms)',
            data: values,
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    };

    // Encode the chart configuration for QuickChart
    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}`;
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`Dashboard server running at http://localhost:${this.port}`);
    });
  }
}

new DashboardServer({}).start();