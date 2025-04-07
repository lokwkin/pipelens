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

StepsTrack supports persistent storage of pipeline runs. The data stored in persistent storage will also be available for read by [StepsTrack Dashbaord](../packages/dashboard) for analytic purpose.

```typescript
import { Pipeline, FileStorageAdapter } from 'steps-track';

const storageAdapter = new FileStorageAdapter('./data');
await storageAdapter.connect();

// Create a pipeline with file storage
const pipeline = new Pipeline('my-pipeline', {
  autoSave: true,
  storageAdapter: storageAdapter,
});

// Run your pipeline
await pipeline.track(async (st) => {
  // Your pipeline code
});

// The pipeline data is automatically saved to the './data' directory
```

### SQL Storage (Recommended)

For most applications, SQL-based storage provides an excellent balance of performance, reliability, and simplicity. You can use either SQLite for single-application deployments or PostgreSQL for scalable, multi-instance applications:

```typescript
import { Pipeline, SQLStorageAdapter } from 'steps-track';
import path from 'path';

// For SQLite:
// First install the dependencies:
// npm install sqlite3

// Create a SQLite storage adapter
const sqliteAdapter = new SQLStorageAdapter('./data/steps-track.db');
await sqliteAdapter.connect();

// OR for PostgreSQL:
// First install the dependencies:
// npm install pg

// Create a PostgreSQL storage adapter
const postgresAdapter = new SQLStorageAdapter({
  client: 'pg',
  connection: 'postgres://user:password@localhost:5432/stepstrack',
  pool: { min: 2, max: 10 }
});
await postgresAdapter.connect();

// Create a pipeline with SQL storage (choose either adapter)
const pipeline = new Pipeline('my-pipeline', {
  autoSave: true,
  storageAdapter: sqliteAdapter, // or postgresAdapter
});

// Run your pipeline
await pipeline.track(async (st) => {
  // Your pipeline code
});

// Don't forget to close the connection when done with the application
await sqliteAdapter.close(); // or postgresAdapter.close()
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
<img src="./execution-graph.png" width="70%">

#### Sample Gantt Chart
<img src="./gantt-chart.png" width="70%">

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

For more information, refer to the [StepsTrack GitHub repository](https://github.com/lokwkin/steps-track). 