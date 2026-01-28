const QUICKCHART_URL = 'https://quickchart.io';
import axios from 'axios';

export type GanttChartArgs = {
  unit?: 'ms' | 's';
  minHeight?: number;
  minWidth?: number;
};

export type TimeSpan = {
  key: string;
  startTs: number;
  endTs?: number;
};

export type GraphItem = {
  descriptor: string;
  label?: string;
};

/**
 * Generates a URL for an execution graph visualization using QuickChart's GraphViz service.
 *
 * @param {GraphItem[]} graphItems - Array of graph items to visualize.
 * @returns {string} A URL that can be used to display the execution graph.
 */
export function generateExecutionGraphQuickchart(graphItems: GraphItem[]): string {
  const param = `digraph G {${graphItems.map((item) => `${item.descriptor}${item.label ? ` [label="${item.label}"]` : ''};`).join('\n')}}`;
  const chartUrl = `${QUICKCHART_URL}/graphviz?graph=${encodeURIComponent(param)}`;
  return chartUrl;
}

/**
 * Generates a Gantt chart as a PNG image using the QuickChart API.
 *
 * This function converts an array of time spans into a horizontal bar chart
 * representation and returns the chart as a binary buffer.
 */
export async function generateGanttChartQuickchart(timeSpans: TimeSpan[], args?: GanttChartArgs): Promise<Buffer> {
  const { unit, minWidth, minHeight } = {
    ...{ unit: 'ms', minWidth: 500, minHeight: 300 },
    ...(args ?? {}),
  };

  const maxEndTs = Math.max(...timeSpans.map((span) => span.endTs || 0));

  const chartData = {
    type: 'horizontalBar',
    data: {
      labels: timeSpans.map(
        (span) =>
          `${span.key} - ${span.endTs ? (span.endTs - span.startTs) / (unit === 'ms' ? 1 : 1000) : 'N/A'}${unit}`,
      ),
      datasets: [
        {
          data: timeSpans.map((span) => [
            span.startTs / (unit === 'ms' ? 1 : 1000),
            (span.endTs ?? maxEndTs) / (unit === 'ms' ? 1 : 1000),
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

  // Calculate width and height based on the number of timeSpans
  const width = Math.max(minWidth, timeSpans.length * 25);
  const height = Math.max(minHeight, timeSpans.length * 25);

  try {
    // Use POST request to avoid URL length limitations
    const response = await axios.post(
      `${QUICKCHART_URL}/chart`,
      {
        chart: JSON.stringify(chartData),
        width: width.toString(),
        height: height.toString(),
        format: 'png', // This returns a PNG image as buffer
      },
      { responseType: 'arraybuffer', headers: { 'Content-Type': 'application/json' } },
    );
    // Return the buffer directly
    return Buffer.from(response.data);
  } catch (error) {
    console.error('Error generating QuickChart:', error);
    throw new Error('Failed to generate chart with QuickChart API');
  }
}

/**
 * Generates an HTML page containing a Google Gantt Chart visualization.
 */
export function generateGanttChartGoogle(timeSpans: TimeSpan[], args?: GanttChartArgs): string {
  const { minHeight } = {
    ...{ minHeight: 300 },
    ...(args ?? {}),
  };

  // Calculate height based on the number of items
  const height = Math.max(minHeight, timeSpans.length * 25);

  // Create the HTML for a Google Gantt chart
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
    <script>
      google.charts.load("current", {packages:["gantt"]});
      google.charts.setOnLoadCallback(drawChart);

      function drawChart() {
        try {
          var container = document.getElementById('gantt_chart');
          var chart = new google.visualization.Gantt(container);
          var dataTable = new google.visualization.DataTable();

          // Add columns
          dataTable.addColumn('string', 'Task ID');
          dataTable.addColumn('string', 'Task Name');
          dataTable.addColumn('string', 'Resource');
          dataTable.addColumn('date', 'Start Date');
          dataTable.addColumn('date', 'End Date');
          dataTable.addColumn('number', 'Duration');
          dataTable.addColumn('number', 'Percent Complete');
          dataTable.addColumn('string', 'Dependencies');

          var steps = ${JSON.stringify(timeSpans)};
          
          // Compute the minimum start time to make timestamps relative
          var ganttStartTs = Number.MAX_SAFE_INTEGER;
          for (var i = 0; i < steps.length; i++) {
            ganttStartTs = Math.min(ganttStartTs, steps[i].startTs);
          }
          
          var rows = [];
          
          for (var i = 0; i < steps.length; i++) {
            var step = steps[i];
            
            // Create relative start time (milliseconds from the start of the first step)
            var relativeStartTs = step.startTs - ganttStartTs;
            
            // For the Gantt chart, use a base date (Jan 1, 1970) and add the relative time
            // This ensures the chart displays properly
            var startDate = new Date(relativeStartTs);
            var percentComplete;
            var duration = null;
            
            // Default to Success status
            var resource = 'Success';
            
            // Check for error (if there's an error property in your data)
            if (step.error) {
              resource = 'Error';
              percentComplete = 100; // Error is considered complete
              if (step.endTs && step.endTs > 0) {
                duration = step.endTs - step.startTs;
              }
            } 
            // Check if still running
            else if (step.endTs === 0 || !step.endTs) {
              resource = 'Running';
              percentComplete = 50; // In progress
              // For running tasks, set some arbitrary duration to show them on the chart
              duration = 1000; // 1 second placeholder
            } else {
              percentComplete = 100; // Completed successfully
              duration = step.endTs - step.startTs;
            }
            
            rows.push([
              step.key,           // Task ID
              step.key,           // Task Name
              resource,           // Resource (used for coloring)
              startDate,          // Start Date
              null,               // End Date (null when using duration)
              duration,           // Duration
              percentComplete,    // Percent Complete
              null                // Dependencies
            ]);
          }
          
          dataTable.addRows(rows);
          
          var options = {
            height: ${height},
            gantt: {
              trackHeight: 30,
              barHeight: 20,
              labelMaxWidth: 300,
              criticalPathEnabled: false,
              percentEnabled: false,
              palette: [
                {
                  color: '#2e7d32', // Success - dark green
                  dark: '#1b5e20',  // Darker shade
                  light: '#e8f5e9'  // Light shade for hover
                },
                {
                  color: '#d32f2f', // Error - red
                  dark: '#b71c1c',
                  light: '#ffebee'
                },
                {
                  color: '#ed6c02', // Running - orange
                  dark: '#e65100',
                  light: '#fff3e0'
                }
              ]
            }
          };
          
          chart.draw(dataTable, options);
        } catch (err) {
          console.error('Error creating chart:', err);
          document.getElementById('gantt_chart').innerHTML = 
            '<div style="color: red; padding: 20px;">Error drawing chart: ' + err + '</div>';
        }
      }
    </script>
  </head>
  <body>
    <div id="gantt_chart" style="width: 100%; height: ${height}px;"></div>
  </body>
</html>
`;

  return html;
}
