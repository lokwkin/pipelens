# steps-track/lib-ts

This is the Typescript library implemenation for **steps-track**

## Installation

```bash
npm install steps-track
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

// Export output
const exported = pipeline.outputSteps();

// Gantt Chart Visualization
const ganttChartBuffer = await pipeline.ganttQuickchart(ganttArgs);
```

See [GitHub repository](https://github.com/lokwkin/steps-track#readme) for repository introduction and usage description.