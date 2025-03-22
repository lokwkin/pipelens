/**
 * Chart visualization functions for StepsTrack Portal
 */

const charts = {
  /**
   * Draw the step time series chart
   * @param {Object} chartData - Processed data for chart
   */
  drawStepTimeSeriesChart(chartData) {
    const chartContainer = document.getElementById('step-time-series-chart-container');
    const chartElement = document.getElementById('step-time-series-chart');
    
    // If no data or empty data, hide the chart container and return
    if (!chartData || chartData.timePoints.length === 0) {
      chartContainer.classList.add('d-none');
      return;
    }
    
    // Show the chart container
    chartContainer.classList.remove('d-none');
    
    // Load Google Charts
    google.charts.load('current', {'packages':['corechart']});
    google.charts.setOnLoadCallback(drawChart);
    
    function drawChart() {
      // Create data table
      const data = new google.visualization.DataTable();
      
      // Add columns
      data.addColumn('datetime', 'Time');
      data.addColumn('number', 'Max Duration (ms)');
      data.addColumn('number', 'Avg Duration (ms)');
      data.addColumn('number', 'Min Duration (ms)');
      data.addColumn('number', 'Success Count');
      data.addColumn('number', 'Error Count');
      
      // Add rows
      const rows = chartData.timePoints.map((time, index) => [
        time,
        chartData.maxDurations[index],
        chartData.avgDurations[index],
        chartData.minDurations[index],
        chartData.successCounts[index],
        chartData.errorCounts[index]
      ]);
      
      data.addRows(rows);
      
      // Set chart options
      const options = {
        height: 400,
        legend: { position: 'top', maxLines: 3 },
        seriesType: 'line',
        series: {
          0: { color: '#d32f2f', lineWidth: 2 }, // Max Duration (red)
          1: { color: '#2c6e9b', lineWidth: 2 }, // Avg Duration (blue)
          2: { color: '#2e7d32', lineWidth: 2 }, // Min Duration (green)
          3: { type: 'bars', color: '#2e7d32', targetAxisIndex: 1 }, // Success Count (green)
          4: { type: 'bars', color: '#d32f2f', targetAxisIndex: 1 }  // Error Count (red)
        },
        isStacked: true,
        vAxes: {
          0: { title: 'Duration (ms)', minValue: 0 },
          1: { title: 'Count', minValue: 0 }
        },
        hAxis: {
          title: 'Time',
          format: 'HH:mm:ss'
        },
        chartArea: {
          width: '80%',
          height: '70%'
        }
      };
      
      // Create and draw the chart
      const chart = new google.visualization.ComboChart(chartElement);
      chart.draw(data, options);
    }
  },

  /**
   * Load and display Gantt chart for a run
   * @param {string} runId - Run ID
   */
  async loadGanttChart(runId) {
    try {
      const ganttPlaceholder = document.querySelector('.gantt-placeholder');
      const expandContainer = document.querySelector('.gantt-expand-container');
      
      // Show loading state
      ganttPlaceholder.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Loading Gantt Chart...</p></div>';
      
      // Fetch the steps data for the run
      const response = await fetch(`/api/runs/${runId}/steps`);
      const steps = await response.json();
      
      if (!steps || !steps.length) {
        ganttPlaceholder.innerHTML = '<div class="alert alert-warning">No steps data available for Gantt Chart</div>';
        expandContainer.classList.add('d-none');
        return;
      }
      
      // Create a div for the chart
      ganttPlaceholder.innerHTML = `<div id="gantt_chart" style="width: 100%; height: 400px;"></div>`;
      
      // Show expand button if there are more than 10 steps
      if (steps.length > 10) {
        expandContainer.classList.remove('d-none');
        const expandBtn = document.getElementById('gantt-expand-btn');
        
        // Set up click handler for expand/collapse
        expandBtn.onclick = () => {
          // Get current expanded state
          let willBeExpanded = !expandBtn.classList.contains('expanded');
          
          // Set the chart height based on whether we're expanding or collapsing
          const chartHeight = willBeExpanded ? 
            Math.max(400, steps.length * 30 + 50) : // Expanded height
            400;                                    // Collapsed height
          
          // Update class state
          if (willBeExpanded) {
            expandBtn.classList.add('expanded');
          } else {
            expandBtn.classList.remove('expanded');
          }
          
          // Set the correct icon and text based on the new state
          const icon = expandBtn.querySelector('i');
          const textSpan = expandBtn.querySelector('span');
          
          if (willBeExpanded) {
            // Show "collapse" UI (up arrow + "Show Less")
            icon.className = 'fas fa-chevron-up';
            textSpan.textContent = ' Show Less';
          } else {
            // Show "expand" UI (down arrow + "Show More")
            icon.className = 'fas fa-chevron-down';
            textSpan.textContent = ' Show More';
          }
          
          // Update chart height and redraw
          document.getElementById('gantt_chart').style.height = `${chartHeight}px`;
          this.drawGanttChart(steps, chartHeight);
        };
      } else {
        expandContainer.classList.add('d-none');
      }
      
      // Load the Google Charts visualization library
      google.charts.load('current', {'packages':['gantt']});
      google.charts.setOnLoadCallback(() => {
        this.drawGanttChart(steps, 400); // Initial height
        
        // Ensure the expand button has the correct icon on initial load
        const expandBtn = document.getElementById('gantt-expand-btn');
        if (expandBtn) {
          const isExpanded = expandBtn.classList.contains('expanded');
          const icon = expandBtn.querySelector('i');
          const textSpan = expandBtn.querySelector('span');
          
          if (isExpanded) {
            icon.className = 'fas fa-chevron-up';
            textSpan.textContent = ' Show Less';
          } else {
            icon.className = 'fas fa-chevron-down';
            textSpan.textContent = ' Show More';
          }
        }
      });
    } catch (error) {
      console.error('Error generating Gantt chart:', error);
      document.querySelector('.gantt-placeholder').innerHTML = '<div class="alert alert-danger">Error Generating Gantt Chart</div>';
      document.querySelector('.gantt-expand-container').classList.add('d-none');
    }
  },

  /**
   * Draw the Gantt chart with the provided steps data
   * @param {Array} steps - Array of step objects
   * @param {number} height - Height of the chart in pixels
   */
  drawGanttChart(steps, height = 400) {
    const data = new google.visualization.DataTable();
    
    // Add columns
    data.addColumn('string', 'Task ID');
    data.addColumn('string', 'Task Name');
    data.addColumn('string', 'Resource');
    data.addColumn('date', 'Start Date');
    data.addColumn('date', 'End Date');
    data.addColumn('number', 'Duration');
    data.addColumn('number', 'Percent Complete');
    data.addColumn('string', 'Dependencies');
    
    // Compute the minimum start date, used as the overall start date for the Gantt chart
    const ganttStartTs = steps.map(step => step.time.startTs).reduce((a, b) => Math.min(a, b));

    const rows = steps.map(step => {
      // Create start and end dates
      const relativeStartTs = step.time.startTs - ganttStartTs;
      
      // Handle steps that are still running or failed
      let endDate;
      let percentComplete;
      
      if (step.time.endTs && step.time.endTs > 0) {
        endDate = new Date(step.time.endTs);
        percentComplete = 100; // Completed
      } else {
        // For running steps, use current time as temporary end
        endDate = new Date();
        percentComplete = 50; // In progress
      }
      
      // Determine color based on status
      let resource = 'Success';
      if (step.error) {
        resource = 'Error';
      } else if (!step.time.endTs || step.time.endTs === 0) {
        resource = 'Running';
      }
      
      return [
        step.key, // Task ID
        step.key, // Task Name
        resource, // Resource (used for coloring)
        new Date(relativeStartTs),
        null,
        step.time.timeUsageMs, // Duration
        percentComplete,
        null // Dependencies (we're not showing dependencies)
      ];
    });
    
    data.addRows(rows);
    
    // Set chart options
    const options = {
      height: height,
      backgroundColor: '#e8f0fe',  // Light blue background
      gantt: {
        trackHeight: 30,  // each row is 30px tall
        barHeight: 20,
        labelMaxWidth: 500,
        criticalPathEnabled: false,
        percentEnabled: false,
        palette: [
          {
            color: '#2e7d32', // Success - dark green
            dark: '#1b5e20', // Darker shade
            light: '#e8f5e9' // Light shade for hover
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
      },
    };
    
    // Create and draw the chart
    const chart = new google.visualization.Gantt(document.getElementById('gantt_chart'));
    chart.draw(data, options);

    google.visualization.events.addListener(chart, 'select', function() {
      const selection = chart.getSelection();
      
      // Get the steps table
      const stepsTable = document.getElementById('steps-table').querySelector('tbody');
      const allRows = stepsTable.querySelectorAll('tr:not(.details-row)');
      const allDetailRows = stepsTable.querySelectorAll('tr.details-row');
      
      if (selection.length > 0) {
        // A row was selected
        const selectedIndex = selection[0].row;
        
        // Hide all rows first
        allRows.forEach((row, index) => {
          row.style.display = 'none';
          
          // Also hide corresponding detail rows
          const detailRow = document.getElementById(`step-details-${index}`);
          if (detailRow) {
            detailRow.style.display = 'none';
          }
        });
        
        // Show only the selected row
        if (allRows[selectedIndex]) {
          allRows[selectedIndex].style.display = 'table-row';
          
          // Add a "clear selection" button if it doesn't exist
          let clearButton = document.getElementById('clear-gantt-selection');
          if (!clearButton) {
            clearButton = document.createElement('button');
            clearButton.id = 'clear-gantt-selection';
            clearButton.className = 'btn btn-sm btn-outline-secondary mt-2 mb-3';
            clearButton.innerHTML = '<i class="fas fa-times"></i> Clear Selection';
            
            clearButton.addEventListener('click', function() {
              // Show all rows again
              allRows.forEach(row => row.style.display = 'table-row');
              
              // Restore details rows to their previous state (hidden by default)
              allDetailRows.forEach(row => {
                // Check if this row was previously expanded
                const wasExpanded = app.state.expandedRows.has(row.id);
                row.style.display = wasExpanded ? 'table-row' : 'none';
              });
              
              // Remove the clear button
              this.remove();
              
              // Clear the chart selection
              chart.setSelection([]);
              
              // Force a redraw of the chart to clear visual selection state
              chart.draw(data, options);
            });
            
            // Insert before the steps table
            const stepsCount = document.getElementById('steps-count');
            stepsCount.parentNode.insertBefore(clearButton, stepsCount.nextSibling);
          }
        }
      } else {
        // Selection was cleared, show all rows
        allRows.forEach(row => row.style.display = 'table-row');
        
        // Restore details rows to their previous state
        allDetailRows.forEach(row => {
          // Check if this row was previously expanded
          const wasExpanded = app.state.expandedRows.has(row.id);
          row.style.display = wasExpanded ? 'table-row' : 'none';
        });
        
        // Remove the clear button if it exists
        const clearButton = document.getElementById('clear-gantt-selection');
        if (clearButton) {
          clearButton.remove();
        }
      }
    });
  }
}; 