# StepsTrack

[![npm version](https://badge.fury.io/js/steps-track.svg)](https://badge.fury.io/js/steps-track)
[![npm downloads](https://img.shields.io/npm/dt/steps-track.svg)](https://www.npmjs.com/package/steps-track)
[![Test](https://github.com/lokwkin/steps-track/actions/workflows/test.yml/badge.svg)](https://github.com/lokwkin/steps-track/actions/workflows/test.yml/badge.svg)

StepsTrack is a lightweight and very simple TypeScript library for ***tracking, profiling, and visualizing*** hierarchical intermediate steps in a ***pipeline-based application***. It helps break down complex logic flows into smaller steps, records intermediate execution time and data, and visualizes the execution in human-readable graphs to help debuging and optimizing. It best works in pipeline functions that consists of complex logic execution flows and multiple concurrent async functions.

### Background
StepsTrack was initially developed to debug and track an agentic *Retrieval-Augmented Generation (RAG) pipeline* in production where monitoring and optimization are crucial. Chain-ing multiple LLM agents with custom logic and dynamic data inputs often led to unstable results and long response times, especially in production environment where multiple requests are running concurrently. 

To address these challenges, I created StepsTrack as a profiling and debugging tool so I could trace what had happend underlying in each requests and identify bottlenecks upon each pipeline runs. I found it very handy and useful and am sharing with anyone tackling similar challenges in their pipelines.

## Features

- 👣 **Tracking**: Tracks intermediates data, results, execution time and hierachy of the intermediate steps.
- 📊 **Gantt chart**: Visualizes step execution times.
- ⛓️ **Execution graph**: Visualizes step execution dependencies, time and ordering.
- 🎯 **Event Emmitting**: Tracks step progress for further processing.
- 🎨 **Decorators**: Easy integration with ES6 decorators.

## Installation

```bash
npm install --save steps-track
```

## Quick Start

```typescript
import { Pipeline, Step } from 'steps-track';

const pipeline = new Pipeline('my-pipeline');

await pipeline.track(async (st: Step) => {
  await st.step('step1', async (st: Step) => {
    // Step 1 logic
    st.record('key', 'value');
  });
  
  await st.step('step2', async (st: Step) => {
    // Step 2 logic
    return 'result';
  });
});

// Generate visualizations
const ganttChartUrl = await pipeline.ganttQuickchart();
const ganttChartHtml = await pipeline.ganttGoogleChartHtml();
const executionGraphUrl = pipeline.executionGraphQuickchart();
```

For more detailed information, check out the [Basic Usage](./docs/basic-usage.md) and [Advanced Usage](./docs/advanced-usage.md) guides. 

## To Do
- [X] Decorator support for easier integration.
- [X] Generate speed analysis stats from multiple runs.
- [X] Add Redis / File support for persistent data storage.
- [X] Dashboard to monitor execution logs and results.
- [X] Implement real-time execution monitoring.
- [X] Independent Monitoring Portal deployment & Dockerization
- [X] Obselete chart.js generation, use GoogleChart / QuickChart instead
- [ ] Optional LLM-extension that optimize for LLM response and usage tracking
- [ ] Update README with visualizations and dashboard usage
- [ ] Use memory-store instead of storing nested steps class
- [ ] Enhance StepsTrack Monitoring Portal
  - [X] Improve overall UIUX and fix UI defects
  - [ ] Fix in-progress steps
  - [ ] Improve json view of record & results
  - [ ] Allow importing external logs into dashboard
  - [ ] Better support for in-progress steps (tracking of step real-time status)
  - [ ] Fine tuning step execution stats graph appearances
- [ ] Python version of logger


## License
MIT © [lokwkin](https://github.com/lokwkin)
