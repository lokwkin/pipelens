# Advanced Usage of StepsTrack

This guide covers advanced usage patterns for StepsTrack, including decorators, event handling, persistent storage, and visualization customization.

## Using Decorators

StepsTrack provides decorators for easier integration with ES6 classes:

```typescript
import { Pipeline, Step, WithStep } from 'steps-track';

class MyPipeline {
  @WithStep('parsing')
  async parsing(st: Step) {
    // Preprocessing
    const pages = await this.preprocess(st);
    
    // Concurrently parse pages
    await Promise.all(
      pages.map(async (page) => {
        return await this.parsePage(page, st);
      }),
    );
  }

  @WithStep('preprocess')
  async preprocess(st: Step) {
    st.record('pageCount', 3);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return Array.from({ length: 3 }, (_, idx) => `page_${idx + 1}`);
  }

  @WithStep('parsePage')
  async parsePage(page: string, st: Step) {
    // Process the page
    return `processed-${page}`;
  }
}

// Usage
const pipeline = new Pipeline('my-pipeline');
await pipeline.track(async (st) => {
  const myPipeline = new MyPipeline();
  await myPipeline.parsing(st);
});
```

**Important**: When using the decorator, the last argument of the decorated method MUST be a `Step` instance of the parent step.

## Event Handling

StepsTrack emits events during step execution that you can listen to:

```typescript
/**
* StepMeta {
*    result?: any;
*    error?: string;
*    time: {
*      startTs: number;
*      endTs: number;
*      timeUsageMs: number;
*    };
*    records: Record<string, any>;
* }
*/

const pipeline = new Pipeline('my-pipeline');

// Emitted when a step starts
pipeline.on('step-start', (stepKey, stepMeta) => {
  console.log(`Step started: ${stepKey}`);
});

// Emitted when a step records data
pipeline.on('step-record', (stepKey, key, data, stepMeta) => {
  console.log(`Step ${stepKey} recorded ${key}: ${JSON.stringify(data)}`);
});

// Emitted when a step completes successfully
pipeline.on('step-success', (stepKey, result, stepMeta) => {
  console.log(`Step ${stepKey} succeeded with result: ${JSON.stringify(result)}`);
});

// Emitted when a step throws an error
pipeline.on('step-error', (stepKey, error, stepMeta) => {
  console.log(`Step ${stepKey} failed with error: ${error.message}`);
});

// Emitted when a step completes, regardless of success or error
pipeline.on('step-complete', (stepKey, stepMeta) => {
  console.log(`Step ${stepKey} completed in ${stepMeta.time.timeUsageMs}ms`);
});
```

## Persistent Storage

StepsTrack supports persistent storage of pipeline runs:

```typescript
import { Pipeline, FileStorageAdapter } from 'steps-track';

// Create a pipeline with file storage
const pipeline = new Pipeline('my-pipeline', {
  autoSave: true,
  storageAdapter: new FileStorageAdapter('./.steps-track'),
});

// Run your pipeline
await pipeline.track(async (st) => {
  // Your pipeline code
});

// The pipeline data is automatically saved to the 'runs' directory
```

### Redis Storage

For production environments, you can use Redis storage:

```typescript
import { Pipeline, RedisStorageAdapter } from 'steps-track';
import { createClient } from 'redis';

// Create a Redis client
const redisClient = createClient({
  url: 'redis://localhost:6379',
});
await redisClient.connect();

// Create a pipeline with Redis storage
const pipeline = new Pipeline('my-pipeline', {
  autoSave: true,
  storageAdapter: new RedisStorageAdapter(redisClient),
});

// Run your pipeline
await pipeline.track(async (st) => {
  // Your pipeline code
});
```

## Custom Visualization

### Gantt Chart Customization

You can customize the Gantt chart visualization:

