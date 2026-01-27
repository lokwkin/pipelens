# pipelens/lib-ts

This is the Typescript library implemenation for **[pipelens](https://github.com/lokwkin/pipelens)**

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
