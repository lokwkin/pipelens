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

        // Return total count for pagination
        const totalRuns = await this.getTotalRunCount(pipelineName, options);

        res.json({
          runs,
          total: totalRuns,
        });
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

    // Default route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }

  // Helper method to get total run count for pagination
  private async getTotalRunCount(pipelineName: string, filterOptions: any): Promise<number> {
    try {
      // Create a copy of filter options without pagination
      const options = { ...filterOptions };
      delete options.limit;
      delete options.offset;

      const allRuns = await this.storageAdapter.listRuns(pipelineName, options);
      return allRuns.length;
    } catch (error) {
      console.error('Error getting total run count:', error);
      return 0;
    }
  }

  // Placeholder method to generate timeseries chart URL
  private generateTimeseriesChartUrl(timeseriesData: any): string {
    // This is a placeholder implementation
    // In a real implementation, you would use a charting library or service

    // Example using QuickChart.io
    const labels = timeseriesData.map((point: any) => new Date(point.timestamp).toLocaleDateString());
    const values = timeseriesData.map((point: any) => point.duration);

    const chartData = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Duration (ms)',
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

    return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartData))}`;
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`Dashboard server running at http://localhost:${this.port}`);
    });
  }
}

// Export a function to create and start the dashboard server
export function startDashboard(options: { port?: number; storageAdapter?: StorageAdapter } = {}): DashboardServer {
  const server = new DashboardServer(options);
  server.start();
  return server;
}


startDashboard();