```typescript
const ganttArgs = {
  unit: 'ms', // 's' | 'ms'. Default 'ms'
  minWidth: 800, // Default 500
  minHeight: 400, // Default 300
  filter: /pipeline\.parsing(\.[a-zA-Z0-9-_])?/, // Filter steps by regex pattern
};

// Generate a Gantt chart URL
const ganttChartBuffer = await pipeline.ganttQuickchart(ganttArgs);
```

### Execution Graph Customization

You can customize the execution graph visualization:

```typescript
const executionGraphUrl = pipeline.executionGraphQuickchart({
  width: 800,
  height: 600,
});
```

#### Sample Execution Graph
<img src="./sample/execution-graph.png" width="70%">

#### Sample Gantt Chart
<img src="./sample/gantt-chart.png" width="70%">

## Integration with Real-World Pipelines

### Example: AI Pipeline Integration

```typescript
import { Pipeline, Step } from 'steps-track';

async function aiPipeline(query: string) {
  const pipeline = new Pipeline('ai-pipeline');
  
  return await pipeline.track(async (st: Step) => {
    // Step 1: Retrieve relevant documents
    const docs = await st.step('retrieval', async (st: Step) => {
      const results = await searchDocuments(query);
      st.record('retrievedCount', results.length);
      return results;
    });
    
    // Step 2: Generate embeddings
    const embeddings = await st.step('embeddings', async (st: Step) => {
      return await Promise.all(
        docs.map(async (doc, index) => {
          return st.step(`embed-doc-${index}`, async (st: Step) => {
            const embedding = await generateEmbedding(doc.text);
            st.record('embeddingDimensions', embedding.length);
            return embedding;
          });
        })
      );
    });
    
    // Step 3: Rank documents
    const rankedDocs = await st.step('ranking', async (st: Step) => {
      const ranked = rankDocuments(docs, embeddings);
      st.record('topScore', ranked[0].score);
      return ranked;
    });
    
    // Step 4: Generate response
    return await st.step('generation', async (st: Step) => {
      const context = rankedDocs.slice(0, 3).map(doc => doc.text).join('\n');
      st.record('contextLength', context.length);
      
      const response = await generateResponse(query, context);
      st.record('responseLength', response.length);
      
      return response;
    });
  });
}
```

### Example: Data Processing Pipeline

```typescript
import { Pipeline, Step } from 'steps-track';

async function processData(data: any[]) {
  const pipeline = new Pipeline('data-processing');
  
  return await pipeline.track(async (st: Step) => {
    // Step 1: Validate data
    const validData = await st.step('validate', async (st: Step) => {
      st.record('totalRecords', data.length);
      
      const valid = data.filter(item => isValid(item));
      st.record('validRecords', valid.length);
      
      return valid;
    });
    
    // Step 2: Transform data
    const transformedData = await st.step('transform', async (st: Step) => {
      return await Promise.all(
        validData.map(async (item, index) => {
          return st.step(`transform-item-${index}`, async (st: Step) => {
            const result = await transformItem(item);
            st.record('transformationApplied', result.transformationType);
            return result.data;
          });
        })
      );
    });
    
    // Step 3: Store data
    return await st.step('store', async (st: Step) => {
      const result = await storeData(transformedData);
      st.record('storedRecords', result.storedCount);
      return result;
    });
  });
}
```

## Performance Analysis

You can analyze performance across multiple runs:

```typescript
import { Pipeline, FileStorageAdapter } from 'steps-track';

// Create a storage adapter to read previous runs
const storage = new FileStorageAdapter('./.steps-track');

// Get statistics for a specific step across multiple runs
const stats = await storage.getStepStats('my-pipeline.data-processing');
console.log(`Average time: ${stats.avgTimeMs}ms`);
console.log(`Min time: ${stats.minTimeMs}ms`);
console.log(`Max time: ${stats.maxTimeMs}ms`);
console.log(`Median time: ${stats.medianTimeMs}ms`);
console.log(`90th percentile: ${stats.p90TimeMs}ms`);
```

For more information, refer to the [StepsTrack GitHub repository](https://github.com/lokwkin/steps-track). 