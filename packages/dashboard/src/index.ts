import { DashboardServer } from './dashboard-server';
import { SQLStorageAdapter } from './storage/sql-storage-adapter';
import { StorageAdapter } from './storage/storage-adapter';

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
  .option('sqlite_path', {
    describe: 'SQLite path for sqlite storage',
    type: 'string',
    default: process.env.SQLITE_PATH || './steps-track.db',
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
