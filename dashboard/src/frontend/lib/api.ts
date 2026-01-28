export interface DateRange {
  timePreset: string;
  startDate: string | null;
  endDate: string | null;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface Run {
  runId: string;
  pipeline: string;
  startTime: string;
  endTime: string | null;
  duration: number;
  status: string;
}

export interface Step {
  stepKey: string;
  stepName: string;
  startTime: string;
  endTime: string | null;
  duration: number;
  status: string;
  records?: any;
  result?: any;
  error?: string;
}

export interface StepStats {
  maxDuration: number;
  minDuration: number;
  avgDuration: number;
  totalExecutions: number;
  errorCount: number;
  successCount: number;
}

export interface StepTimeSeriesData {
  timeSeries: Array<{
    timestamp: string;
    runId: string;
    stepKey: string;
    duration: number;
    status: string;
    stepMeta?: {
      key: string;
      name: string;
      time: {
        startTs: number;
        endTs: number;
        timeUsageMs: number;
      };
      records?: any;
      result?: any;
      error?: string;
    };
    records?: any;
    result?: any;
    startTime?: string;
    endTime?: string;
  }>;
  stats: StepStats;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface Settings {
  retentionDays?: number;
  presetColumns?: Array<{
    name: string;
    path: string;
    pipeline?: string;
  }>;
}

class ApiClient {
  async fetchPipelines(): Promise<string[]> {
    try {
      const response = await fetch('/api/dashboard/pipelines');
      return await response.json();
    } catch (error) {
      console.error('Error fetching pipelines:', error);
      return [];
    }
  }

  async loadRuns(
    pipeline: string,
    dateRange: DateRange,
    pagination: Pagination = { page: 1, pageSize: 10 },
    runIdSearch: string = ''
  ): Promise<PaginatedResponse<Run>> {
    try {
      let url = `/api/dashboard/pipelines/${pipeline}/runs`;
      const params = new URLSearchParams();

      params.append('page', pagination.page.toString());
      params.append('pageSize', pagination.pageSize.toString());

      if (runIdSearch) {
        params.append('runId', runIdSearch);
      }

      if (dateRange.timePreset !== 'custom') {
        const minutes = parseInt(dateRange.timePreset, 10);
        const now = new Date();
        const start = new Date(now.getTime() - minutes * 60 * 1000);
        params.append('startDate', start.toISOString());
      } else {
        if (dateRange.startDate) {
          params.append('startDate', new Date(dateRange.startDate).toISOString());
        }
        if (dateRange.endDate) {
          params.append('endDate', new Date(dateRange.endDate).toISOString());
        }
      }

      url += `?${params.toString()}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.items && data.pagination) {
        return data;
      }

      return {
        items: data,
        pagination: {
          page: 1,
          pageSize: data.length,
          totalItems: data.length,
          totalPages: 1,
        },
      };
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
  }

  async loadRunDetails(runId: string): Promise<Step[] | null> {
    try {
      const response = await fetch(`/api/dashboard/runs/${runId}/steps`);
      const data = await response.json();
      
      // Transform API response to match Step interface
      if (Array.isArray(data)) {
        return data.map((item: any) => {
          // Handle timestamp conversion - API returns milliseconds timestamp
          const startTs = item.time?.startTs ?? item.startTime;
          const endTs = item.time?.endTs ?? item.endTime;
          
          return {
            stepKey: item.key || item.stepKey || '',
            stepName: item.name || item.stepName || '',
            startTime: startTs ? (typeof startTs === 'number' ? new Date(startTs).toISOString() : startTs) : '',
            endTime: endTs ? (typeof endTs === 'number' ? new Date(endTs).toISOString() : endTs) : null,
            duration: item.time?.timeUsageMs ?? item.duration ?? 0,
            status: item.error ? 'error' : (item.status || 'completed'),
            records: item.records,
            result: item.result,
            error: item.error,
          };
        });
      }
      
      return data;
    } catch (error) {
      console.error('Error loading run details:', error);
      return null;
    }
  }

  async loadRunData(runId: string): Promise<{ pipeline: string } | null> {
    try {
      const response = await fetch(`/api/dashboard/runs/${runId}`);
      const data = await response.json();
      return data?.meta ? { pipeline: data.meta.pipeline } : null;
    } catch (error) {
      console.error('Error loading run data:', error);
      return null;
    }
  }

  async loadStepDetails(runId: string, stepKey: string): Promise<any> {
    try {
      const response = await fetch(`/api/dashboard/runs/${runId}/step/${stepKey}`);
      return await response.json();
    } catch (error) {
      console.error('Error loading step details:', error);
      return null;
    }
  }

  async loadStepNames(pipeline: string): Promise<string[]> {
    try {
      const response = await fetch(`/api/dashboard/pipelines/${pipeline}/steps`);
      return await response.json();
    } catch (error) {
      console.error('Error loading step names:', error);
      return [];
    }
  }

  async loadStepTimeSeries(
    pipeline: string,
    stepName: string,
    dateRange: DateRange,
    pagination: Pagination = { page: 1, pageSize: 10 }
  ): Promise<StepTimeSeriesData> {
    try {
      let url = `/api/dashboard/pipelines/${pipeline}/steps/${stepName}/time-series`;
      const params = new URLSearchParams();

      params.append('page', pagination.page.toString());
      params.append('pageSize', pagination.pageSize.toString());

      if (dateRange.timePreset !== 'custom') {
        const minutes = parseInt(dateRange.timePreset, 10);
        const now = new Date();
        const start = new Date(now.getTime() - minutes * 60 * 1000);
        params.append('startDate', start.toISOString());
      } else {
        if (dateRange.startDate) {
          params.append('startDate', new Date(dateRange.startDate).toISOString());
        }
        if (dateRange.endDate) {
          params.append('endDate', new Date(dateRange.endDate).toISOString());
        }
      }

      url += `?${params.toString()}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.pagination) {
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
  }

  async getSettings(pipeline: string): Promise<Settings> {
    try {
      const response = await fetch(`/api/dashboard/pipelines/${pipeline}/settings`);
      return await response.json();
    } catch (error) {
      console.error('Error getting settings:', error);
      return {};
    }
  }

  async saveSettings(pipeline: string, settings: Settings): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`/api/dashboard/pipelines/${pipeline}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      return await response.json();
    } catch (error) {
      console.error('Error saving settings:', error);
      return { success: false, error: 'Failed to save settings' };
    }
  }

  async uploadFiles(files: File[]): Promise<any> {
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
        console.log('file', file);
      });

      const response = await fetch('/api/dashboard/import', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      
      // The API already returns the correct format, just pass it through
      if (data.success && data.results) {
        return {
          success: true,
          results: data.results.map((result: any) => ({
            fileName: result.fileName || result.filename || 'Unknown',
            status: result.status || (result.success ? 'success' : 'error'),
            message: result.message,
            data: result.data,
          })),
        };
      }
      
      return data;
    } catch (error) {
      console.error('Error uploading files:', error);
      return { success: false, error: 'Failed to upload files' };
    }
  }
}

export const api = new ApiClient();
