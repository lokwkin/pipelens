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
    this.app.get('/api/pipelines/:pipelineName/runs', async (req, res) => {
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
        res.json(runs);
      } catch (error) {
        console.error('Error listing runs:', error);
        res.status(500).json({ error: 'Failed to list runs' });
      }
    });

    // Get run details
    this.app.get('/api/runs/:runId', async (req, res) => {
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
    this.app.get('/api/runs/:runId/steps', async (req, res) => {
      try {
        const { runId } = req.params;
        const steps = await this.storageAdapter.listRunSteps(runId);
        res.json(steps);
      } catch (error) {
        console.error('Error listing steps:', error);
        res.status(500).json({ error: 'Failed to list steps' });
      }
    });

    this.app.get('/api/pipelines/:pipelineName/steps', async (req, res) => {
      try {
        const { pipelineName } = req.params;
        const steps = await this.storageAdapter.listPipelineSteps(pipelineName);
        res.json(steps);
      } catch (error) {
        console.error('Error listing steps:', error);
        res.status(500).json({ error: 'Failed to list steps' });
      }
    });

    // Get step time series
    this.app.get('/api/pipelines/:pipelineName/steps/:stepName/time-series', async (req, res) => {
      try {
        const { pipelineName, stepName } = req.params;
        const { startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate as string).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000; // Default to last 30 days
        const end = endDate ? new Date(endDate as string).getTime() : Date.now();

        const timeRange = { start, end };

        const timeSeries = await this.storageAdapter.getPipelineStepTimeseries(pipelineName, stepName, timeRange);

        // Calculate statistics
        const durations = timeSeries.filter((item) => item.value > 0).map((item) => item.value);

        // Calculate max, min, average duration
        const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
        const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
        const avgDuration = durations.length > 0 ? durations.reduce((sum, val) => sum + val, 0) / durations.length : 0;

        // Count total executions
        const totalExecutions = timeSeries.length;

        // Count errors and successes
        const errorCount = timeSeries.filter((item) => item.stepMeta?.error).length;
        const successCount = totalExecutions - errorCount;

        // Return data with statistics
        res.json({
          timeSeries: timeSeries.map((item: any) => ({ ...item, duration: item.value })),
          stats: {
            maxDuration,
            minDuration,
            avgDuration,
            totalExecutions,
            errorCount,
            successCount,
          },
        });

      } catch (error) {
        console.error('Error getting step time series:', error);
        res.status(500).json({ error: 'Failed to get step time series' });
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
    this.app.get('/api/pipelines/:pipelineName/steps/:stepName/time-series/chart', async (req, res) => {
      try {
        const { pipelineName, stepName } = req.params;
        const { startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate as string).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000;
        const end = endDate ? new Date(endDate as string).getTime() : Date.now();

        const timeRange = { start, end };

        // Get step timeseries data
        const timeseriesData = await this.storageAdapter.getPipelineStepTimeseries(pipelineName, stepName, timeRange);

        // Generate chart URL (placeholder implementation)
        const chartUrl = this.generateTimeseriesChartUrl(timeseriesData);

        res.json({ url: chartUrl });
      } catch (error) {
        console.error('Error generating step timeseries chart:', error);
        res.status(500).json({ error: 'Failed to generate step timeseries chart' });
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
