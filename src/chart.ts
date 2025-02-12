import type { ChartConfiguration } from 'chart.js';

const QUICKCHART_URL = 'https://quickchart.io';

export type GanttChartArgs = {
  unit?: 'ms' | 's';
  minHeight?: number;
  minWidth?: number;
};

export type TimeSpan = {
  key: string;
  startTs: number;
  endTs: number;
};

export type GraphItem = {
  descriptor: string;
  label?: string;
};

export function generateExecutionGraphQuickchart(graphItems: GraphItem[]): string {
  const param = `digraph G {${graphItems.map((item) => `${item.descriptor}${item.label ? ` [label="${item.label}"]` : ''};`).join('\n')}}`;
  const chartUrl = `${QUICKCHART_URL}/graphviz?graph=${encodeURIComponent(param)}`;
  return chartUrl;
}

export function generateGanttChartQuickchart(timeSpans: TimeSpan[], args?: GanttChartArgs): string {
  const { unit, minWidth, minHeight } = {
    ...{ unit: 'ms', minWidth: 500, minHeight: 300 },
    ...(args ?? {}),
  };

  const maxEndTs = Math.max(...timeSpans.map((span) => span.endTs));

  const chartData = {
    type: 'horizontalBar',
    data: {
      labels: timeSpans.map(
        (span) => `${span.key} - ${(span.endTs - span.startTs) / (unit === 'ms' ? 1 : 1000)}${unit}`,
      ),
      datasets: [
        {
          data: timeSpans.map((span) => [
            span.startTs / (unit === 'ms' ? 1 : 1000),
            span.endTs / (unit === 'ms' ? 1 : 1000),
          ]),
        },
      ],
    },
    options: {
      legend: {
        display: false,
      },
      scales: {
        xAxes: [
          {
            position: 'top',
            ticks: {
              min: 0,
              max: maxEndTs / (unit === 'ms' ? 1 : 1000),
            },
          },
        ],
      },
    },
  };

  const chartUrl = `${QUICKCHART_URL}/chart?c=${encodeURIComponent(JSON.stringify(chartData))}&w=${Math.max(minWidth, timeSpans.length * 25)}&h=${Math.max(minHeight, timeSpans.length * 25)}`;
  return chartUrl;
}

// Type guard to check if chartjs-node-canvas is available
function isChartJSAvailable(): boolean {
  try {
    require.resolve('chartjs-node-canvas');
    require.resolve('chart.js');
    return true;
  } catch (e) {
    return false;
  }
}

export async function generateGanttChartLocal(timeSpans: TimeSpan[], args?: GanttChartArgs): Promise<Buffer> {
  const { unit, minWidth, minHeight } = {
    ...{ unit: 'ms', minWidth: 500, minHeight: 300 },
    ...(args ?? {}),
  };

  if (!isChartJSAvailable()) {
    throw new Error(
      'chartjs-node-canvas and chart.js are required but not installed properly. Please install it using:\n' +
        'npm install chart.js@3 chartjs-node-canvas@4',
    );
  }

  const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');

  const maxEndTs = Math.max(...timeSpans.map((span) => span.endTs));

  const chartData: ChartConfiguration = {
    type: 'bar', // ChartJS uses 'bar' for both vertical and horizontal bar charts
    plugins: [
      {
        id: 'customCanvasBackgroundColor',
        beforeDraw: (chart: any, _args: any, _options: any) => {
          const { ctx } = chart;
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, chart.width, chart.height);
          ctx.restore();
        },
      },
    ],
    data: {
      labels: timeSpans.map(
        (span) => `${span.key} - ${(span.endTs - span.startTs) / (unit === 'ms' ? 1 : 1000)}${unit}`,
      ),
      datasets: [
        {
          label: 'offset',
          data: timeSpans.map((span) => span.startTs / (unit === 'ms' ? 1 : 1000)),
          backgroundColor: 'white',
        },
        {
          label: 'data',
          data: timeSpans.map((span) => (span.endTs - span.startTs) / (unit === 'ms' ? 1 : 1000)),
          backgroundColor: '#23395d',
        },
      ],
    },
    options: {
      indexAxis: 'y', // This makes the bar chart horizontal
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          position: 'top',
          min: 0,
          max: maxEndTs / (unit === 'ms' ? 1 : 1000),
          stacked: true,
          ticks: {
            color: '#333333',
          },
        },
        y: {
          beginAtZero: true,
          stacked: true,
          ticks: {
            color: '#333333',
          },
        },
      },
      layout: {
        padding: {
          left: 10,
          right: 10,
          top: 10,
          bottom: 10,
        },
      },
    },
  };

  // Create a canvas and render the chart
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: Math.max(minWidth, timeSpans.length * 25),
    height: Math.max(minHeight, timeSpans.length * 25),
  });
  const image = await chartJSNodeCanvas.renderToBuffer(chartData);
  return image;
}
