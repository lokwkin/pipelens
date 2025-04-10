import express from 'express';
import path from 'path';
import { StorageAdapter } from './storage/storage-adapter';
import multer from 'multer';
import { setupIngestionRouter } from './routes/ingestion-router';
import { setupDashboardRoutes } from './routes/dashboard-router';
import http from 'http';

export class DashboardServer {
  private app: express.Application;
  private port: number;
  private storageAdapter: StorageAdapter;
  private upload: multer.Multer;
  private server: http.Server | null = null;

  constructor(options: { storageAdapter: StorageAdapter; port?: number }) {
    this.port = options.port || 3000;
    this.storageAdapter = options.storageAdapter;
    this.app = express();

    // Configure multer for in-memory file uploads
    const storage = multer.memoryStorage();
    this.upload = multer({ storage });

    // Set up routes - cleanly separated by responsibility
    const ingestionRoutes = setupIngestionRouter(this.storageAdapter, this.upload);
    const dashboardRoutes = setupDashboardRoutes(this.storageAdapter);

    // Mount the routers with their respective prefixes
    this.app.use('/api/ingestion', ingestionRoutes);
    this.app.use('/api/dashboard', dashboardRoutes);

    // Serve static files
    // This works both in development and production after build
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.json({ limit: '10mb' })); // Increase JSON payload limit
  }

  public async start(): Promise<void> {
    this.server = this.app.listen(this.port, () => {
      console.log(`Dashboard server running at PORT ${this.port}`);
    });

    // Handle Docker stop signals for graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  public async shutdown(): Promise<void> {
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
