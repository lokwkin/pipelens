import express from 'express';
import path from 'path';
import { StorageAdapter } from './storage/storage-adapter';
import multer from 'multer';
import { setupIngestionRouter } from './routes/ingestion-router';
import { setupDashboardRoutes } from './routes/dashboard-router';

export class DashboardServer {
  private app: express.Application;
  private port: number;
  private storageAdapter: StorageAdapter;
  private upload: multer.Multer;

  constructor(options: { storageAdapter: StorageAdapter; port?: number }) {
    this.port = options.port || 3000;
    this.storageAdapter = options.storageAdapter;
    this.app = express();

    // Configure multer for in-memory file uploads
    const storage = multer.memoryStorage();
    this.upload = multer({ storage });

    // Serve static files
    // This works both in development and production after build
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use(express.json({ limit: '10mb' })); // Increase JSON payload limit

    // Set up routes - cleanly separated by responsibility
    const ingestionRoutes = setupIngestionRouter(this.storageAdapter, this.upload);
    const dashboardRoutes = setupDashboardRoutes(this.storageAdapter);

    // Mount the routers with their respective prefixes
    this.app.use('/api/ingestion', ingestionRoutes);
    this.app.use('/api/dashboard', dashboardRoutes);

    // Default route - serve index.html for any unmatched routes
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }

  public async start(): Promise<void> {
    this.app.listen(this.port, () => {
      console.log(`Dashboard server running at http://localhost:${this.port}`);
    });
  }
}
