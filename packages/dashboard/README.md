# steps-track/dashboard

This is the Dashboard implementation for **steps-track**.

## Usage

### Local Installation

```bash
# Install dependencies
npm install

# Build the dashboard
npm run build

# Start the dashboard
npm start
```

### Command Line Options

The dashboard supports multiple storage options and can be configured via command line arguments or environment variables:

| Option | CLI Flag | Environment Variable | Description | Default |
|--------|----------|----------------------|-------------|---------|
| Storage Type | `--storage_option`, `-o` | `STORAGE_OPTION` | Storage type to use (`filesystem`, `sqlite`, or `postgres`) | `filesystem` |
| Data Directory | `--data_dir` | `DATA_DIR` | Directory path for filesystem storage | `./data` |
| SQLite Path | `--sqlite_path` | `SQLITE_PATH` | SQLite file path for sqlite storage | `./data/steps-track.db` |
| PostgreSQL URL | `--postgres_url` | `POSTGRES_URL` | PostgreSQL connection URL | `postgres://postgres:postgres@localhost:5432/stepstrack` |
| Port | `--port`, `-p` | `PORT` | Port to run the dashboard server on | `3000` |

Command line arguments take priority over environment variables.

### Examples

```bash
# Use filesystem storage (default)
npm start -- --storage_option filesystem --data_dir ./my-data

# Use SQLite storage
npm start -- --storage_option sqlite --sqlite_path ./my-database.db

# Use PostgreSQL storage
npm start -- --storage_option postgres --postgres_url postgres://user:password@host:5432/stepstrack

# Short form with aliases
npm start -- -o sqlite -p 8080
```

## Start with Docker

```bash
# Use filesystem storage (default)
docker run -p 3000:3000 -v /path/to/data:/app/data -e STORAGE_OPTION=filesystem -e DATA_DIR=/app/data lokwkin/steps-track-dashboard

# Use SQLite storage
docker run -p 3000:3000 -v /path/to/data:/app/data -e STORAGE_OPTION=sqlite -e SQLITE_PATH=/app/data/steps-track.db lokwkin/steps-track-dashboard

# Use PostgreSQL storage
docker run -p 3000:3000 -e STORAGE_OPTION=postgres -e POSTGRES_URL=postgres://user:password@host:5432/stepstrack lokwkin/steps-track-dashboard
```

See [GitHub repository](https://github.com/lokwkin/steps-track#readme) for repository introduction and usage description.