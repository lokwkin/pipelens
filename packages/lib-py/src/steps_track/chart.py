import requests
from typing import List, Optional
from io import BytesIO
from pydantic import BaseModel

QUICKCHART_URL = 'https://quickchart.io'


class GanttChartArgs(BaseModel):
    unit: str = 'ms'
    min_height: int = 300
    min_width: int = 500


class TimeSpan(BaseModel):
    key: str
    startTs: int
    endTs: Optional[int] = None


class GraphItem(BaseModel):
    descriptor: str
    label: Optional[str] = None


def generate_execution_graph_quickchart(graph_items: List[GraphItem]) -> str:
    """
    Generates a URL for an execution graph visualization using QuickChart's GraphViz service.

    Args:
        graph_items: Array of graph items to visualize.

    Returns:
        A URL that can be used to display the execution graph.
    """
    param = f"digraph G {{{';'.join([f'{item.descriptor}{f' [label=\"{item.label}\"]' if item.label else ''}' for item in graph_items])}}}"
    chart_url = f"{QUICKCHART_URL}/graphviz?graph={requests.utils.quote(param)}"
    return chart_url


async def generate_gantt_chart_quickchart(time_spans: List[TimeSpan], args: Optional[GanttChartArgs] = None) -> BytesIO:
    """
    Generates a Gantt chart as a PNG image using the QuickChart API.

    This function converts an array of time spans into a horizontal bar chart
    representation and returns the chart as a binary buffer.

    Args:
        time_spans: List of TimeSpan objects containing timing information
        args: Optional configuration arguments

    Returns:
        A BytesIO buffer containing the PNG image
    """
    if args is None:
        args = GanttChartArgs()

    max_end_ts = max([(span.endTs or 0) for span in time_spans])

    chart_data = {
        "type": "horizontalBar",
        "data": {
            "labels": [
                f"{span.key} - {(span.endTs - span.startTs) / (1 if args.unit == 'ms' else 1000)}{args.unit}"
                if span.endTs else f"{span.key} - N/A{args.unit}"
                for span in time_spans
            ],
            "datasets": [
                {
                    "data": [
                        [
                            span.startTs / (1 if args.unit == 'ms' else 1000),
                            (span.endTs or max_end_ts) / (1 if args.unit == 'ms' else 1000)
                        ] for span in time_spans
                    ]
                }
            ]
        },
        "options": {
            "legend": {
                "display": False
            },
            "scales": {
                "xAxes": [
                    {
                        "position": "top",
                        "ticks": {
                            "min": 0,
                            "max": max_end_ts / (1 if args.unit == 'ms' else 1000)
                        }
                    }
                ]
            }
        }
    }

    # Calculate width and height based on the number of timeSpans
    width = max(args.min_width, len(time_spans) * 25)
    height = max(args.min_height, len(time_spans) * 25)

    try:
        # Use POST request to avoid URL length limitations
        response = requests.post(
            f"{QUICKCHART_URL}/chart",
            json={
                "chart": chart_data,
                "width": str(width),
                "height": str(height),
                "format": "png"  # This returns a PNG image as buffer
            },
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        # Return the buffer
        return BytesIO(response.content)
    except Exception as error:
        print(f"Error generating QuickChart: {error}")
        raise Exception("Failed to generate chart with QuickChart API")


def generate_gantt_chart_google(time_spans: List[TimeSpan], args: Optional[GanttChartArgs] = None) -> str:
    """
    Generates an HTML page containing a Google Gantt Chart visualization.

    Args:
        time_spans: List of TimeSpan objects containing timing information
        args: Optional configuration arguments

    Returns:
        HTML content as a string
    """
    if args is None:
        args = GanttChartArgs()

    # Calculate height based on the number of items
    height = max(args.min_height, len(time_spans) * 25)

    # Convert TimeSpan objects to dictionaries for JSON serialization
    time_spans_dict = [span.model_dump() for span in time_spans]

    # Create the HTML for a Google Gantt chart
    html = f"""
<!DOCTYPE html>
<html>
  <head>
    <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
    <script>
      google.charts.load("current", {{packages:["gantt"]}});
      google.charts.setOnLoadCallback(drawChart);

      function drawChart() {{
        try {{
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

          var steps = {time_spans_dict};
          
          // Compute the minimum start time to make timestamps relative
          var ganttStartTs = Number.MAX_SAFE_INTEGER;
          for (var i = 0; i < steps.length; i++) {{
            ganttStartTs = Math.min(ganttStartTs, steps[i].startTs);
          }}
          
          var rows = [];
          
          for (var i = 0; i < steps.length; i++) {{
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
            if (step.error) {{
              resource = 'Error';
              percentComplete = 100; // Error is considered complete
              if (step.endTs && step.endTs > 0) {{
                duration = step.endTs - step.startTs;
              }}
            }} 
            // Check if still running
            else if (step.endTs === 0 || !step.endTs) {{
              resource = 'Running';
              percentComplete = 50; // In progress
              // For running tasks, set some arbitrary duration to show them on the chart
              duration = 1000; // 1 second placeholder
            }} else {{
              percentComplete = 100; // Completed successfully
              duration = step.endTs - step.startTs;
            }}
            
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
          }}
          
          dataTable.addRows(rows);
          
          var options = {{
            height: {height},
            gantt: {{
              trackHeight: 30,
              barHeight: 20,
              labelMaxWidth: 300,
              criticalPathEnabled: false,
              percentEnabled: false,
              palette: [
                {{
                  color: '#2e7d32', // Success - dark green
                  dark: '#1b5e20',  // Darker shade
                  light: '#e8f5e9'  // Light shade for hover
                }},
                {{
                  color: '#d32f2f', // Error - red
                  dark: '#b71c1c',
                  light: '#ffebee'
                }},
                {{
                  color: '#ed6c02', // Running - orange
                  dark: '#e65100',
                  light: '#fff3e0'
                }}
              ]
            }}
          }};
          
          chart.draw(dataTable, options);
        }} catch (err) {{
          console.error('Error creating chart:', err);
          document.getElementById('gantt_chart').innerHTML = 
            '<div style="color: red; padding: 20px;">Error drawing chart: ' + err + '</div>';
        }}
      }}
    </script>
  </head>
  <body>
    <div id="gantt_chart" style="width: 100%; height: {height}px;"></div>
  </body>
</html>
"""

    return html
