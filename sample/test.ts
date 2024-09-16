import { StepTracker } from '../src';

const fetch = (url: string) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(url);
        }, Math.floor(Math.random() * 3000) + 500);
    });
}

async function main() {
        
    const mainTracker = new StepTracker('main', {
      listeners: {
        'foo': (data) => {
          console.log(`tracker.on(foo) receiving ${data}`)
        },
        'someData': (data) => {
          console.log(`tracker.on(someData) receiving ${data}`)
        }
      }
    });
    mainTracker.on('record', (key, data) => {
      console.log(`Global tracker.on(${key}) receiving ${data}`);
    });

    await mainTracker.track(async (st: StepTracker) => {
       
        await st.step('demo', async (st: StepTracker) => {
            // Your logic here
            await st.record('foo', 'bar');
            await new Promise(resolve => setTimeout(resolve, 200));
        });
        
        await st.step('fetch', async (st: StepTracker) => {
                
            const urls = await st.step('preprocess', async (st: StepTracker) => {
                
                // Some preprocess logic
                await st.record('someData', 12345);
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

    console.log(mainTracker.ganttUrl());

}

main();

/**
 * Output: 
 * {
  "key": "main",
  "time": { "startTs": 1724441872622, "endTs": 1724441877152, "timeUsageMs": 4530 },
  "record": {},
  "substeps": [
    {
      "key": "main.demo",
      "time": { "startTs": 1724441872622, "endTs": 1724441872823, "timeUsageMs": 201 },
      "record": {
        "foo": "bar"
      },
      "substeps": []
    },
    {
      "key": "main.fetch",
      "time": { "startTs": 1724441872823, "endTs": 1724441877152, "timeUsageMs": 4329 },
      "record": {},
      "substeps": [
        {
          "key": "main.fetch.preprocess",
          "time": { "startTs": 1724441872823, "endTs": 1724441873825, "timeUsageMs": 1002 },
          "record": {
            "someData": 12345
          },
          "result": [ "https://url1.com", "https://url2.com", "https://url3.com" ],
          "substeps": []
        },
        {
          "key": "main.fetch.https://url1.com",
          "time": { "startTs": 1724441874326, "endTs": 1724441877152, "timeUsageMs": 2826 },
          "record": {},
          "result": "https://url1.com",
          "substeps": []
        },
        {
          "key": "main.fetch.https://url2.com",
          "time": { "startTs": 1724441874326, "endTs": 1724441876159, "timeUsageMs": 1833 },
          "record": {},
          "result": "https://url2.com",
          "substeps": []
        },
        {
          "key": "main.fetch.https://url3.com",
          "time": { "startTs": 1724441874327, "endTs": 1724441875935, "timeUsageMs": 1608 },
          "record": {},
          "result": "https://url3.com",
          "substeps": []
        }
      ]
    }
  
 */