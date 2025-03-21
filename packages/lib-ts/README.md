# steps-track/lib-ts

Typescript library implemenation for **steps-track**. See [GitHub repository](https://github.com/lokwkin/steps-track#readme) for project introduction and usage description.

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
