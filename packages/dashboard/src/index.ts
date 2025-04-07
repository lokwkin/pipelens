import { StorageAdapter } from 'steps-track';
import { DashboardServer } from './dashboard-server';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Parse command line args
const argv = yargs(hideBin(process.argv))
  .option('storage_option', {
    alias: 'o',
    describe: 'Storage type to use',
    choices: ['filesystem', 'sqlite', 'postgres'],
    default: process.env.STORAGE_OPTION || 'filesystem',
  })
  .option('data_dir', {
    describe: 'Directory path for filesystem storage',
    type: 'string',
    default: process.env.DATA_DIR || './data',
  })
  .option('sqlite_path', {
    describe: 'SQLite path for sqlite storage',
    type: 'string',
    default: process.env.SQLITE_PATH || './data/steps-track.db',
  })
  .option('postgres_url', {
    describe: 'PostgreSQL connection URL',
    type: 'string',
    default: process.env.POSTGRES_URL || 'postgres://postgres:postgres@localhost:5432/stepstrack',
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

  if (argv.storage_option === 'sqlite' || argv.storage_option === 'postgres') {
    try {
      // We need to use dynamic import here since SQLStorageAdapter
      // and its dependencies might not be installed
      const { SQLStorageAdapter } = await import('steps-track');

      if (argv.storage_option === 'sqlite') {
        console.log(`Using SQL storage adapter with SQLite at: ${argv.sqlite_path}`);
        storageAdapter = new SQLStorageAdapter({
          client: 'sqlite3',
          connection: { filename: argv.sqlite_path },
          useNullAsDefault: true,
        });
      } else {
        console.log(`Using SQL storage adapter with PostgreSQL at: ${argv.postgres_url}`);
        storageAdapter = new SQLStorageAdapter({
          client: 'pg',
          connection: argv.postgres_url,
          pool: { min: 2, max: 10 },
        });
      }
    } catch (error) {
      console.error('Failed to load SQL storage adapter:', error);
      console.log('Make sure you have installed required dependencies:');
      console.log('  For SQLite: npm install sqlite3');
      console.log('  For PostgreSQL: npm install pg');
      console.log('Falling back to FileStorageAdapter');
      console.log(`Using FileStorageAdapter with directory: ${argv.data_dir}`);
      const { FileStorageAdapter } = await import('steps-track');
      storageAdapter = new FileStorageAdapter(argv.data_dir as string);
    }
  } else {
    // Default to file storage
    const { FileStorageAdapter } = await import('steps-track');
    console.log(`Using FileStorageAdapter with directory: ${argv.data_dir}`);
    storageAdapter = new FileStorageAdapter(argv.data_dir as string);
  }

  await storageAdapter.connect();

  const server = new DashboardServer({
    port: argv.port,
    storageAdapter,
  });

  await server.start();
}

// Run the main function
main().catch((error) => {
  console.error('Error starting dashboard server:', error);
  process.exit(1);
});
