import { FileStorageAdapter, StorageAdapter } from 'steps-track';
import { DashboardServer } from './dashboard-server';
import path from 'path';

// Create and start the dashboard server
async function main() {
  let storageAdapter: StorageAdapter;

  if (process.env.STORAGE_TYPE === 'sqlite') {
    try {
      // We need to use dynamic import here since SQLiteStorageAdapter
      // and its dependencies might not be installed
      const { SQLiteStorageAdapter } = await import('steps-track');
      const dbPath = process.env.SQLITE_PATH || path.join(process.env.RUNS_DIR || './.steps-track', 'steps-track.db');
      storageAdapter = new SQLiteStorageAdapter(dbPath);
    } catch (error) {
      console.error('Failed to load SQLiteStorageAdapter:', error);
      console.log('Make sure you have installed sqlite dependencies:');
      console.log('  npm install sqlite sqlite3');
      console.log('Falling back to FileStorageAdapter');
      storageAdapter = new FileStorageAdapter(process.env.RUNS_DIR || './.steps-track');
    }
  } else {
    // Default to file storage
    storageAdapter = new FileStorageAdapter(process.env.RUNS_DIR || './.steps-track');
  }

  await storageAdapter.connect();

  const server = new DashboardServer({
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    storageAdapter,
  });

  await server.start();
}

// Run the main function
main().catch((error) => {
  console.error('Error starting dashboard server:', error);
  process.exit(1);
});
