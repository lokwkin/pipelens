/**
 * API functions for StepsTrack Portal
 * Handles all communication with the backend API
 */

const api = {
  /**
   * Fetches all available pipelines
   * @returns {Promise<Array>} Array of pipeline names
   */
  async fetchPipelines() {
    try {
      const response = await fetch('/api/pipelines');
      return await response.json();
    } catch (error) {
      console.error('Error fetching pipelines:', error);
      return [];
    }
  },

  /**
   * Loads runs for a specific pipeline
   * @param {string} pipeline - Pipeline name
   * @param {Object} dateRange - Date range for filtering
   * @returns {Promise<Array>} Array of run objects
   */
  async loadRuns(pipeline, dateRange) {
    try {
      // Build query parameters
      let url = `/api/pipelines/${pipeline}/runs`;
      const params = new URLSearchParams();
      
      if (dateRange.timePreset !== "custom") {
        // For preset selections, calculate the start date
        const minutes = parseInt(dateRange.timePreset, 10);
        const now = new Date();
        const start = new Date(now.getTime() - minutes * 60 * 1000);
        params.append('startDate', start.toISOString());
      } else if (dateRange.startDate || dateRange.endDate) {
        // For custom range, use the stored values
        if (dateRange.startDate) {
          const startDate = new Date(dateRange.startDate).toISOString();
          params.append('startDate', startDate);
        }
        
        if (dateRange.endDate) {
          const endDate = new Date(dateRange.endDate).toISOString();
          params.append('endDate', endDate);
        }
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url);
      return await response.json();
    } catch (error) {
      console.error('Error loading runs:', error);
      return [];
    }
  },

  /**
   * Loads detailed information for a specific run
   * @param {string} runId - Run ID
   * @returns {Promise<Object>} Run detail object
   */
  async loadRunDetails(runId) {
    try {
      // Fetch steps data using the dedicated endpoint
      const stepsResponse = await fetch(`/api/runs/${runId}/steps`);
      return await stepsResponse.json();
    } catch (error) {
      console.error('Error loading run details:', error);
      return null;
    }
  },

  /**
   * Loads information about a specific step in a run
   * @param {string} runId - Run ID
   * @param {string} stepKey - Step key
   * @returns {Promise<Object>} Step detail object
   */
  async loadStepDetails(runId, stepKey) {
    try {
      const response = await fetch(`/api/runs/${runId}/step/${stepKey}`);
      return await response.json();
    } catch (error) {
      console.error('Error loading step details:', error);
      return null;
    }
  },

  /**
   * Loads all available step names for a pipeline
   * @param {string} pipeline - Pipeline name
   * @returns {Promise<Array>} Array of step names
   */
  async loadStepNames(pipeline) {
    try {
      const response = await fetch(`/api/pipelines/${pipeline}/steps`);
      return await response.json();
    } catch (error) {
      console.error('Error loading step names:', error);
      return [];
    }
  },

  /**
   * Loads time series data for a specific step in a pipeline
   * @param {string} pipeline - Pipeline name
   * @param {string} stepName - Step name
   * @param {Object} dateRange - Date range for filtering
   * @returns {Promise<Object>} Time series data
   */
  async loadStepTimeSeries(pipeline, stepName, dateRange) {
    try {
      // Build query parameters
      let url = `/api/pipelines/${pipeline}/steps/${stepName}/time-series`;
      const params = new URLSearchParams();
      
      if (dateRange.timePreset !== "custom") {
        // For preset selections, calculate the start date
        const minutes = parseInt(dateRange.timePreset, 10);
        const now = new Date();
        const start = new Date(now.getTime() - minutes * 60 * 1000);
        params.append('startDate', start.toISOString());
      } else if (dateRange.startDate || dateRange.endDate) {
        // For custom range, use the stored values
        if (dateRange.startDate) {
          const startDate = new Date(dateRange.startDate).toISOString();
          params.append('startDate', startDate);
        }
        
        if (dateRange.endDate) {
          const endDate = new Date(dateRange.endDate).toISOString();
          params.append('endDate', endDate);
        }
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url);
      return await response.json();
    } catch (error) {
      console.error('Error loading step stats:', error);
      return null;
    }
  }
}; 