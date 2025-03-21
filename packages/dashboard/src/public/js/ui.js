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
        
        // Update page title based on current view
        const pageTitle = document.getElementById('page-title');
        if (viewId === 'runs-view') {
          pageTitle.textContent = 'Pipeline Runs';
        } else if (viewId === 'step-stats-view') {
          pageTitle.textContent = 'Step Execution Stats';
        }
        
        // Load data based on the current view and selected pipeline
        if (app.state.selectedPipeline) {
          if (viewId === 'runs-view') {
            this.loadRuns(app.state.selectedPipeline);
          } else if (viewId === 'step-stats-view' && app.state.selectedStepName) {
            this.loadStepNames(app.state.selectedPipeline).then(() => {
              document.getElementById('step-name-select').value = app.state.selectedStepName;
              this.loadStepTimeSeries(app.state.selectedPipeline, app.state.selectedStepName);
            });
          } else if (viewId === 'step-stats-view') {
            // If we're switching to step stats view but no step is selected,
            // make sure the step names are loaded
            this.loadStepNames(app.state.selectedPipeline);
          }
        }
      }
    });
  },

  /**
   * Show run details for a specific run
   * @param {string} runId - Run ID
   */
  showRunDetails(runId) {
    // Reset expanded rows when navigating to a different run
    if (app.state.selectedRun !== runId) {
      app.state.expandedRows = new Set();
    }
    
    app.state.selectedRun = runId;
    
    // Switch to run detail view
    this.showView('run-detail-view');
    
    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('view', 'run-detail');
    url.searchParams.set('runId', runId);
    window.history.pushState({view: 'run-detail', runId}, '', url);
    
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
    app.state.selectedStep = step;
    
    // Switch to step analysis view
    this.showView('step-analysis-view');
    
    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('view', 'step-analysis');
    url.searchParams.set('runId', app.state.selectedRun);
    url.searchParams.set('stepKey', step.key);
    window.history.pushState({view: 'step-analysis', runId: app.state.selectedRun, stepKey: step.key}, '', url);
    
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
      const runs = await api.loadRuns(pipeline, app.state.globalDateRange);
      
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
                <button class="copy-btn" data-content="${encodeURIComponent(recordJson)}">
                  <i class="fa fa-copy"></i>
                </button>
              </div>
              <div class="detail-content">
                <textarea readonly>${recordJson}</textarea>
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
                  <button class="copy-btn" data-content="${encodeURIComponent(resultJson)}">
                    <i class="fa fa-copy"></i>
                  </button>
                </div>
                <div class="detail-content">
                  <textarea readonly>${resultJson}</textarea>
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
                  <button class="copy-btn" data-content="${encodeURIComponent(step.error)}">
                    <i class="fa fa-copy"></i>
                  </button>
                </div>
                <div class="detail-content">
                  <textarea readonly>${step.error}</textarea>
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
            
            // Instead of showing step analysis, navigate to step stats view
            app.state.selectedStepName = step.name;
            
            // Update step name select dropdown
            this.loadStepNames(app.state.selectedPipeline).then(() => {
              document.getElementById('step-name-select').value = step.name;
              
              // Load the step time series data
              this.loadStepTimeSeries(app.state.selectedPipeline, step.name);
              
              // Switch to step stats view
              this.showView('step-stats-view');
              
              // Update URL
              const url = new URL(window.location);
              url.searchParams.set('view', 'step-stats-view');
              url.searchParams.set('stepName', step.name);
              url.searchParams.delete('runId');
              url.searchParams.delete('stepKey');
              window.history.pushState({view: 'step-stats-view', stepName: step.name}, '', url);
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
            
            // Update expanded state in our state object
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
    
    try {
      if (!stepName) {
        stepStatsSummary.classList.add('d-none');
        return;
      }
      
      // Fetch time series data for the step
      const data = await api.loadStepTimeSeries(pipeline, stepName, app.state.globalDateRange);
      
      // Check if we have the new response format with stats
      const hasStats = data && data.stats;
      const instances = hasStats ? data.timeSeries : data;
      
      if (!instances || !instances.length) {
        stepStatsTable.innerHTML = '<tr><td colspan="4" class="text-center py-4">No instances found</td></tr>';
        stepStatsSummary.classList.add('d-none');
        document.getElementById('step-time-series-chart-container').classList.add('d-none');
        return;
      }
      
      // Display statistics if available
      if (hasStats) {
        // Update statistics display
        document.getElementById('stats-total-executions').textContent = data.stats.totalExecutions;
        document.getElementById('stats-success-count').textContent = data.stats.successCount;
        document.getElementById('stats-error-count').textContent = data.stats.errorCount;
        document.getElementById('stats-avg-duration').textContent = utils.formatDuration(data.stats.avgDuration);
        document.getElementById('stats-min-duration').textContent = utils.formatDuration(data.stats.minDuration);
        document.getElementById('stats-max-duration').textContent = utils.formatDuration(data.stats.maxDuration);
        
        // Show the stats summary section
        stepStatsSummary.classList.remove('d-none');
      } else {
        // Hide stats if not available
        stepStatsSummary.classList.add('d-none');
      }
      
      // Process data for chart
      const timeRange = {
        startDate: app.state.globalDateRange.startDate,
        endDate: app.state.globalDateRange.endDate
      };
      const chartData = utils.processTimeSeriesDataForChart(instances, timeRange);
      
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
      document.getElementById('step-stats-summary').classList.add('d-none');
      document.getElementById('step-time-series-chart-container').classList.add('d-none');
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
      
      // Initialize global date pickers with Flatpickr
      const globalStartDatePicker = flatpickr("#global-start-date", {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        time_24hr: true,
        defaultDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        onChange: function(selectedDates, dateStr) {
          // Only change to Custom if the user manually selected a date
          if (!isProgrammaticChange && dateStr !== "") {
            document.getElementById('global-time-preset-select').value = "custom";
          }
        }
      });
      
      const globalEndDatePicker = flatpickr("#global-end-date", {
        enableTime: true,
        dateFormat: "Y-m-d H:i:S",
        time_24hr: true,
        defaultDate: new Date(), // now
        onChange: function(selectedDates, dateStr) {
          // Only change to Custom if the user manually selected a date
          if (!isProgrammaticChange && dateStr !== "") {
            document.getElementById('global-time-preset-select').value = "custom";
          }
        }
      });
      
      console.log('Date pickers initialized:', globalStartDatePicker, globalEndDatePicker);
      
      // Set default value to 24 hours (1440 minutes)
      document.getElementById('global-time-preset-select').value = "1440";
      
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
    
    // Set default value to 24 hours (1440 minutes)
    presetSelect.value = "1440";
    
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
      
      // Store the preset value in state
      app.state.globalDateRange.timePreset = this.value;
      app.state.globalDateRange.startDate = null;
      app.state.globalDateRange.endDate = null;
    });
  }
}; 