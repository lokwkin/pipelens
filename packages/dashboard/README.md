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
| Storage Type | `--storage`, `-s` | `STORAGE_OPTION` | Storage type to use (`filesystem` or `sqlite`) | `filesystem` |
| Storage Directory | `--storageDir`, `-d` | `STORAGE_DIR` | Directory path for filesystem storage | `./steps-track` |
| SQLite File | `--sqliteFile`, `-f` | `STORAGE_SQLITE_FILE` | SQLite file path for sqlite storage | `./steps-track.db` |
| Port | `--port`, `-p` | `PORT` | Port to run the dashboard server on | `3000` |

Command line arguments take priority over environment variables.

### Examples

```bash
# Use filesystem storage (default)
npm start -- --storage filesystem --storageDir ./my-data

# Use SQLite storage
npm start -- --storage sqlite --sqliteFile ./my-database.db

# Short form with aliases
npm start -- -s sqlite -f ./data/steps.db -p 8080
```

## Start with Docker

```bash
# Use filesystem storage (default)
docker run -p 3000:3000 -v /path/to/data:/app/steps-data -e STORAGE_OPTION=filesystem -e STORAGE_DIR=/app/steps-track lokwkin/steps-track-dashboard

# Use filesystem storage (default)
docker run -p 3000:3000 -v /path/to/data:/app/steps-data -e STORAGE_OPTION=filesystem -e STORAGE_DIR=/app/steps-track lokwkin/steps-track-dashboard

# Use SQLite storage
docker run -p 3000:3000 -v /path/to/data:/app/steps-data -e STORAGE_OPTION=sqlite -e STORAGE_SQLITE_FILE=/app/steps-track.db lokwkin/steps-track-dashboard
```

See [GitHub repository](https://github.com/lokwkin/steps-track#readme) for repository introduction and usage description.