/* eslint-disable @typescript-eslint/no-unused-vars */
import { Step, Pipeline, StepGanttArg, HttpTransport } from 'pipelens';
import * as fs from 'fs';

const randomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const parsePage = (page: string) => {
  return new Promise((resolve) => {
    setTimeout(
      () => {
        resolve(page);
      },
      randomInt(500, 5000),
    );
  });
};

async function main() {
  // HTTP transport for sending data to a dashboard
  const httpTransport = new HttpTransport({
    baseUrl: 'http://localhost:3000/', // URL of your dashboard
    batchLogs: true, // Enable batching for better performance
    flushInterval: 5000, // Flush logs every 5 seconds
    maxBatchSize: 50, // Maximum batch size before forcing a flush
    debug: true,
  });

  const pipeline = new Pipeline('pipeline', {
    autoSave: 'real_time',
    transport: httpTransport, // Setting this will automatically transport logs to the dashboard
  });

  pipeline.on('step-record', (stepKey, key, data) => {
    console.log(`[${stepKey}] Record: ${key} = ${data}`);
  });
  pipeline.on('step-success', (stepKey, result) => {
    console.log(`[${stepKey}] Success. Result: ${result ? JSON.stringify(result) : 'N/A'}`);
  });
  pipeline.on('step-error', (stepKey, error) => {
    console.log(`[${stepKey}] Error: ${error.message}`);
  });

  await pipeline.track(async (st: Step) => {
    await st.step('load_config', async (st: Step) => {
      // ...
      // Your logic here
      // ...
      st.record('foo', 'bar');
      await new Promise((resolve) => setTimeout(resolve, randomInt(100, 500)));
    });

    await st.step('parsing', async (st: Step) => {
      const pages = await st.step('preprocess', async (st: Step) => {
        // Some preprocess logic
        st.record('pageCount', 3);
        await new Promise((resolve) => setTimeout(resolve, randomInt(1000, 3000)));
        return Array.from({ length: 20 }, (_, idx) => `page_${idx + 1}`);
      });

      await new Promise((resolve) => setTimeout(resolve, randomInt(100, 500)));

      // Concurrent substeps
      await Promise.all(
        pages.map(async (page) => {
          return st.step(`${page}`, async (_st: Step) => {
            return await parsePage(page);
          });
        }),
      );

      await st
        .step('sample-error', async (st) => {
          await new Promise((resolve) => setTimeout(resolve, randomInt(100, 7000)));
          throw new Error('Sample Error');
        })
        .catch((err) => {
          console.log('Catch error', err.message);
        });
    });
  });

  await httpTransport.flushAndStop();

  const ganttArgs: StepGanttArg = {
    unit: 's', // 's' | 'ms'. Default 'ms'
    minWidth: 500, // Default 500
    minHeight: 300, // Default 300
    filter: /pipeline.parsing(\.[a-zA-Z0-9-_])?/, // string[] | RegExp. if not provided, all steps will be included
  };

  const stepsFlattened = pipeline.outputFlattened();

  console.log(`Steps: ${JSON.stringify(stepsFlattened, null, 2)}`);

  const ganttChartBuffer = await pipeline.ganttQuickchart(ganttArgs);
  const ganttChartHtml = pipeline.ganttGoogleChartHtml(ganttArgs);

  fs.writeFileSync('gantt.png', ganttChartBuffer);
  fs.writeFileSync('gantt.html', ganttChartHtml);

  // Make sure to flush any pending logs when your application is shutting down
  await httpTransport.flushAndStop();
}

main();
