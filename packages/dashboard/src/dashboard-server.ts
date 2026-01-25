import express from 'express';
import path from 'path';
import { StorageAdapter } from './storage/storage-adapter';
import multer from 'multer';
import { setupIngestionRouter } from './routes/ingestion-router';
import { setupDashboardRoutes } from './routes/dashboard-router';
import http from 'http';
import cron from 'node-cron';

export class DashboardServer {
  private app: express.Application;
  private port: number;
  private storageAdapter: StorageAdapter;
  private upload: multer.Multer;
  private server: http.Server | null = null;
  private cleanupTask: cron.ScheduledTask | null = null;
  private readonly CLEANUP_SCHEDULE = '5 0 * * *'; // Run once at 00:05 every day (cron syntax)

  constructor(options: { storageAdapter: StorageAdapter; port?: number }) {
    this.port = options.port || 3000;
    this.storageAdapter = options.storageAdapter;
    this.app = express();

    // Configure multer for in-memory file uploads
    const storage = multer.memoryStorage();
    this.upload = multer({ storage });

    this.app.use(express.json({ limit: '10mb' })); // Increase JSON payload limit

    // Set up routes - cleanly separated by responsibility
    const ingestionRoutes = setupIngestionRouter(this.storageAdapter);
    const dashboardRoutes = setupDashboardRoutes(this.storageAdapter, this.upload);

    // Mount the routers with their respective prefixes
    this.app.use('/api/ingestion', ingestionRoutes);
    this.app.use('/api/dashboard', dashboardRoutes);

    // Serve static files from built React app
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // Serve React app for all non-API routes (SPA routing)
    this.app.get('*', (req, res) => {
      // Serve index.html for all other routes (React Router will handle routing)
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }

  /**
   * Run data cleanup for all pipelines
   */
  private async runDataCleanup(): Promise<void> {
    try {
      console.log('Running scheduled data cleanup...');
      const pipelines = await this.storageAdapter.listPipelines();

      for (const pipeline of pipelines) {
        try {
          await this.storageAdapter.purgeOldData(pipeline);
        } catch (err) {
          console.error(`Error purging data for pipeline ${pipeline}:`, err);
        }
      }

      console.log('Scheduled data cleanup completed');
    } catch (error) {
      console.error('Error during scheduled data cleanup:', error);
    }
  }

  public async start(): Promise<void> {
    // Connect to storage
    await this.storageAdapter.connect();

    this.server = this.app.listen(this.port, () => {
      console.log(`Dashboard server running at PORT ${this.port}`);
    });

    // Run initial data cleanup
    await this.runDataCleanup();

    // Set up cron job for data cleanup
    this.cleanupTask = cron.schedule(this.CLEANUP_SCHEDULE, () => {
      console.log('Executing scheduled data cleanup task');
      this.runDataCleanup();
    });

    // Handle Docker stop signals for graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  public async shutdown(): Promise<void> {
    // Stop cron job
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
    }

    if (this.server) {
      console.log('Shutting down dashboard server...');
      return new Promise((resolve, reject) => {
        this.server?.close((err) => {
          if (err) {
            console.error('Error shutting down server:', err);
            reject(err);
          } else {
            console.log('Dashboard server shut down successfully');
            process.exit(0);
          }
        });
      });
    }
  }
}
