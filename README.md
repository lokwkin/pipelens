# StepsTrack

[![npm version](https://badge.fury.io/js/steps-track.svg)](https://badge.fury.io/js/steps-track)
[![npm downloads](https://img.shields.io/npm/dt/steps-track.svg)](https://www.npmjs.com/package/steps-track)
[![Test](https://github.com/lokwkin/steps-track/actions/workflows/test.yml/badge.svg)](https://github.com/lokwkin/steps-track/actions/workflows/test.yml/badge.svg)

StepsTrack is a lightweight and very simple TypeScript library for ***tracking, profiling, and visualizing*** hierarchical intermediate steps in a ***pipeline-based application***. It helps break down complex logic flows into smaller steps, records intermediate execution time and data, and visualizes the execution in human-readable graphs to help debugging and optimizing. It best works in pipeline functions that consist of complex logic execution flows and multiple concurrent async functions.

### Background
StepsTrack was initially developed to debug and track an agentic *Retrieval-Augmented Generation (RAG) pipeline* in production where monitoring and optimization are crucial. Chain-ing multiple LLM agents with custom logic and dynamic data inputs often led to unstable results and long response times, especially in production environments where multiple requests are running concurrently.

To address these challenges, I created StepsTrack as a profiling and debugging tool so I could trace what had happened underlying in each request and identify bottlenecks upon each pipeline run. I found it very handy and useful and am sharing with anyone tackling similar challenges in their pipelines.

Features includes:
- 👣 **[Tracking Pipeline Steps](#tracking-pipeline-steps)**: Define steps in pipeline to track intermediates data, execution time and results.
- 🎛️ **[Using Dashboard](#using-dashboard)**: Monitor and analyze pipeline executions through an interactive web interface
- ⚙️ **[Advanced Usage**](#advanced-usages)**:
  - Event Emitting: Listen to step events for real-time monitoring and custom handling
  - Decorators: Easy integration with ES6 decorators.

## Tracking Pipeline Steps

### Installation

```bash
npm install --save steps-track
```

### Steps Defining

Instantiate your pipelien and define the steps in your pipeline. It can support sequential / parallel and nested substeps.

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

### Generating Visualizations

After running your pipeline, generate visualizations to analyze execution flow:

```typescript
// Generate a Gantt chart URL using quickchart.io
const ganttChartUrl = await pipeline.ganttQuickchart();

// Generate a Gantt chart HTML file with Google Charts
const ganttChartHtml = await pipeline.ganttGoogleChartHtml();

// Generate an execution graph URL
const executionGraphUrl = pipeline.executionGraphQuickchart();

// Get the hierarchical output of all steps
const stepsHierarchy = pipeline.outputHierarchy();
```

#### Sample Gantt Chart
<img src="./docs/gantt-chart.png" width="50%">

#### Sample Execution Graph
<img src="./docs/execution-graph.png" width="50%">

#### Sample Hierarchy Output
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
            "time": { ... },
            "records": {},
            "substeps": [
                {
                    "name": "page_1",
                    "key": "document-pipeline.parsing.page_1",
                    "time": { ... },
                    "records": {},
                    "result": "page_1_content",
                    "substeps": []
                },
                {
                    "name": "page_2",
                    "key": "document-pipeline.parsing.page_2",
                    "time": { ... },
                    "records": {},
                    "result": "page_2_content",
                    "substeps": []
                }
            ]
        },
        {
            "name": "sample-error",
            "key": "document-pipeline.sample-error",
            "time": { ... },
            "records": {},
            "error": "Sample Error",
            "substeps": []
        }
    ]
}
```


## Using Dashboard

StepsTrack includes a dashboard that provides several features for monitoring and analyzing pipeline executions. 

### Pipeline Setup

```typescript
// Set up persistent storage for the dashboard
const pipeline = new Pipeline('my-pipeline', {
  autoSave: true,
  storageAdapter: new FileStorageAdapter('./steps-data')
});

```
To start the dashboard:

```bash
docker run -p 3000:3000 -v /path/to/data:/app/steps-data lokwkin/steps-track-dashboard
```

### Examine Steps Details 

Detailed steps in a pipeline run. All intermediates records and step results can be examine here.

<img src="./docs/dashboard-inspect-results.gif" width="70%">

### Real-time Execution Monitoring

Real-time pipeline run status monitoring

<img src="./docs/dashboard-run-history.gif" width="70%">

Real-time steps status updates monitoring

<img src="./docs/dashboard-real-time-steps.gif" width="70%">

### Visualization of Pipeline Time Usage

Gantt Chart for visualizing the time usages of each steps in a pipeline run.
<img src="./docs/dashboard-gantt.gif" width="70%">

### Step Execution Stats

Step Execution Stats aggregated from past run histories for performance analyzing.

<img src="./docs/dashboard-stats.gif" width="70%">

## Advanced Usages

StepsTrack also provides **Event Emitting** listeners and **ES6 Decorators** support for easier integration.

For more detailed usages, check out the [Basic Usage](./docs/basic-usage.md) and [Advanced Usage](./docs/advanced-usage.md) guides.

## Roadmap
- [X] Decorator support for easier integration.
- [X] Generate speed analysis stats from multiple runs.
- [X] Add Redis / File support for persistent data storage.
- [X] Dashboard to monitor execution logs and results.
- [X] Support real-time step exdcution monitoring.
- [X] Convert into mono-repo and split dashboard as independent dockerized module
- [X] Use GoogleChart / QuickChart instead of local chart.js generation
- [X] Enhance StepsTrack Monitoring Dashboard UI/UX
- [ ] Allow importing external logs into dashboard
- [ ] Optional LLM-extension that optimize for LLM response and usage tracking
- [ ] Use memory-store instead of storing nested steps class
- [ ] More robust file locking for FileStorageAdapter
- [ ] Python version of logger


## License
MIT © [lokwkin](https://github.com/lokwkin)
