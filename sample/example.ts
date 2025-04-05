/* eslint-disable @typescript-eslint/no-unused-vars */
import { Step, Pipeline, StepGanttArg, RedisStorageAdapter } from '../packages/lib-ts/src';
import { FileStorageAdapter } from '../packages/lib-ts/src/storage/file-storage-adapter';
import * as fs from 'fs';

const parsePage = (page: string) => {
  return new Promise((resolve) => {
    setTimeout(
      () => {
        resolve(page);
      },
      Math.floor(Math.random() * 3000) + 500,
    );
  });
};

async function main() {
  const storageAdapter = new RedisStorageAdapter({ url: 'redis://localhost:6379' });
  await storageAdapter.connect();
  const pipeline = new Pipeline('pipeline', {
    autoSave: true,
    storageAdapter,
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
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    await st.step('parsing', async (st: Step) => {
      const pages = await st.step('preprocess', async (st: Step) => {
        // Some preprocess logic
        st.record('pageCount', 3);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return Array.from({ length: 3 }, (_, idx) => `page_${idx + 1}`);
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

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
          await new Promise((resolve) => setTimeout(resolve, 800));
          throw new Error('Sample Error');
        })
        .catch((err) => {
          console.log('Catch error', err.message);
        });
    });
  });

  const ganttArgs: StepGanttArg = {
    unit: 's', // 's' | 'ms'. Default 'ms'
    minWidth: 500, // Default 500
    minHeight: 300, // Default 300
    filter: /pipeline.parsing(\.[a-zA-Z0-9-_])?/, // string[] | RegExp. if not provided, all steps will be included
  };

  const stepsHierarchy = pipeline.outputNested();
  const stepsFlattened = pipeline.outputFlattened();

  const ganttChartBuffer = await pipeline.ganttQuickchart(ganttArgs);
  const ganttChartHtml = pipeline.ganttGoogleChartHtml(ganttArgs);

  fs.writeFileSync('gantt.png', ganttChartBuffer);
  fs.writeFileSync('gantt.html', ganttChartHtml);

  console.log('Steps Hierarchy: ', JSON.stringify(stepsHierarchy, null, 2));
}

main();
