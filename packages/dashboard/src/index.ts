import { StorageAdapter } from 'steps-track';
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
    default: process.env.STORAGE_DIR || './steps-track',
  })
  .option('sqlitePath', {
    alias: 'p',
    describe: 'SQLite path for sqlite storage',
    type: 'string',
    default: process.env.STORAGE_SQLITE_PATH || './steps-track.db',
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

  if (argv.storage === 'sqlite') {
    try {
      // We need to use dynamic import here since SQLiteStorageAdapter
      // and its dependencies might not be installed
      const { SQLiteStorageAdapter } = await import('steps-track');
      console.log(`Using SQLiteStorageAdapter with DB Path: ${argv.sqlitePath}`);
      storageAdapter = new SQLiteStorageAdapter(argv.sqlitePath || './steps-track.db');
    } catch (error) {
      console.error('Failed to load SQLiteStorageAdapter:', error);
      console.log('Make sure you have installed sqlite dependencies:');
      console.log('  npm install sqlite sqlite3');
      console.log('Falling back to FileStorageAdapter');
      console.log(`Using FileStorageAdapter with directory: ${argv.storageDir}`);
      const { FileStorageAdapter } = await import('steps-track');
      storageAdapter = new FileStorageAdapter(argv.storageDir);
    }
  } else {
    // Default to file storage
    const { FileStorageAdapter } = await import('steps-track');
    console.log(`Using FileStorageAdapter with directory: ${argv.storageDir}`);
    storageAdapter = new FileStorageAdapter(argv.storageDir);
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
