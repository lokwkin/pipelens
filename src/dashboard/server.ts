import { launchDashboard } from './dashboard';
import { StorageAdapter } from '../storage/storage-adapter';
import { FileStorageAdapter } from '../storage/file-storage-adapter';

// Import your actual storage adapter implementation
// For example:
// import { RedisStorageAdapter } from '../storage/redis-storage-adapter';
// import { FileStorageAdapter } from '../storage/file-storage-adapter';

async function main() {
  // Initialize your storage adapter
  // For example:
  // const storageAdapter = new RedisStorageAdapter({
  //   host: 'localhost',
  //   port: 6379
  // });

  // Or for file storage:
  // const storageAdapter = new FileStorageAdapter({
  //   basePath: './data'
  // });

  // Replace this with your actual storage adapter instance
  const storageAdapter: StorageAdapter = new FileStorageAdapter('runs');

  // Connect to the storage
  await storageAdapter.connect();

  // Launch the dashboard
  await launchDashboard(storageAdapter, 3000);

  // The dashboard will keep running until the process is terminated
  console.log('Dashboard is running. Press Ctrl+C to stop.');
}

main().catch(console.error);
