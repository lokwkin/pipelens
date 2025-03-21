/**
 * Main application code for StepsTrack Portal
 */

// Global app object
const app = {
  // State management
  state: {
    currentView: 'runs-view',
    selectedPipeline: null,
    selectedRun: null,
    selectedStep: null,
    selectedStepName: null,
    autoRefresh: false,
    refreshInterval: null,
    refreshFrequency: 3000,
    expandedRows: new Set(), // Track expanded rows
    globalDateRange: {
      startDate: null,
      endDate: null,
      timePreset: "1440" // Default to last 24 hours
    }
  },

  /**
   * Initialize the dashboard
   */
  initDashboard() {
    // Check URL parameters on load
    const params = new URLSearchParams(window.location.search);
    const pipeline = params.get('pipeline');
    const view = params.get('view');
    const runId = params.get('runId');
    const stepKey = params.get('stepKey');
    const stepName = params.get('stepName');
    
    // Initialize UI elements
    this.initUIElements();
    
    // Fetch pipelines
    api.fetchPipelines().then((pipelines) => {
      // Populate global pipeline dropdown
      const globalPipelineSelect = document.getElementById('global-pipeline-select');
      globalPipelineSelect.innerHTML = '<option value="">Select a pipeline</option>';
      
      pipelines.forEach(pipeline => {
        globalPipelineSelect.innerHTML += `<option value="${pipeline}">${pipeline}</option>`;
      });
      
      // Set the pipeline from URL if available
      if (pipeline) {
        globalPipelineSelect.value = pipeline;
        this.state.selectedPipeline = pipeline;
        
        // Load data based on the selected pipeline
        if (this.state.currentView === 'runs-view') {
          ui.loadRuns(pipeline);
        } else if (this.state.currentView === 'step-stats-view') {
          ui.loadStepNames(pipeline).then(() => {
            // If stepName is in URL, select it and load its data
            if (stepName) {
              document.getElementById('step-name-select').value = stepName;
              this.state.selectedStepName = stepName;
              ui.loadStepTimeSeries(pipeline, stepName);
            }
          });
        }
      }
    });
    
    // Handle view navigation from URL
    if (view) {
      if (view === 'run-detail' && runId) {
        this.state.selectedRun = runId;
        ui.showView('run-detail-view');
        ui.loadRunDetails(runId, false);
      } else if (view === 'step-analysis' && runId && stepKey) {
        this.state.selectedRun = runId;
        // We need to find the step data
        fetch(`/api/runs/${runId}/step/${stepKey}`)
          .then(response => response.json())
          .then(step => {
            this.state.selectedStep = step;
            ui.showView('step-analysis-view');
            document.getElementById('step-analysis-details').innerHTML = `
              <p><strong>Step Key:</strong> ${step.key}</p>
              <p><strong>Start Time:</strong> ${utils.formatDateTime(step.time.startTs)}</p>
              <p><strong>End Time:</strong> ${utils.formatDateTime(step.time.endTs)}</p>
              <p><strong>Duration:</strong> ${utils.formatDuration(step.time.timeUsageMs)}</p>
            `;
          });
      } else {
        ui.showView(view);
      }
    }
    
    // Initialize time range presets
    ui.initTimePresets();
    
    // Initialize date pickers
    ui.initDatePickers();
  },

  /**
   * Initialize UI elements and event listeners
   */
  initUIElements() {
    // Navigation links
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = link.getAttribute('data-view');
        
        ui.showView(viewId);
        
        // Update URL
        const url = new URL(window.location);
        url.searchParams.set('view', viewId);
        
        // Clear other parameters if going to main views
        if (viewId === 'runs-view') {
          url.searchParams.delete('runId');
          url.searchParams.delete('stepKey');
          url.searchParams.delete('stepName');
        } else if (viewId === 'step-stats-view') {
          url.searchParams.delete('runId');
          url.searchParams.delete('stepKey');
          // Keep stepName if it exists in state
          if (this.state.selectedStepName) {
            url.searchParams.set('stepName', this.state.selectedStepName);
          }
        }
        
        window.history.pushState({view: viewId}, '', url);
      });
    });

    // Back buttons
    document.getElementById('back-to-runs').addEventListener('click', (e) => {
      e.preventDefault();
      ui.showView('runs-view');
      
      // Update URL
      const url = new URL(window.location);
      url.searchParams.set('view', 'runs-view');
      url.searchParams.delete('runId');
      url.searchParams.delete('stepKey');
      window.history.pushState({view: 'runs-view'}, '', url);
      
      // Reset expanded rows state when exiting run detail view
      this.state.expandedRows = new Set();
      this.state.selectedRun = null;
    });

    document.getElementById('back-to-run-detail').addEventListener('click', (e) => {
      e.preventDefault();
      ui.showView('run-detail-view');
      
      // Update URL
      const url = new URL(window.location);
      url.searchParams.set('view', 'run-detail');
      url.searchParams.set('runId', this.state.selectedRun);
      url.searchParams.delete('stepKey');
      window.history.pushState({view: 'run-detail', runId: this.state.selectedRun}, '', url);
      
      this.state.selectedStep = null;
    });

    // Global pipeline selector
    document.getElementById('global-pipeline-select').addEventListener('change', function() {
      const pipeline = this.value;
      if (pipeline) {
        app.state.selectedPipeline = pipeline;
        
        // Update URL with selected pipeline
        const url = new URL(window.location);
        url.searchParams.set('pipeline', pipeline);
        window.history.replaceState({view: app.state.currentView, pipeline}, '', url);
        
        // Load data based on current view
        if (app.state.currentView === 'runs-view') {
          ui.loadRuns(pipeline);
        } else if (app.state.currentView === 'step-stats-view') {
          ui.loadStepNames(pipeline);
          // Clear step name selection
          document.getElementById('step-name-select').innerHTML = '<option value="">Select a step</option>';
          app.state.selectedStepName = null;
        }
        
        // Start auto-refresh if enabled
        if (app.state.autoRefresh && app.state.currentView === 'runs-view') {
          app.startAutoRefresh();
        }
      }
    });

    // Step name selector
    document.getElementById('step-name-select').addEventListener('change', function() {
      const stepName = this.value;
      if (stepName && app.state.selectedPipeline) {
        app.state.selectedStepName = stepName;
        
        // Update URL with selected step name
        const url = new URL(window.location);
        url.searchParams.set('stepName', stepName);
        window.history.replaceState({
          view: app.state.currentView, 
          pipeline: app.state.selectedPipeline,
          stepName: stepName
        }, '', url);
        
        // Load step instances when a step is selected
        ui.loadStepTimeSeries(app.state.selectedPipeline, stepName);
      } else {          
        // If no step is selected, remove the stepName parameter from URL
        const url = new URL(window.location);
        url.searchParams.delete('stepName');
        window.history.replaceState({
          view: app.state.currentView,
          pipeline: app.state.selectedPipeline
        }, '', url);
      }
    });

    // Global date filter apply button
    document.getElementById('global-apply-filter').addEventListener('click', function() {
      // Get values from the global date range selector
      const timePreset = document.getElementById('global-time-preset-select').value;
      const startDate = document.getElementById('global-start-date').value;
      const endDate = document.getElementById('global-end-date').value;
      
      // Update global date range state
      app.state.globalDateRange.timePreset = timePreset;
      app.state.globalDateRange.startDate = startDate;
      app.state.globalDateRange.endDate = endDate;
      
      // Apply the filter based on current view
      if (app.state.currentView === 'runs-view' && app.state.selectedPipeline) {
        ui.loadRuns(app.state.selectedPipeline);
      } else if (app.state.currentView === 'step-stats-view' && app.state.selectedPipeline && app.state.selectedStepName) {
        ui.loadStepTimeSeries(app.state.selectedPipeline, app.state.selectedStepName);
      }
    });

    // Auto-refresh controls
    const globalAutoRefreshCheckbox = document.getElementById('global-auto-refresh');
    const globalRefreshIntervalSelect = document.getElementById('global-refresh-interval');
    const refreshIndicator = document.querySelector('.refresh-indicator');

    globalAutoRefreshCheckbox.addEventListener('change', function() {
      app.state.autoRefresh = this.checked;
      refreshIndicator.classList.toggle('active', this.checked);
      
      // Enable/disable the refresh interval dropdown based on checkbox state
      globalRefreshIntervalSelect.disabled = !this.checked;
      
      if (this.checked) {
        app.startAutoRefresh();
      } else {
        app.stopAutoRefresh();
      }
    });

    globalRefreshIntervalSelect.addEventListener('change', function() {
      app.state.refreshFrequency = parseInt(this.value);
      if (app.state.autoRefresh) {
        app.startAutoRefresh();
      }
    });

    // Set initial state of refresh interval dropdown based on auto-refresh checkbox
    globalRefreshIntervalSelect.disabled = !globalAutoRefreshCheckbox.checked;
    
    // Set initial state of refresh indicator based on auto-refresh state
    refreshIndicator.classList.toggle('active', this.state.autoRefresh);

    // Handle browser back/forward buttons
    window.addEventListener('popstate', (event) => {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      const runId = params.get('runId');
      const stepKey = params.get('stepKey');
      
      if (view === 'run-detail' && runId) {
        this.state.selectedRun = runId;
        ui.showView('run-detail-view');
        // Update page title
        document.getElementById('page-title').textContent = `Run Details: ${runId}`;
        ui.loadRunDetails(runId, false);
      } else if (view === 'step-analysis' && runId && stepKey) {
        this.state.selectedRun = runId;
        // We need to find the step data
        fetch(`/api/runs/${runId}/step/${stepKey}`)
          .then(response => response.json())
          .then(step => {
            this.state.selectedStep = step;
            ui.showView('step-analysis-view');
            // Update page title
            document.getElementById('page-title').textContent = `Step Analysis: ${step.name}`;
            document.getElementById('step-analysis-details').innerHTML = `
              <p><strong>Step Key:</strong> ${step.key}</p>
              <p><strong>Start Time:</strong> ${utils.formatDateTime(step.time.startTs)}</p>
              <p><strong>End Time:</strong> ${utils.formatDateTime(step.time.endTs)}</p>
              <p><strong>Duration:</strong> ${utils.formatDuration(step.time.timeUsageMs)}</p>
            `;
          });
      } else {
        ui.showView(view);
      }
    });
  },

  /**
   * Start auto-refresh for data updates
   */
  startAutoRefresh() {
    this.stopAutoRefresh(); // Clear any existing interval
    
    this.state.refreshInterval = setInterval(() => {
      if (this.state.selectedRun && this.state.currentView === 'run-detail-view') {
        // Save expanded state before auto-refresh
        const expandedRows = new Set();
        document.querySelectorAll('.details-row').forEach(row => {
          if (row.style.display !== 'none') {
            expandedRows.add(row.id);
          }
        });
        this.state.expandedRows = expandedRows;
        
        // Pass true to indicate this is an auto-refresh
        ui.loadRunDetails(this.state.selectedRun, true);
      } else if (this.state.selectedPipeline && this.state.currentView === 'runs-view') {
        ui.loadRuns(this.state.selectedPipeline);
      } else if (this.state.selectedPipeline && this.state.selectedStepName && this.state.currentView === 'step-stats-view') {
        ui.loadStepTimeSeries(this.state.selectedPipeline, this.state.selectedStepName);
      }
    }, this.state.refreshFrequency);
  },

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.state.refreshInterval) {
      clearInterval(this.state.refreshInterval);
      this.state.refreshInterval = null;
    }
  }
};

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  app.initDashboard();
}); 