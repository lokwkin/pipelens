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
| Storage Type | `--storage`, `-s` | `STORAGE_OPTION` | Storage type to use (`filesystem` or `redis`) | `filesystem` |
| Storage Directory | `--storageDir`, `-d` | `STORAGE_DIR` | Directory path for filesystem storage | `./.steps-track` |
| Redis URL | `--redisUrl`, `-r` | `STORAGE_REDIS_URL` | Redis URL for redis storage | `redis://localhost:6379/0` |
| Port | `--port`, `-p` | `PORT` | Port to run the dashboard server on | `3000` |

Command line arguments take priority over environment variables.

### Examples

```bash
# Use filesystem storage (default)
npm start -- --storage filesystem --storageDir ./my-data

# Use Redis storage
npm start -- --storage redis --redisUrl redis://my-redis-server:6379/0

# Short form with aliases
npm start -- -s redis -r redis://localhost:6379/1 -p 8080
```

## Start with Docker

```bash
# Use filesystem storage (default)
docker run -p 3000:3000 -v /path/to/data:/app/steps-data -e STORAGE_OPTION=filesystem -e STORAGE_DIR=/app/steps-data lokwkin/steps-track-dashboard

# Use Redis storage
docker run -p 3000:3000 -e STORAGE_OPTION=redis -e STORAGE_REDIS_URL=redis://redis-host:6379/0 lokwkin/steps-track-dashboard
```

See [GitHub repository](https://github.com/lokwkin/steps-track#readme) for repository introduction and usage description.