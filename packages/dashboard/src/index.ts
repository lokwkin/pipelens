import { FileStorageAdapter, RedisStorageAdapter, StorageAdapter } from 'steps-track';
import { DashboardServer } from './dashboard-server';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Parse command line args
const argv = yargs(hideBin(process.argv))
  .option('storage', {
    alias: 's',
    describe: 'Storage type to use',
    choices: ['filesystem', 'redis'],
    default: process.env.STORAGE_OPTION || 'filesystem',
  })
  .option('storageDir', {
    alias: 'd',
    describe: 'Directory path for filesystem storage',
    type: 'string',
    default: process.env.STORAGE_DIR || './.steps-track',
  })
  .option('redisUrl', {
    alias: 'r',
    describe: 'Redis URL for redis storage',
    type: 'string',
    default: process.env.STORAGE_REDIS_URL || 'redis://localhost:6379/0',
  })
  .option('port', {
    alias: 'p',
    describe: 'Port to run the dashboard server on',
    type: 'number',
    default: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  })
  .help()
  .parseSync();

// Create and start the dashboard server
async function main() {
  let storageAdapter: StorageAdapter;

  // Initialize the appropriate storage adapter based on configuration
  if (argv.storage === 'redis') {
    console.log(`Using RedisStorageAdapter with URL: ${argv.redisUrl}`);
    storageAdapter = new RedisStorageAdapter({ url: argv.redisUrl });
  } else {
    console.log(`Using FileStorageAdapter with directory: ${argv.storageDir}`);
    storageAdapter = new FileStorageAdapter(argv.storageDir || './.steps-track');
  }

  await storageAdapter.connect();

  const server = new DashboardServer({
    port: argv.port,
    storageAdapter: storageAdapter,
  });

  server.start();
}

main().catch((error) => {
  console.error('Error starting the dashboard server:', error);
  process.exit(1);
});
