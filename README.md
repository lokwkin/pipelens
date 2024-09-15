# StepsTrack

StepsTrack is a simple library for tracking the time and data of the intermediate steps in a function for further debugging / enchancements. Useful for enhancing performance of a pipeline-like function that consists of multiple steps and/or conccurent async functions.

## Features

- Track intermediates data, results and execution time of all sub-steps.
- Generate **Gantt chart** for visual representation of step durations.

## Installation

```
npm install --save steps-track
```
Note: If you encounter error installing chart.js / node-canvas, see https://github.com/Automattic/node-canvas/wiki#installation-guides

## Example

#### Sample Code
```js
import { StepTracker } from 'steps-track';

async function main() {
        
    const mainTracker = new StepTracker('main');

    await mainTracker.track(async (st: StepTracker) => {
       
        await st.step('demo', async (st: StepTracker) => {
        
            // Your logic here
            st.record('foo', 'bar');
            await new Promise(resolve => setTimeout(resolve, 200));
        });
        
        await st.step('fetch', async (st: StepTracker) => {
                
            const urls = await st.step('preprocess', async (st: StepTracker) => {
                
                // Some preprocess logic
                st.record('someData', 12345);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return ['https://url1.com', 'https://url2.com', 'https://url3.com'];
            });
        
            await new Promise(resolve => setTimeout(resolve, 500));
        
            // Concurrent sub steps
            await Promise.all(urls.map(async (url) => {
                return st.step(`${url}`, async (st: StepTracker) => {
                    return await fetch(url);
                });
            }));
        });
    });
    
    console.log(JSON.stringify(mainTracker.output(), null, 2));

    // output gantt chart

    const ganttArgs = {
        unit: 'ms',                 // 's' | 'ms'. Default 'ms'
        minWidth: 100,              // Default 500
        minHeight: 100,             // Default 300
        includeSteps: /main.fetch/  // string[] | RegExp. if not provided, all steps will be included
    }
    // Gantt chart generated via quickchart.io
    const ganttUrl = mainTracker.ganttUrl(ganttArgs);     

    // Gantt chart buffer generated locally using chart.js, in png format
    const ganttBuffer = mainTracker.ganttLocal(ganttArgs);
}

```
#### Gantt Chart Output
<img src="./sample/sample-gantt.png" width="70%">

## To Do
- Generate speed analysis based on multiple runs of the same function

## License
[MIT License](LICENSE)
