/**
 * UI manipulation functions for StepsTrack Portal
 */

const ui = {
  /**
   * Show a specific view and update UI accordingly
   * @param {string} viewId - The ID of the view to show
   */
  showView(viewId) {
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view');
    
    // Update active link
    navLinks.forEach(l => l.classList.remove('active'));
    document.querySelector(`.nav-link[data-view="${viewId}"]`)?.classList.add('active');
    
    // Show selected view
    views.forEach(view => {
      view.classList.remove('active');
      if (view.id === viewId) {
        view.classList.add('active');
        app.state.currentView = viewId;
        
        // Update URL with the current view
        const url = new URL(window.location);
        // Map view IDs (HTML element IDs) to URL parameter values
        const urlViewParam = viewId === 'runs-view' ? 'runs-view' :
                            viewId === 'run-detail-view' ? 'run-detail' :
                            viewId === 'step-stats-view' ? 'step-stats-view' :
                            viewId === 'step-analysis-view' ? 'step-analysis' : viewId;
        url.searchParams.set('view', urlViewParam);
        
        // Update page title based on current view
        const pageTitle = document.getElementById('page-title');
        if (viewId === 'runs-view') {
          pageTitle.textContent = 'Pipeline Runs';
        } else if (viewId === 'step-stats-view') {
          pageTitle.textContent = 'Step Execution Stats';
        }
        
        // Get state from URL parameters
        const params = new URLSearchParams(window.location.search);
        const selectedPipeline = params.get('pipeline');
        const selectedStepName = params.get('stepName');
        
        // Load data based on the current view and selected pipeline
        if (selectedPipeline) {
          if (viewId === 'runs-view') {
            this.loadRuns(selectedPipeline);
          } else if (viewId === 'step-stats-view') {
            // Always load step names first to populate the dropdown
            this.loadStepNames(selectedPipeline).then(() => {
              // If a step name is selected in the URL params, load its data
              if (selectedStepName) {
                this.loadStepTimeSeries(selectedPipeline, selectedStepName);
              } else {
                // Hide step stats content if no step selected
                document.getElementById('step-stats-summary').classList.add('d-none');
                document.getElementById('step-time-series-chart-container').classList.add('d-none');
                document.getElementById('step-stats-table').querySelector('tbody').innerHTML = 
                  '<tr><td colspan="4" class="text-center py-4">Select a step to view statistics</td></tr>';
              }
            });
          }
        }
        
        // Update browser history
        window.history.pushState({view: urlViewParam}, '', url);
      }
    });
  },

  /**
   * Show run details for a specific run
   * @param {string} runId - Run ID
   */
  showRunDetails(runId) {
    // Reset expanded rows when navigating to a different run
    const params = new URLSearchParams(window.location.search);
    const currentRunId = params.get('runId');
    
    if (currentRunId !== runId) {
      app.state.expandedRows = new Set(); // Keep this in memory state as specified
    }
    
    // Switch to run detail view
    this.showView('run-detail-view');
    
    // Update URL - showView has already set the view parameter
    const url = new URL(window.location);
    url.searchParams.set('runId', runId);
    window.history.replaceState({view: 'run-detail', runId}, '', url);
    
    // Update page title
    document.getElementById('page-title').textContent = `Run Details: ${runId}`;
    
    // Load run details (not an auto-refresh)
    this.loadRunDetails(runId, false);
  },

  /**
   * Show step analysis details
   * @param {Object} step - Step object
   */
  showStepAnalysis(step) {
    // Switch to step analysis view
    this.showView('step-analysis-view');
    
    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('view', 'step-analysis');
    
    // Get runId from URL parameters
    const params = new URLSearchParams(window.location.search);
    const runId = params.get('runId');
    
    url.searchParams.set('runId', runId);
    url.searchParams.set('stepKey', step.key);
    window.history.pushState({view: 'step-analysis', runId, stepKey: step.key}, '', url);
    
    // Update page title
    document.getElementById('page-title').textContent = `Step Analysis: ${step.name}`;
    
    // Update details
    const stepAnalysisDetails = document.getElementById('step-analysis-details');
    stepAnalysisDetails.innerHTML = `
      <p><strong>Step Key:</strong> ${step.key}</p>
      <p><strong>Start Time:</strong> ${utils.formatDateTime(step.time.startTs)}</p>
      <p><strong>End Time:</strong> ${utils.formatDateTime(step.time.endTs)}</p>
      <p><strong>Duration:</strong> ${utils.formatDuration(step.time.timeUsageMs)}</p>
    `;
  },

  /**
   * Load and display pipeline runs in the runs table
   * @param {string} pipeline - Pipeline name
   */
  async loadRuns(pipeline) {
    const runsTable = document.getElementById('runs-table').querySelector('tbody');
    
    try {
      // Get date range from URL parameters
      const params = new URLSearchParams(window.location.search);
      const timePreset = params.get('timePreset') || app.state.globalDateRange.timePreset;
      const startDate = params.get('startDate') || app.state.globalDateRange.startDate;
      const endDate = params.get('endDate') || app.state.globalDateRange.endDate;
      
      const dateRange = {
        timePreset,
        startDate,
        endDate
      };
      
      const runs = await api.loadRuns(pipeline, dateRange);
      
      if (!runs?.length) {
        runsTable.innerHTML = '<tr><td colspan="6" class="text-center py-4">No runs found</td></tr>';
        return;
      }

      runsTable.innerHTML = '';
      runs.forEach(run => {
        const startTime = utils.formatDateTime(run.startTime);
        const endTime = run.endTime ? utils.formatDateTime(run.endTime) : 'In progress';
        const duration = utils.formatDuration(run.duration);
        
        let statusClass = '';
        if (run.status === 'completed') {
          statusClass = 'status-success';
        } else if (run.status === 'failed') {
          statusClass = 'status-error';
        } else if (run.status === 'running') {
          statusClass = 'status-running';
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${run.runId}</td>
          <td>${run.pipeline}</td>
          <td>${startTime}</td>
          <td>${endTime}</td>
          <td>${duration}</td>
          <td class="${statusClass}">${run.status}</td>
        `;
        
        row.addEventListener('click', () => {
          this.showRunDetails(run.runId);
        });
        
        runsTable.appendChild(row);
      });
    } catch (error) {
      console.error('Error loading runs:', error);
      runsTable.innerHTML = '<tr><td colspan="6" class="text-center py-4">Error loading runs</td></tr>';
    }
  },

  /**
   * Load and display run details including steps
   * @param {string} runId - Run ID
   * @param {boolean} isAutoRefresh - Whether this is an auto-refresh call
   */
  async loadRunDetails(runId, isAutoRefresh = false) {
    const stepsTable = document.getElementById('steps-table').querySelector('tbody');
    
    try {
      // Only save expanded state if this is an auto-refresh
      if (isAutoRefresh) {
        const expandedRows = new Set();
        document.querySelectorAll('.details-row').forEach(row => {
          if (row.style.display !== 'none') {
            expandedRows.add(row.id);
          }
        });
        app.state.expandedRows = expandedRows;
      }
      
      // Update page title if not an auto-refresh
      if (!isAutoRefresh) {
        document.getElementById('page-title').textContent = `Run Details: ${runId}`;
      }
      
      // Load Gantt chart
      charts.loadGanttChart(runId);
      
      // Fetch steps data
      const steps = await api.loadRunDetails(runId);
      
      // Update steps count
      const stepsCount = steps ? steps.length : 0;
      document.getElementById('steps-count').textContent = `Steps: ${stepsCount}`;
      
      // Load steps
      if (steps && Array.isArray(steps)) {
        stepsTable.innerHTML = '';
        
        steps.forEach((step, index) => {
          const startTime = utils.formatDateTime(step.time.startTs);
          const endTime = utils.formatDateTime(step.time.endTs);
          const duration = utils.formatDuration(step.time.timeUsageMs);
          
          let status = 'Completed';
          let statusClass = 'status-success';
          
          if (step.error) {
            status = 'Error';
            statusClass = 'status-error';
          } else if (step.time.endTs === 0) {
            status = 'Running';
            statusClass = 'status-running';
          }
          
          // Create unique IDs for each row and details section
          const rowId = `step-row-${index}`;
          const detailsId = `step-details-${index}`;
          
          // Main row
          const row = document.createElement('tr');
          row.id = rowId;
          row.setAttribute('data-target', detailsId);
          row.innerHTML = `
            <td>${step.key}</td>
            <td><a href="#" class="step-name-link">${step.name}</a></td>
            <td>${startTime}</td>
            <td>${endTime}</td>
            <td>${duration}</td>
            <td class="${statusClass}">${status}</td>
            <td class="text-end">
              <i class="fas fa-chevron-down expand-icon"></i>
            </td>
          `;
          stepsTable.appendChild(row);
          
          // Details row
          const detailsRow = document.createElement('tr');
          detailsRow.id = detailsId;
          detailsRow.className = 'details-row';
          
          // Check if this row was expanded before refresh
          const wasExpanded = app.state.expandedRows.has(detailsId);
          detailsRow.style.display = wasExpanded ? 'table-row' : 'none';
          
          // Update expand icon based on expanded state
          if (wasExpanded) {
            row.querySelector('.expand-icon').classList.remove('fa-chevron-down');
            row.querySelector('.expand-icon').classList.add('fa-chevron-up');
          }
          
          // Create the details cell
          const detailsCell = document.createElement('td');
          detailsCell.colSpan = 7;
          
          let detailsContent = '<div class="step-details">';
          
          // Record section
          const recordJson = JSON.stringify(step.record || {}, null, 2);
          detailsContent += `
            <div class="detail-section">
              <div class="detail-header">
                <h4>Record:</h4>
                <div class="detail-actions">
                  <button class="view-btn" data-content="${encodeURIComponent(recordJson)}">
                    <i class="fa fa-expand"></i>
                  </button>
                  <button class="copy-btn" data-content="${encodeURIComponent(recordJson)}">
                    <i class="fa fa-copy"></i>
                  </button>
                </div>
              </div>
              <div class="detail-content">
                <textarea readonly rows="10">${recordJson}</textarea>
              </div>
            </div>
          `;
          
          // Result section (if available)
          if (step.result !== undefined) {
            const resultJson = JSON.stringify(step.result, null, 2);
            detailsContent += `
              <div class="detail-section">
                <div class="detail-header">
                  <h4>Result:</h4>
                  <div class="detail-actions">
                    <button class="view-btn" data-content="${encodeURIComponent(resultJson)}">
                      <i class="fa fa-expand"></i>
                    </button>
                    <button class="copy-btn" data-content="${encodeURIComponent(resultJson)}">
                      <i class="fa fa-copy"></i>
                    </button>
                  </div>
                </div>
                <div class="detail-content">
                  <textarea readonly rows="10">${resultJson}</textarea>
                </div>
              </div>
            `;
          }
          
          // Error section (if available)
          if (step.error) {
            detailsContent += `
              <div class="detail-section">
                <div class="detail-header">
                  <h4>Error:</h4>
                  <div class="detail-actions">
                    <button class="view-btn" data-content="${encodeURIComponent(step.error)}">
                      <i class="fa fa-expand"></i>
                    </button>
                    <button class="copy-btn" data-content="${encodeURIComponent(step.error)}">
                      <i class="fa fa-copy"></i>
                    </button>
                  </div>
                </div>
                <div class="detail-content">
                  <textarea readonly rows="10">${step.error}</textarea>
                </div>
              </div>
            `;
          }
          
          detailsContent += '</div>';
          detailsCell.innerHTML = detailsContent;
          detailsRow.appendChild(detailsCell);
          stepsTable.appendChild(detailsRow);
          
          // Add step name link functionality
          const stepNameLink = row.querySelector('.step-name-link');
          stepNameLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Get pipeline from URL
            const currentUrl = new URL(window.location);
            const pipeline = currentUrl.searchParams.get('pipeline');
            
            if (!pipeline) {
              console.error('No pipeline selected');
              return;
            }
            
            // Prepare URL for navigation to step stats view
            const url = new URL(window.location);
            url.searchParams.set('view', 'step-stats-view');
            url.searchParams.set('stepName', step.name);
            url.searchParams.delete('runId');
            url.searchParams.delete('stepKey');
            
            // Use pushState to navigate to the step stats view
            window.history.pushState({view: 'step-stats-view', stepName: step.name}, '', url);
            
            // Show the step stats view
            this.showView('step-stats-view');
          });

          // Add event listeners for view buttons
          detailsRow.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
              e.stopPropagation(); // Prevent row expansion when clicking view
              const content = decodeURIComponent(this.getAttribute('data-content'));
              const title = this.closest('.detail-section').querySelector('h4').textContent;
              
              // Calculate popup dimensions (80% of screen size)
              const width = Math.min(1200, Math.floor(window.innerWidth * 0.8));
              const height = Math.min(900, Math.floor(window.innerHeight * 0.8));
              
              // Calculate center position relative to the browser window
              const left = Math.floor(window.screenX + (window.innerWidth - width) / 2);
              const top = Math.floor(window.screenY + (window.innerHeight - height) / 2);
              
              // Open popup window with calculated dimensions and position
              const popup = window.open('', '_blank', 
                `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
              );
              
              popup.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                  <title>${title}</title>
                  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                  <style>
                    body {
                      margin: 0;
                      padding: 20px;
                      font-family: 'JetBrains Mono', monospace;
                      background: #f5f7fa;
                      height: 100vh;
                      box-sizing: border-box;
                    }
                    .container {
                      position: relative;
                      height: calc(100vh - 40px);
                    }
                    pre {
                      background: white;
                      padding: 20px;
                      border-radius: 4px;
                      border: 1px solid #dde2e7;
                      overflow: auto;
                      margin: 0;
                      font-size: 14px;
                      line-height: 1.6;
                      white-space: pre-wrap;
                      word-wrap: break-word;
                      height: 100%;
                      box-sizing: border-box;
                    }
                    .copy-btn {
                      position: absolute;
                      top: 10px;
                      right: 10px;
                      background: white;
                      border: 1px solid #dde2e7;
                      border-radius: 4px;
                      padding: 8px 12px;
                      font-size: 14px;
                      color: #2c6e9b;
                      cursor: pointer;
                      display: flex;
                      align-items: center;
                      gap: 6px;
                      transition: all 0.2s ease;
                      z-index: 1;
                    }
                    .copy-btn:hover {
                      background: #f5f7fa;
                      border-color: #2c6e9b;
                    }
                    .copy-btn i {
                      font-size: 14px;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <button class="copy-btn" onclick="copyContent()">
                      <i class="fa fa-copy"></i>
                      Copy
                    </button>
                    <pre>${content}</pre>
                  </div>
                  <script>
                    function copyContent() {
                      const content = document.querySelector('pre').textContent;
                      navigator.clipboard.writeText(content).then(() => {
                        const btn = document.querySelector('.copy-btn');
                        const originalHtml = btn.innerHTML;
                        btn.innerHTML = '<i class="fa fa-check"></i> Copied!';
                        setTimeout(() => {
                          btn.innerHTML = originalHtml;
                        }, 2000);
                      }).catch(err => {
                        console.error('Failed to copy text:', err);
                      });
                    }
                  </script>
                </body>
                </html>
              `);
              popup.document.close();
            });
          });

          // Add event listeners for copy buttons
          detailsRow.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
              e.stopPropagation(); // Prevent row expansion when clicking copy
              const content = decodeURIComponent(this.getAttribute('data-content'));
              navigator.clipboard.writeText(content).then(() => {
                // Show temporary success message
                const originalText = this.innerHTML;
                this.innerHTML = '<i class="fa fa-check"></i>';
                setTimeout(() => {
                  this.innerHTML = originalText;
                }, 2000);
              }).catch(err => {
                console.error('Failed to copy text: ', err);
              });
            });
          });
        });
        
        // Make rows clickable to expand/collapse
        document.querySelectorAll('#steps-table tbody tr:not(.details-row)').forEach(row => {
          row.addEventListener('click', function(e) {
            // Don't trigger if clicking on the step name link
            if (e.target.closest('.step-name-link')) {
              return;
            }
            
            const targetId = this.getAttribute('data-target');
            const detailsRow = document.getElementById(targetId);
            const isExpanded = detailsRow.style.display !== 'none';
            const expandIcon = this.querySelector('.expand-icon');
            
            // Update expanded state in the app state object (keeping UI interaction state in memory)
            if (isExpanded) {
              app.state.expandedRows.delete(targetId);
              expandIcon.classList.remove('fa-chevron-up');
              expandIcon.classList.add('fa-chevron-down');
            } else {
              app.state.expandedRows.add(targetId);
              expandIcon.classList.remove('fa-chevron-down');
              expandIcon.classList.add('fa-chevron-up');
            }
            
            detailsRow.style.display = isExpanded ? 'none' : 'table-row';
          });
        });
        
        // Add event listeners for all copy buttons
        document.querySelectorAll('.copy-btn').forEach(btn => {
          btn.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent row expansion when clicking copy
            const content = decodeURIComponent(this.getAttribute('data-content'));
            navigator.clipboard.writeText(content).then(() => {
              // Show temporary success message
              const originalText = this.innerHTML;
              this.innerHTML = '<i class="fa fa-check"></i>';
              setTimeout(() => {
                this.innerHTML = originalText;
              }, 2000);
            }).catch(err => {
              console.error('Failed to copy text: ', err);
            });
          });
        });
      } else {
        stepsTable.innerHTML = '<tr><td colspan="7" class="text-center py-4">No steps found</td></tr>';
      }
    } catch (error) {
      console.error('Error loading run details:', error);
      stepsTable.innerHTML = '<tr><td colspan="7" class="text-center py-4">Error loading run details</td></tr>';
    }
  },

  /**
   * Load step names for a pipeline
   * @param {string} pipeline - Pipeline name
   * @returns {Promise<Array>} Array of step names
   */
  async loadStepNames(pipeline) {
    const stepNameSelect = document.getElementById('step-name-select');
    
    try {
      const steps = await api.loadStepNames(pipeline);
      
      stepNameSelect.innerHTML = '<option value="">Select a step</option>';
      
      steps.forEach(step => {
        stepNameSelect.innerHTML += `<option value="${step}">${step}</option>`;
      });
      
      // Get selected step from URL parameters
      const params = new URLSearchParams(window.location.search);
      const selectedStepName = params.get('stepName');
      
      // If a step is selected in the URL, set the dropdown value
      if (selectedStepName && steps.includes(selectedStepName)) {
        stepNameSelect.value = selectedStepName;
      }
      
      return steps; // Return the steps for promise chaining
    } catch (error) {
      console.error('Error loading step names:', error);
      stepNameSelect.innerHTML = '<option value="">Error loading steps</option>';
      return []; // Return empty array in case of error
    }
  },

  /**
   * Load and display step time series data
   * @param {string} pipeline - Pipeline name
   * @param {string} stepName - Step name
   */
  async loadStepTimeSeries(pipeline, stepName) {
    const stepStatsTable = document.getElementById('step-stats-table').querySelector('tbody');
    const stepStatsSummary = document.getElementById('step-stats-summary');
    const chartContainer = document.getElementById('step-time-series-chart-container');
    
    // Early return with message if no step name is provided
    if (!stepName) {
      stepStatsSummary.classList.add('d-none');
      chartContainer.classList.add('d-none');
      stepStatsTable.innerHTML = '<tr><td colspan="4" class="text-center py-4">Select a step to view statistics</td></tr>';
      return;
    }
    
    try {
      // Get date range from URL parameters or fallback to app state
      const params = new URLSearchParams(window.location.search);
      const timePreset = params.get('timePreset') || app.state.globalDateRange.timePreset;
      const startDate = params.get('startDate') || app.state.globalDateRange.startDate;
      const endDate = params.get('endDate') || app.state.globalDateRange.endDate;
      
      const dateRange = {
        timePreset,
        startDate,
        endDate
      };
      
      // Fetch time series data for the step
      const data = await api.loadStepTimeSeries(pipeline, stepName, dateRange);
      
      // Check if we have the new response format with stats
      const hasStats = data && data.stats;
      const instances = hasStats ? data.timeSeries : data;
      
      if (!instances || !instances.length) {
        stepStatsTable.innerHTML = '<tr><td colspan="4" class="text-center py-4">No instances found</td></tr>';
        stepStatsSummary.classList.add('d-none');
        chartContainer.classList.add('d-none');
        return;
      }
      
      // Show chart container since we have data
      chartContainer.classList.remove('d-none');
      
      // Display statistics if available
      if (hasStats) {
        // Update statistics display
        document.getElementById('stats-total-executions').textContent = data.stats.totalExecutions;
        document.getElementById('stats-success-count').textContent = data.stats.successCount;
        document.getElementById('stats-error-count').textContent = data.stats.errorCount;
        document.getElementById('stats-avg-duration').textContent = utils.formatDuration(data.stats.avgDuration, true);
        document.getElementById('stats-min-duration').textContent = utils.formatDuration(data.stats.minDuration, true);
        document.getElementById('stats-max-duration').textContent = utils.formatDuration(data.stats.maxDuration, true);
        
        // Show the stats summary section
        stepStatsSummary.classList.remove('d-none');
      } else {
        // Hide stats if not available
        stepStatsSummary.classList.add('d-none');
      }
      
      // Process data for chart
      const chartData = utils.processTimeSeriesDataForChart(instances, dateRange);
      
      // Draw the chart
      charts.drawStepTimeSeriesChart(chartData);
      
      // Populate the table with instances
      stepStatsTable.innerHTML = '';
      
      instances.forEach(instance => {
        const timestamp = utils.formatDateTime(instance.timestamp);
        const duration = utils.formatDuration(instance.duration);
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${timestamp}</td>
          <td>${instance.runId}</td>
          <td>${instance.stepKey}</td>
          <td>${duration}</td>
        `;
        
        // Add click event listener to the Run ID link
        const runIdLink = row.querySelector('td:nth-child(2)');
        runIdLink.style.cursor = 'pointer';
        runIdLink.style.color = 'var(--primary)';
        runIdLink.addEventListener('click', (e) => {
          e.preventDefault();
          this.showRunDetails(instance.runId);
        });
        
        stepStatsTable.appendChild(row);
      });
    } catch (error) {
      console.error('Error loading step stats:', error);
      stepStatsTable.innerHTML = '<tr><td colspan="4" class="text-center py-4">Error loading stats</td></tr>';
      stepStatsSummary.classList.add('d-none');
      chartContainer.classList.add('d-none');
    }
  },

  /**
   * Initialize date pickers with flatpickr
   */
  initDatePickers() {
    // Check if Flatpickr is loaded
    if (typeof flatpickr === 'function') {
      console.log('Flatpickr is loaded correctly');
      
      // Flag to track if changes are programmatic
      let isProgrammaticChange = false;
      
      // Get date values from URL or use defaults
      const params = new URLSearchParams(window.location.search);
      const startDate = params.get('startDate') ? new Date(params.get('startDate')) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endDate = params.get('endDate') ? new Date(params.get('endDate')) : new Date();
      
      // Initialize global date pickers with Flatpickr
      const globalStartDatePicker = flatpickr("#global-start-date", {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        time_24hr: true,
        defaultDate: startDate,
        onChange: function(selectedDates, dateStr) {
          // Only change to Custom if the user manually selected a date
          if (!isProgrammaticChange && dateStr !== "") {
            document.getElementById('global-time-preset-select').value = "custom";
            
            // Update URL
            const url = new URL(window.location);
            url.searchParams.set('timePreset', 'custom');
            url.searchParams.set('startDate', dateStr);
            window.history.replaceState({}, '', url);
          }
        }
      });
      
      const globalEndDatePicker = flatpickr("#global-end-date", {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        time_24hr: true,
        defaultDate: endDate,
        onChange: function(selectedDates, dateStr) {
          // Only change to Custom if the user manually selected a date
          if (!isProgrammaticChange && dateStr !== "") {
            document.getElementById('global-time-preset-select').value = "custom";
            
            // Update URL
            const url = new URL(window.location);
            url.searchParams.set('timePreset', 'custom');
            url.searchParams.set('endDate', dateStr);
            window.history.replaceState({}, '', url);
          }
        }
      });
      
      console.log('Date pickers initialized:', globalStartDatePicker, globalEndDatePicker);
      
      // Get preset from URL or use default
      const timePreset = params.get('timePreset') || "1440";
      document.getElementById('global-time-preset-select').value = timePreset;
      
      // Trigger the change event to set up the initial state
      const event = new Event('change');
      document.getElementById('global-time-preset-select').dispatchEvent(event);
    } else {
      console.error('Flatpickr is not loaded!');
    }
  },

  /**
   * Initialize time range preset dropdown
   */
  initTimePresets() {
    const presetSelect = document.getElementById('global-time-preset-select');
    
    // Get preset from URL or use default
    const params = new URLSearchParams(window.location.search);
    const timePreset = params.get('timePreset') || "1440"; // Default to 24 hours
    
    // Set value to the one from URL or default
    presetSelect.value = timePreset;
    
    // Trigger the change event to set up the initial state
    const event = new Event('change');
    presetSelect.dispatchEvent(event);
    
    // Add event listener for global time preset dropdown
    presetSelect.addEventListener('change', function() {
      // Skip if "Custom" is selected
      if (this.value === "custom") {
        return;
      }
      
      // For preset selections, clear both date pickers visually
      document.getElementById('global-start-date').value = '';
      document.getElementById('global-end-date').value = '';
      
      // Store the preset value in URL parameters and state
      const url = new URL(window.location);
      url.searchParams.set('timePreset', this.value);
      url.searchParams.delete('startDate');
      url.searchParams.delete('endDate');
      
      // Save in app state as fallback
      app.state.globalDateRange.timePreset = this.value;
      app.state.globalDateRange.startDate = null;
      app.state.globalDateRange.endDate = null;
      
      // Update URL without navigation
      window.history.replaceState({}, '', url);
    });
  }
}; 