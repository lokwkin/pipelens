# Basic Usage of StepsTrack

This guide will help you get started with integrating StepsTrack into your project.

## Installation

```bash
npm install --save steps-track
```

## Basic Pipeline Integration

The simplest way to use StepsTrack is to create a `Pipeline` instance and use the `track` method to wrap your execution flow:

```typescript
import { Pipeline, Step } from 'steps-track';

// Create a new pipeline with a name
const pipeline = new Pipeline('my-pipeline');

// Track your execution flow
await pipeline.track(async (st: Step) => {
  // Your code here
  
  // Track a step
  await st.step('step1', async (st: Step) => {
    // Logic for step1
    await someAsyncOperation();
    
    // Record data for this step
    st.record('key', 'value');
  });
  
  // Track another step
  const result = await st.step('step2', async (st: Step) => {
    // Logic for step2
    return 'step2-result';
  });
  
  console.log(result); // 'step2-result'
});
```

## Nested Steps

You can create nested steps to represent hierarchical operations:

```typescript
await pipeline.track(async (st: Step) => {
  await st.step('parent-step', async (st: Step) => {
    // Parent step logic
    
    await st.step('child-step-1', async (st: Step) => {
      // Child step 1 logic
    });
    
    await st.step('child-step-2', async (st: Step) => {
      // Child step 2 logic
    });
  });
});
```

## Parallel Steps

You can run steps in parallel using `Promise.all`:

```typescript
await pipeline.track(async (st: Step) => {
  const items = ['item1', 'item2', 'item3'];
  
  await Promise.all(
    items.map(async (item) => {
      return st.step(`process-${item}`, async (st: Step) => {
        // Process each item in parallel
        return `processed-${item}`;
      });
    })
  );
});
```

## Recording Data

You can record data within steps to track intermediate values:

```typescript
await st.step('data-processing', async (st: Step) => {
  // Some processing logic
  const count = calculateCount();
  
  // Record the count for later analysis
  st.record('itemCount', count);
  
  // Continue processing
  const result = processItems(count);
  return result;
});
```

## Visualizing Results

After running your pipeline, you can generate visualizations:

```typescript
// Generate a Gantt chart Buffer using quickchart.io
const ganttChartBuffer = pipeline.ganttQuickchart();

// Generate a Gantt Chart HTML using google chart
const ganttChartGoogle = pipeline.ganttGoogleChartHtml();

// Get the hierarchical output of all steps
const stepsHierarchy = pipeline.outputNested();
console.log('Steps Hierarchy:', JSON.stringify(stepsHierarchy, null, 2));
```

## Error Handling

StepsTrack automatically captures errors in steps:

```typescript
await pipeline.track(async (st: Step) => {
  try {
    await st.step('risky-operation', async (st: Step) => {
      throw new Error('Something went wrong');
    });
  } catch (error) {
    console.log('Caught error:', error.message);
    // The error is still recorded in the step's metadata
  }
});
```

For more advanced usage, including decorators, event handling, and storage options, see the [Advanced Usage](./advanced-usage.md) guide. 