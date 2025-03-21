# steps-track

[![npm version](https://badge.fury.io/js/steps-track.svg)](https://badge.fury.io/js/steps-track)
[![npm downloads](https://img.shields.io/npm/dt/steps-track.svg)](https://www.npmjs.com/package/steps-track)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

StepsTrack is a lightweight and very simple TypeScript library for ***tracking, profiling, and visualizing*** hierarchical intermediate steps in a ***pipeline-based application***. It helps break down complex logic flows into smaller steps, records intermediate execution time and data, and visualizes the execution in human-readable graphs to help debuging and optimizing. It best works in pipeline functions that consists of complex logic execution flows and multiple concurrent async functions.

## Installation

```bash
npm install steps-track
# or
yarn add steps-track
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

## Use Cases

- Debugging complex async workflows
- Performance profiling of function pipelines
- Visualizing execution flow in data processing applications
- Tracing data transformations through multi-step processes

## Documentation

For comprehensive documentation, advanced usage examples, and API reference, please visit the [GitHub repository](https://github.com/lokwkin/steps-track#readme).

## License

MIT © [lokwkin](https://github.com/lokwkin)
