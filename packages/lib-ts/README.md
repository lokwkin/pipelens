# pipelens/lib-ts

This is the Typescript library implemenation for **[pipelens](https://github.com/lokwkin/pipelens)**

PipeLens is an observability tool built to help ***tracking, visualizing and inspecting*** intermediate steps in a complex ***pipeline-based application***. It automatically captures and stores the intermediate data, results and execution times of each steps in a pipeline, visualizing the execution details and allowing easier debug or analysis through an analytic dashboard.

## Installation

```bash
npm install pipelens
```

## Quick Start

```typescript
import { Pipeline, Step } from 'pipelens';

const httpTransport = new HttpTransport({
  baseUrl: 'http://localhost:3000',
});

const pipeline = new Pipeline('my-pipeline', {
  autoSave: 'finish',
  transport: httpTransport,
});


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

// Export output
const exported = pipeline.outputPipelineLogs();

// Gantt Chart Visualization
const ganttChartBuffer = await pipeline.ganttQuickchart(ganttArgs);
```

See [GitHub repository](https://github.com/lokwkin/pipelens#readme) for more usages and repository introduction.