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
      const response = await fetch('/api/dashboard/pipelines');
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
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Object containing runs array and pagination metadata
   */
  async loadRuns(pipeline, dateRange, pagination = { page: 1, pageSize: 10 }) {
    try {
      // Build query parameters
      let url = `/api/dashboard/pipelines/${pipeline}/runs`;
      const params = new URLSearchParams();

      // Add pagination parameters
      params.append('page', pagination.page);
      params.append('pageSize', pagination.pageSize);

      if (dateRange.timePreset !== 'custom') {
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

      url += `?${params.toString()}`;

      const response = await fetch(url);
      const data = await response.json();

      // Check if response is the new paginated format
      if (data.items && data.pagination) {
        return data; // Return the paginated response directly
      } else {
        // For backwards compatibility, wrap the response in a paginated format
        return {
          items: data,
          pagination: {
            page: 1,
            pageSize: data.length,
            totalItems: data.length,
            totalPages: 1,
          },
        };
      }
    } catch (error) {
      console.error('Error loading runs:', error);
      return {
        items: [],
        pagination: {
          page: 1,
          pageSize: pagination.pageSize,
          totalItems: 0,
          totalPages: 0,
        },
      };
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
      const stepsResponse = await fetch(`/api/dashboard/runs/${runId}/steps`);
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
      const response = await fetch(`/api/dashboard/runs/${runId}/step/${stepKey}`);
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
      const response = await fetch(`/api/dashboard/pipelines/${pipeline}/steps`);
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
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Time series data
   */
  async loadStepTimeSeries(pipeline, stepName, dateRange, pagination = { page: 1, pageSize: 10 }) {
    try {
      // Build query parameters
      let url = `/api/dashboard/pipelines/${pipeline}/steps/${stepName}/time-series`;
      const params = new URLSearchParams();

      // Add pagination parameters
      params.append('page', pagination.page);
      params.append('pageSize', pagination.pageSize);

      if (dateRange.timePreset !== 'custom') {
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

      url += `?${params.toString()}`;

      const response = await fetch(url);
      const data = await response.json();

      // Check if the response includes pagination info
      if (!data.pagination) {
        // For backward compatibility, add pagination metadata
        return {
          ...data,
          pagination: {
            page: 1,
            pageSize: data.timeSeries ? data.timeSeries.length : 0,
            totalItems: data.timeSeries ? data.timeSeries.length : 0,
            totalPages: 1,
          },
        };
      }

      return data;
    } catch (error) {
      console.error('Error loading step stats:', error);
      return {
        timeSeries: [],
        stats: {
          maxDuration: 0,
          minDuration: 0,
          avgDuration: 0,
          totalExecutions: 0,
          errorCount: 0,
          successCount: 0,
        },
        pagination: {
          page: 1,
          pageSize: pagination.pageSize,
          totalItems: 0,
          totalPages: 0,
        },
      };
    }
  },

  /**
   * Loads pipeline-specific dashboard settings
   * @param {string} pipeline - Pipeline name
   * @returns {Promise<Object>} Pipeline-specific dashboard settings
   */
  async getPipelineSettings(pipeline) {
    try {
      const response = await fetch(`/api/dashboard/settings/pipeline/${pipeline}`);
      return await response.json();
    } catch (error) {
      console.error(`Error loading settings for pipeline ${pipeline}:`, error);
      return {};
    }
  },

  /**
   * Saves pipeline-specific dashboard settings
   * @param {string} pipeline - Pipeline name
   * @param {Object} settings - Settings to save
   * @returns {Promise<Object>} Response with success status
   */
  async savePipelineSettings(pipeline, settings) {
    try {
      const response = await fetch(`/api/dashboard/settings/pipeline/${pipeline}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      return await response.json();
    } catch (error) {
      console.error(`Error saving settings for pipeline ${pipeline}:`, error);
      return { success: false, error: `Failed to save settings for pipeline ${pipeline}` };
    }
  },

  /**
   * Updates preset data columns for a pipeline
   * @param {string} pipeline - Pipeline name
   * @param {Array} presetColumns - Array of preset column definitions
   * @example
   * // Example preset columns structure:
   * [
   *   {
   *     id: "uniqueId1",
   *     name: "User ID", 
   *     path: "records.0.userId",
   *     stepKey: "fetch-user-data",
   *     dataType: "string"
   *   },
   *   {
   *     id: "uniqueId2",
   *     name: "Success Rate", 
   *     path: "result.stats.successRate",
   *     stepKey: "calculate-metrics",
   *     dataType: "number",
   *     formatter: "percent" // Optional formatter
   *   }
   * ]
   * @returns {Promise<Object>} Response with success status
   */
  async updatePresetDataColumns(pipeline, presetColumns) {
    try {
      // First get existing settings
      const currentSettings = await this.getPipelineSettings(pipeline);
      
      // Update with new preset columns
      const updatedSettings = {
        ...currentSettings,
        presetDataColumns: presetColumns
      };
      
      // Save updated settings
      return await this.savePipelineSettings(pipeline, updatedSettings);
    } catch (error) {
      console.error(`Error updating preset data columns for pipeline ${pipeline}:`, error);
      return { success: false, error: `Failed to update preset data columns for pipeline ${pipeline}` };
    }
  },
  
  /**
   * Gets preset data columns for a pipeline
   * @param {string} pipeline - Pipeline name
   * @returns {Promise<Array>} Array of preset data column definitions
   */
  async getPresetDataColumns(pipeline) {
    try {
      const settings = await this.getPipelineSettings(pipeline);
      return settings.presetDataColumns || [];
    } catch (error) {
      console.error(`Error getting preset data columns for pipeline ${pipeline}:`, error);
      return [];
    }
  },
  
  /**
   * Resolves data from a step using dot notation path
   * @param {Object} stepData - Step data containing records or result
   * @param {string} path - Dot notation path (e.g. "records.0.name" or "result.value")
   * @returns {*} The value at the specified path or undefined if not found
   */
  resolveDataByPath(stepData, path) {
    try {
      if (!stepData || !path) return undefined;
      
      const parts = path.split('.');
      let current = stepData;
      
      for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
      }
      
      return current;
    } catch (error) {
      console.error('Error resolving data path:', error);
      return undefined;
    }
  },
  
  /**
   * Extracts data from a run using preset data columns
   * @param {Object} run - Run data containing steps
   * @param {Array} presetColumns - Array of preset column definitions
   * @returns {Object} Object with column values mapped by column id
   */
  extractPresetColumnData(run, presetColumns) {
    if (!run || !run.steps || !presetColumns || !Array.isArray(presetColumns)) {
      return {};
    }
    
    const result = {};
    
    presetColumns.forEach(column => {
      const { id, stepKey, path, dataType, formatter } = column;
      if (!id || !stepKey || !path) return;
      
      // Find the step data
      const stepData = run.steps.find(step => step.key === stepKey);
      if (!stepData) return;
      
      // Extract value using dot notation
      let value = this.resolveDataByPath(stepData, path);
      
      // Apply basic type conversion if needed
      if (value !== undefined && value !== null) {
        if (dataType === 'number' && typeof value !== 'number') {
          value = parseFloat(value);
        } else if (dataType === 'boolean' && typeof value !== 'boolean') {
          value = Boolean(value);
        } else if (dataType === 'string' && typeof value !== 'string') {
          value = String(value);
        }
        
        // Apply formatter if specified
        if (formatter === 'percent' && typeof value === 'number') {
          value = `${(value * 100).toFixed(2)}%`;
        }
      }
      
      result[id] = value;
    });
    
    return result;
  }
};

// Export the API for use in other modules
export default api;
