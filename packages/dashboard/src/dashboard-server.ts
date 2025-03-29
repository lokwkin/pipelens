import express, { Request, Response } from 'express';
import path from 'path';
import * as fs from 'fs';
import { StorageAdapter, FileStorageAdapter, PipelineMeta } from 'steps-track';
import { minimatch } from 'minimatch';
import multer from 'multer';
import { tmpdir } from 'os';

export class DashboardServer {
  private app: express.Application;
  private port: number;
  private storageAdapter: StorageAdapter;
  private upload: multer.Multer;
  private tempDir: string;

  constructor(options: { port?: number; storageAdapter?: StorageAdapter; tempDir?: string }) {
    this.port = options.port || 3000;
    this.storageAdapter = options.storageAdapter || new FileStorageAdapter('./.steps-track');
    this.tempDir = options.tempDir || path.join(tmpdir(), 'steps-track-uploads');
    this.app = express();

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Configure multer for file uploads
    const storage = multer.diskStorage({
      destination: (
        _req: Express.Request,
        _file: Express.Multer.File,
        cb: (error: Error | null, destination: string) => void,
      ) => {
        cb(null, this.tempDir);
      },
      filename: (
        _req: Express.Request,
        file: Express.Multer.File,
        cb: (error: Error | null, filename: string) => void,
      ) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + '-' + file.originalname);
      },
    });
    this.upload = multer({ storage });

    // Serve static files
    // This works both in development and production after build
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.json());

    // Setup API routes
    this.setupRoutes();

    // Default route - serve index.html for any unmatched routes
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
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
        const { startDate, endDate, status, page, pageSize } = req.query;

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

        // Convert pagination parameters
        const currentPage = page ? parseInt(page as string, 10) : 1;
        const itemsPerPage = pageSize ? parseInt(pageSize as string, 10) : 10;

        // Get all runs that match the filters (without pagination)
        const allRuns = await this.storageAdapter.listRuns(pipelineName, options);

        // Apply pagination
        const totalItems = allRuns.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const offset = (currentPage - 1) * itemsPerPage;
        const paginatedRuns = allRuns.slice(offset, offset + itemsPerPage);

        // Return paginated response
        res.json({
          items: paginatedRuns,
          pagination: {
            page: currentPage,
            pageSize: itemsPerPage,
            totalItems,
            totalPages,
          },
        });
      } catch (error) {
        console.error('Error listing runs:', error);
        res.status(500).json({
          items: [],
          pagination: {
            page: 1,
            pageSize: 10,
            totalItems: 0,
            totalPages: 0,
          },
          error: 'Failed to list runs',
        });
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
        const { startDate, endDate, page, pageSize } = req.query;

        const start = startDate ? new Date(startDate as string).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000; // Default to last 30 days
        const end = endDate ? new Date(endDate as string).getTime() : Date.now();

        const timeRange = { start, end };

        // Get all time series data
        const timeSeries = await this.storageAdapter.getPipelineStepTimeseries(pipelineName, stepName, timeRange);

        // Calculate statistics from the entire dataset
        const durations = timeSeries.filter((item: any) => item.value > 0).map((item: any) => item.value);

        // Calculate max, min, average duration
        const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
        const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
        const avgDuration =
          durations.length > 0 ? durations.reduce((sum: number, val: number) => sum + val, 0) / durations.length : 0;

        // Count total executions
        const totalExecutions = timeSeries.length;

        // Count errors and successes
        const errorCount = timeSeries.filter((item: any) => item.stepMeta?.error).length;
        const successCount = totalExecutions - errorCount;

        // Apply pagination
        const currentPage = page ? parseInt(page as string, 10) : 1;
        const itemsPerPage = pageSize ? parseInt(pageSize as string, 10) : 10;
        const totalItems = timeSeries.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const offset = (currentPage - 1) * itemsPerPage;
        const paginatedTimeSeries = timeSeries.slice(offset, offset + itemsPerPage);

        // Return data with statistics and pagination
        res.json({
          timeSeries: paginatedTimeSeries.map((item: any) => ({ ...item, duration: item.value })),
          stats: {
            maxDuration,
            minDuration,
            avgDuration,
            totalExecutions,
            errorCount,
            successCount,
          },
          pagination: {
            page: currentPage,
            pageSize: itemsPerPage,
            totalItems,
            totalPages,
          },
        });
      } catch (error) {
        console.error('Error getting step time series:', error);
        res.status(500).json({
          error: 'Failed to get step time series',
          timeSeries: [],
          stats: {
            maxDuration: 0,
            minDuration: 0,
            avgDuration: 0,
            totalExecutions: 0,
            errorCount: 0,
            successCount: 0,
          },
          pagination: {
            page: 1,
            pageSize: 10,
            totalItems: 0,
            totalPages: 0,
          },
        });
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

    // Add new route for uploading single step output file
    this.app.post('/api/upload/steps-file', this.upload.single('stepsFile'), (req: Request, res: Response): void => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'No file uploaded' });
          return;
        }

        // Get runId from request or generate a new one
        const filePath = req.file.path;

        try {
          // Process the file
          const data = fs.readFileSync(filePath, 'utf8');
          const jsonData = JSON.parse(data) as PipelineMeta;

          this.importFromPipelineOutput(jsonData);

          // Clean up temporary file
          fs.unlinkSync(filePath);

          res.json({
            success: true,
            message: `Successfully imported data for Run ID: ${jsonData.runId}`,
            data: {
              runId: jsonData.runId,
              startTime: jsonData.time?.startTs,
              endTime: jsonData.time?.endTs,
              stepCount: jsonData.steps?.length || 0,
            },
          });
        } catch (parseError) {
          // Clean up temporary file
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          console.error('Error processing steps file:', parseError);
          res.status(400).json({
            success: false,
            error: 'Invalid JSON file',
            message: parseError instanceof Error ? parseError.message : 'Unknown error',
          });
        }
      } catch (error) {
        console.error('Error handling file upload:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to process file',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Add route for uploading multiple step output files
    this.app.post(
      '/api/upload/multiple-steps-files',
      this.upload.array('stepsFiles', 10),
      (req: Request, res: Response): void => {
        try {
          const files = req.files as Express.Multer.File[];

          if (!files || files.length === 0) {
            res.status(400).json({ error: 'No files uploaded' });
            return;
          }

          const results: Array<{ filename: string; success: boolean; message: string; data?: any }> = [];

          // Process each file
          for (const file of files) {
            const filePath = file.path;

            try {
              // Process the file
              const data = fs.readFileSync(filePath, 'utf8');
              const jsonData = JSON.parse(data) as PipelineMeta;

              this.importFromPipelineOutput(jsonData);

              // Add success result
              results.push({
                filename: file.originalname,
                success: true,
                message: `Successfully imported data for Run ID: ${jsonData.runId}`,
                data: {
                  runId: jsonData.runId,
                  startTime: jsonData.time?.startTs,
                  endTime: jsonData.time?.endTs,
                  stepCount: jsonData.steps?.length || 0,
                },
              });

              // Clean up temporary file
              fs.unlinkSync(filePath);
            } catch (parseError) {
              // Add error result
              results.push({
                filename: file.originalname,
                success: false,
                message: parseError instanceof Error ? parseError.message : 'Unknown error',
              });

              // Clean up temporary file
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }

              console.error(`Error processing file ${file.originalname}:`, parseError);
            }
          }

          // Return all results
          res.json({
            success: true,
            results,
          });
        } catch (error) {
          console.error('Error handling multiple file upload:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to process files',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    );
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

  public importFromOutputFolder(runId: string, folder: string, filePattern: string = '*'): void {
    const files = fs.readdirSync(folder);
    for (const file of files) {
      if (minimatch(file, filePattern)) {
        const filePath = path.join(folder, file);
        const data = fs.readFileSync(filePath, 'utf8');
        const pipelineMeta = JSON.parse(data) as PipelineMeta;
        this.importFromPipelineOutput(pipelineMeta);
      }
    }
  }

  public importFromPipelineOutput(pipelineMeta: PipelineMeta): void {
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

    for (const step of pipelineMeta.steps) {
      this.storageAdapter.finishStep(pipelineMeta.runId, step);
    }
    this.storageAdapter.finishRun(
      pipelineMeta,
      pipelineMeta.time.endTs ? (pipelineMeta.error ? 'failed' : 'completed') : 'running',
    );
  }

  // Add method to process files from a directory
  private processFilesFromDirectory(directory: string, filePattern: string = '*'): void {
    const files = fs.readdirSync(directory);
    for (const file of files) {
      if (minimatch(file, filePattern)) {
        const filePath = path.join(directory, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          // Recursively process subdirectories
          this.processFilesFromDirectory(filePath, filePattern);
        } else {
          try {
            // Process individual log file
            const data = fs.readFileSync(filePath, 'utf8');
            try {
              const jsonData = JSON.parse(data) as PipelineMeta;
              this.importFromPipelineOutput(jsonData);
            } catch (parseError) {
              console.error(`Error parsing JSON from ${filePath}:`, parseError);
            }
          } catch (error) {
            console.error(`Error processing file ${filePath}:`, error);
          }
        }
      }
    }
  }
}
