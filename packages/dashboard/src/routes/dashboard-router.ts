import { Router } from 'express';
import { StorageAdapter } from '../storage/storage-adapter';

/**
 * Creates and returns a router for the dashboard UI to consume
 * These routes are used by the frontend to retrieve data
 */
export function setupDashboardRoutes(storageAdapter: StorageAdapter): Router {
  const router = Router();

  // Get all pipelines
  router.get('/pipelines', async (req, res) => {
    try {
      const pipelines = await storageAdapter.listPipelines();
      res.json(pipelines);
    } catch (error) {
      console.error('Error listing pipelines:', error);
      res.status(500).json({ error: 'Failed to list pipelines' });
    }
  });

  // Get runs for a pipeline with filtering and pagination
  router.get('/pipelines/:pipelineName/runs', async (req, res) => {
    try {
      const { pipelineName } = req.params;
      const { startDate, endDate, status, page, pageSize } = req.query;

      const options: any = {};

      if (startDate) {
        options.startDate = new Date(startDate as string);
      }

      if (endDate) {
        options.endDate = new Date(endDate as string);
      }

      if (status) {
        options.status = status as string;
      }

      // Convert pagination parameters
      const currentPage = page ? parseInt(page as string, 10) : 1;
      const itemsPerPage = pageSize ? parseInt(pageSize as string, 10) : 10;

      // Get all runs that match the filters (without pagination)
      const allRuns = await storageAdapter.listRuns(pipelineName, options);

      // Apply pagination
      const totalItems = allRuns.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      const offset = (currentPage - 1) * itemsPerPage;
      const paginatedRuns = allRuns.slice(offset, offset + itemsPerPage);

      // Return paginated response
      res.json({
        items: paginatedRuns,
        pagination: {
          page: currentPage,
          pageSize: itemsPerPage,
          totalItems,
          totalPages,
        },
      });
    } catch (error) {
      console.error('Error listing runs:', error);
      res.status(500).json({
        items: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
        },
        error: 'Failed to list runs',
      });
    }
  });

  // Get run details
  router.get('/runs/:runId', async (req, res) => {
    try {
      const { runId } = req.params;
      const runData = await storageAdapter.getRunData(runId);
      res.json(runData);
    } catch (error) {
      console.error('Error getting run data:', error);
      res.status(500).json({ error: 'Failed to get run data' });
    }
  });

  // Get steps for a run
  router.get('/runs/:runId/steps', async (req, res) => {
    try {
      const { runId } = req.params;
      const steps = await storageAdapter.listRunSteps(runId);
      res.json(steps);
    } catch (error) {
      console.error('Error listing steps:', error);
      res.status(500).json({ error: 'Failed to list steps' });
    }
  });

  // Get steps for a pipeline
  router.get('/pipelines/:pipelineName/steps', async (req, res) => {
    try {
      const { pipelineName } = req.params;
      const steps = await storageAdapter.listPipelineSteps(pipelineName);
      res.json(steps);
    } catch (error) {
      console.error('Error listing steps:', error);
      res.status(500).json({ error: 'Failed to list steps' });
    }
  });

  // Get step time series
  router.get('/pipelines/:pipelineName/steps/:stepName/time-series', async (req, res) => {
    try {
      const { pipelineName, stepName } = req.params;
      const { startDate, endDate, page, pageSize } = req.query;

      const start = startDate ? new Date(startDate as string).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000; // Default to last 30 days
      const end = endDate ? new Date(endDate as string).getTime() : Date.now();

      const timeRange = { start, end };

      // Get all time series data
      const timeSeries = await storageAdapter.getPipelineStepTimeseries(pipelineName, stepName, timeRange);

      // Calculate statistics from the entire dataset
      const durations = timeSeries.filter((item: any) => item.value > 0).map((item: any) => item.value);

      // Calculate max, min, average duration
      const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
      const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
      const avgDuration =
        durations.length > 0 ? durations.reduce((sum: number, val: number) => sum + val, 0) / durations.length : 0;

      // Count total executions
      const totalExecutions = timeSeries.length;

      // Count errors and successes
      const errorCount = timeSeries.filter((item: any) => item.stepMeta?.error).length;
      const successCount = totalExecutions - errorCount;

      // Apply pagination
      const currentPage = page ? parseInt(page as string, 10) : 1;
      const itemsPerPage = pageSize ? parseInt(pageSize as string, 10) : 10;
      const totalItems = timeSeries.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      const offset = (currentPage - 1) * itemsPerPage;
      const paginatedTimeSeries = timeSeries.slice(offset, offset + itemsPerPage);

      // Return data with statistics and pagination
      res.json({
        timeSeries: paginatedTimeSeries.map((item: any) => ({ ...item, duration: item.value })),
        stats: {
          maxDuration,
          minDuration,
          avgDuration,
          totalExecutions,
          errorCount,
          successCount,
        },
        pagination: {
          page: currentPage,
          pageSize: itemsPerPage,
          totalItems,
          totalPages,
        },
      });
    } catch (error) {
      console.error('Error getting step time series:', error);
      res.status(500).json({
        error: 'Failed to get step time series',
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
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
        },
      });
    }
  });

  // Generate step timeseries chart
  router.get('/pipelines/:pipelineName/steps/:stepName/time-series/chart', async (req, res) => {
    try {
      const { pipelineName, stepName } = req.params;
      const { startDate, endDate } = req.query;

      const start = startDate ? new Date(startDate as string).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000;
      const end = endDate ? new Date(endDate as string).getTime() : Date.now();

      const timeRange = { start, end };

      // Get step timeseries data
      const timeseriesData = await storageAdapter.getPipelineStepTimeseries(pipelineName, stepName, timeRange);

      // Generate chart URL
      const chartUrl = generateTimeseriesChartUrl(timeseriesData);

      res.json({ url: chartUrl });
    } catch (error) {
      console.error('Error generating step timeseries chart:', error);
      res.status(500).json({ error: 'Failed to generate step timeseries chart' });
    }
  });

  return router;
}

/**
 * Generates a chart URL for the given timeseries data
 */
function generateTimeseriesChartUrl(timeseriesData: any[]): string {
  // For now, we'll use QuickChart.io to generate a chart
  const labels = timeseriesData.map((point) => new Date(point.timestamp).toLocaleDateString());
  const values = timeseriesData.map((point) => point.value);

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Step Duration (ms)',
          data: values,
          fill: false,
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  };

  // Encode the chart configuration for QuickChart
  const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
  return `https://quickchart.io/chart?c=${encodedConfig}`;
}
