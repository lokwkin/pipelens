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

## Transporting Logs to Dashboard

StepsTrack supports automatically transporting near real-time data to [StepsTrack Dashbaord](../packages/dashboard) for analytic purpose.

```typescript
import { Pipeline, FileStorageAdapter } from 'steps-track';

// HTTP transport for sending data to a dashboard
const httpTransport = new HttpTransport({
  baseUrl: 'http://localhost:3000/api/', // URL of your dashboard API
  batchLogs: true, // Enable batching for better performance
  flushInterval: 5000, // Flush logs every 5 seconds
  maxBatchSize: 50, // Maximum batch size before forcing a flush
});

const pipeline = new Pipeline('pipeline', {
  autoSave: true,
  transport: httpTransport,
});

// Run your pipeline
await pipeline.track(async (st) => {
  // Your pipeline code
});

// Make sure to flush any pending logs when your application is shutting down
await httpTransport.flushAndStop();

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

## LLM Usage Tracking

StepsTrack provides built-in support for tracking and analyzing LLM responses and token usage through the `LLMTrack` helper extension.

```typescript
import { Pipeline, Step, LLMTrack } from 'steps-track';
import { OpenAI } from 'openai';

async function llmPipeline(query: string) {
  const pipeline = new Pipeline('llm-pipeline');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  return await pipeline.track(async (st: Step) => {
    const summary = await st.step('summarization', async (st: Step) => {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: query }],
      });
      
      LLMTrack.track(st, completion); // Track the LLM response

      return completion.choices[0].message.content;
    });
  });

  // Once you've tracked LLM responses, you can calculate the total token usage across your pipeline:
  const usages = LLMTrack.getTotalUsage(pipeline);
  console.log(usages);

  // Print: {
  //   "gpt-4o-mini": {
  //     "prompt_tokens": 243
  //     "completion_tokens": 345
  //     "total_tokens": 588
  //   },
  //   "gpt-4o": {
  //     "prompt_tokens": 1531
  //     "completion_tokens": 631
  //     "total_tokens": 2162
  //   }
  // }
}
```
For more information, refer to the [StepsTrack GitHub repository](https://github.com/lokwkin/steps-track). 