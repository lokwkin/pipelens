# StepsTrack

[![npm version](https://badge.fury.io/js/steps-track.svg)](https://badge.fury.io/js/steps-track)
[![npm downloads](https://img.shields.io/npm/dt/steps-track.svg)](https://www.npmjs.com/package/steps-track)
[![Test](https://github.com/lokwkin/steps-track/actions/workflows/test.yml/badge.svg)](https://github.com/lokwkin/steps-track/actions/workflows/test.yml/badge.svg)

StepsTrack is a tool built to help ***tracking, visualizing and inspecting*** intermediate steps in a complex ***pipeline-based application***. It automatically captures and stores the intermediate data, results and execution times of each steps in a pipeline, visualizing the execution details and allowing easier debug or analysis in a monitoring dashboard. It is originally developed as a go-to tool to inspect and analyze runtime data of an agentic RAG pipeline.

<details>
<summary>Background of StepsTrack</summary>

> StepsTrack is a lightweight inspection and debugging tool originally built to monitor an agentic Retrieval-Augmented Generation (RAG) pipeline running in a production environment—where visibility, performance, and stability are critical.
> 
> When chaining multiple LLM agents with custom logic and dynamic inputs, non-deterministic nature of LLM outputs of each steps often lead to dynamic route of logics and behaviors. I needed a inspection tool but the existing tools didn't provide the granularity I needed to trace what happened inside each step of the pipeline.
> 
> So I built StepsTrack to do just that: trace, inspect, and understand every step of each request. It helped me quickly spot bottlenecks, unexpected behaviors and performance drags, and address them effectively.
> 
> I'm open-sourcing it in the hope that it helps others building and operating complex LLM pipelines.
>
> Contributions welcome!
</details>

This repository is a **monorepo** containing following packages:
- [Typescript library](./packages/lib-ts) that provides basic tracker and chart generation function for your pipeline
- [Dashboard](./packages/dashboard) that visualizes and allows you to monitor tracked data for analysis.

## Features

#### [1. Tracking Pipeline Steps](#tracking-pipeline-steps)
- **Tracking**: Define steps in pipeline to track intermediates data, results and execution time
- **Visualizing**: Exporting the details and generating basic visualizations including Gantt and Execution Graph
- **Event Emitting**: Listen to step events for real-time monitoring and custom handling
- **ES6 Decorators**: Easy integration with ES6 decorators

#### [2. Using Dashboard](#using-dashboard)
Monitor and analyze pipeline executions through an interactive web interface
- Detailed Steps Data and Results Insepection
- Real-time Execution Monitoring
- Gantt Chart Visualization for pipeline
- Step Execution Stats

*Note: StepsTrack is designed for any pipeline-based / multi-steps logic, especially agentic LLM pipelines*

## Getting Started

### Installation

```bash
npm install --save steps-track
```

## Tracking Pipeline Steps

Create a pipeline and track steps with nested, sequential, or parallel logic:

```typescript
import { Pipeline, Step } from 'steps-track';

const pipeline = new Pipeline('my-pipeline');

await pipeline.track(async (st: Step) => {
  // Track a simple step
  await st.step('step1', async (st: Step) => {
    // Logic for step1
    st.record('key', 'value'); // Record data for analysis
  });
  
  // Track nested steps
  await st.step('parent-step', async (st: Step) => {
    await st.step('child-step-1', async (st: Step) => {
      // Child step logic
    });
    
    await st.step('child-step-2', async (st: Step) => {
      // Child step logic
    });
  });
  
  // Track parallel steps
  await Promise.all([
    st.step('parallel-1', async (st: Step) => { /* ... */ }),
    st.step('parallel-2', async (st: Step) => { /* ... */ })
  ]);
});
```

### Exporting and Visualizing Executions

Generate visual outputs to understand and analyze execution flow:

```typescript
// Generate a Gantt chart Buffer using quickchart.io
const ganttChartBuffer = await pipeline.ganttQuickchart();

// Generate a Gantt chart HTML file with Google Charts
const ganttChartHtml = await pipeline.ganttGoogleChartHtml();

// Generate an execution graph URL
const executionGraphUrl = pipeline.executionGraphQuickchart();

// Get the hierarchical output of all steps
const stepsHierarchy = pipeline.outputNested();
```

**Sample Gantt Chart**

<img src="./docs/gantt-chart.png" width="50%">

**Sample Execution Graph**

<img src="./docs/execution-graph.png" width="50%">

**Sample Hierarchy Output**

<details>
<summary>json</summary>

```json
{
    "name": "document-parse",
    "key": "document-parse",
    "time": { "startTs": 1739357985509, "endTs": 1739357990192, "timeUsageMs": 4683 },
    "records": {},
    "substeps": [
        {
            "name": "preprocess",
            "key": "document-pipeline.preprocess",
            "time": { "startTs": 1739357985711, "endTs": 1739357986713, "timeUsageMs": 1002 },
            "records": {
                "pageCount": 3
            },
            "result": [ "page_1_content", "page_2_content"],
            "substeps": []
        },
        {
            "name": "parsing",
            "key": "document-pipeline.parsing",
            "time": { "startTs": 1739357985711, "endTs": 1739357990192, "timeUsageMs": 4481 },
            "records": {},
            "substeps": [
                {
                    "name": "page_1",
                    "key": "document-pipeline.parsing.page_1",
                    "time": { "startTs": 1739357987214, "endTs": 1739357990192, "timeUsageMs": 2978 },
                    "records": {},
                    "result": "page_1_content",
                    "substeps": []
                },
                {
                    "name": "page_2",
                    "key": "document-pipeline.parsing.page_2",
                    "time": {
                        "startTs": 1739357987214, "endTs": 1739357989728, "timeUsageMs": 2514 },
                    "records": {},
                    "result": "page_2_content",
                    "substeps": []
                }
            ]
        },
        {
            "name": "sample-error",
            "key": "document-pipeline.sample-error",
            "time": { "startTs": 1739357990192, "endTs": 1739357990192, "timeUsageMs": 0},
            "records": {},
            "error": "Sample Error",
            "substeps": []
        }
    ]
}
```
</details>

### Advanced Usages

StepsTrack also provides **Event Emitting** listeners and **ES6 Decorators** support for easier integration. For more detailed usages, check out the [Basic Usage](./docs/basic-usage.md) and [Advanced Usage](./docs/advanced-usage.md) guides.





## Using Dashboard

StepsTrack includes a dashboard that provides several features for monitoring and analyzing pipeline executions. 

### Initial Configuration

During pipeline initialization, define how you would want to store logs as persistent data, to be able to read by the dashboard later on. Currently supported storing in file-system or SQLite. See [Advanced Usage](./docs/advanced-usage.md) for more details.

```typescript
// File system storage
const fileStorageAdapter = new FileStorageAdapter('/path/to/data');  
await fileStorageAdapter.connect();

// SQL storage with SQLite (recommended for most use cases)
// Note: SQLite dependencies are optional - first install them with:
// npm install sqlite3
const sqliteAdapter = new SQLStorageAdapter('/path/to/database.db');
await sqliteAdapter.connect();

// SQL storage with PostgreSQL
// Note: PostgreSQL dependencies are optional - first install them with:
// npm install pg
const postgresAdapter = new SQLStorageAdapter({
  client: 'pg',
  connection: 'postgres://user:password@localhost:5432/stepstrack',
  pool: { min: 2, max: 10 }
});
await postgresAdapter.connect();

// Create pipeline with the preferred storage adapter
const pipeline = new Pipeline('my-pipeline', {
  autoSave: true,
  storageAdapter: sqliteAdapter, // Choose your preferred adapter
});
```
### Starting up Dashboard

```bash
# The image loads data from "/app/.steps-track" FileStorageAdapter by default.
docker run -p 3000:3000 -v /path/to/data:/app/data lokwkin/steps-track-dashboard

# Use SQLite as persistent storage
docker run -p 3000:3000 -v /path/to/data:/app/data lokwkin/steps-track-dashboard -e STORAGE_OPTION=sqlite -e SQLITE_PATH=/app/data/steps-track.db

# Use PostgreSQL as persistent storage
docker run -p 3000:3000 lokwkin/steps-track-dashboard -e STORAGE_OPTION=postgres -e POSTGRES_URL=postgres://user:password@host:5432/stepstrack
```

### Detailed Steps Insepection

Details of a pipeline run. From here you can examine all the steps running in the pipeline, their auto-captured data and results as well as the time usage information.

<img src="./docs/dashboard-inspect-results.gif" width="60%">

### Real-time Execution Monitoring

The dashboard includes auto-refreshing option, allowing you to monitor real-time pipeline runs.

<img src="./docs/dashboard-run-history.gif" width="60%">

<img src="./docs/dashboard-real-time-steps.gif" width="60%">

### Gantt Chart Visualization for pipeline

Gantt Chart for visualizing the time usages of each steps in a pipeline run. You can see real-time progress of the pipeline, highlighted by status of running / success / failed.

<img src="./docs/dashboard-gantt.gif" width="60%">

### Step Execution Stats

Step Execution Stats. Aggregated from past run histories with basic statistical information for performance analyzing.

<img src="./docs/dashboard-stats.gif" width="60%">

## Roadmap
- [X] Decorator support for easier integration.
- [X] Generate speed analysis stats from multiple runs.
- [X] Add Redis / File support for persistent data storage.
- [X] Dashboard to monitor execution logs and results.
- [X] Support real-time step exdcution monitoring.
- [X] Convert into mono-repo and split dashboard as independent dockerized module
- [X] Use GoogleChart / QuickChart instead of local chart.js generation
- [X] Enhance StepsTrack Monitoring Dashboard UI/UX
- [X] Allow importing external logs into dashboard
- [X] Use Sqlite as a more appropriate persistence storage for analytic
- [ ] Optional LLM-extension that optimize for LLM response and usage tracking
- [ ] Use memory-store instead of storing nested steps class
- [ ] Support Python version of steps tracker


## License
MIT © [lokwkin](https://github.com/lokwkin)
