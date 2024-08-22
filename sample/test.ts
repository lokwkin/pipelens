import { StepTracker } from 'steps-track';

const fetch = (url: string) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(url);
        }, Math.floor(Math.random() * 3000) + 500);
    });
}

async function main() {
        
    const mainTracker = new StepTracker('main');

    await mainTracker.track(async (st: StepTracker) => {
       
        await st.step('demo', async (st: StepTracker) => {
        
            // Your logic here
            st.log('foo', 'bar');
            await new Promise(resolve => setTimeout(resolve, 200));
        });
        
        const urls = ['https://url1.com', 'https://url2.com', 'https://url3.com'];
        await st.step('fetch', async (st: StepTracker) => {
                
            await st.step('preprocess', async (st: StepTracker) => {
                
                // Some preprocess logic
                st.log('someData', 12345);
                await new Promise(resolve => setTimeout(resolve, 1000));
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