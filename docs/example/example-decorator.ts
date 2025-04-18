import { Pipeline, Step } from '../src';
import { WithStep } from '../src/decorator';

class SamplePipeline {
  pipelineTracker: Pipeline;

  constructor() {
    this.pipelineTracker = new Pipeline('sample-pipeline');
  }

  async run() {
    await this.pipelineTracker.track(async (st) => {
      await this.loadConfig(st);
      await this.parsing(st);
    });
    console.log(JSON.stringify(this.pipelineTracker.outputFlattened(), null, 4));
    console.log(await this.pipelineTracker.ganttQuickchart());
  }

  @WithStep('loadConfig')
  async loadConfig(st: Step, str?: string) {
    console.log('str', str);
    st.record('foo', 'bar');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  @WithStep('parsing')
  async parsing(st: Step) {
    // Proprocessing
    const pages = await this.preprocess(st);

    // wait a while
    await new Promise((resolve) => setTimeout(resolve, 500));

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
  async parsePage(page: string, _st: Step) {
    return new Promise((resolve) => {
      setTimeout(
        () => {
          resolve(page);
        },
        Math.floor(Math.random() * 3000) + 500,
      );
    });
  }
}

async function main() {
  const pipeline = new SamplePipeline();
  await pipeline.run();
}

main();
