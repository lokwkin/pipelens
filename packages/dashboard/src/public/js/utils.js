/**
 * Utility functions for StepsTrack Portal
 */

const utils = {
  /**
   * Format date to YYYY-MM-DD HH:mm:ss format for display
   * @param {number|string} timestamp - Timestamp to format
   * @returns {string} Formatted date string
   */
  formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },

  /**
   * Format duration in milliseconds to a human-readable string
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration string
   */
  formatDuration(ms) {
    if (!ms) return 'N/A';
    
    const totalMs = ms % 1000;
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    
    // If duration is less than 10 seconds, display only milliseconds
    if (hours === 0 && minutes === 0 && seconds < 10) {
      return `${ms}ms`;
    }
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s ${totalMs}ms`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s ${totalMs}ms`;
    } else {
      return `${seconds}s ${totalMs}ms`;
    }
  },

  /**
   * Process time series data for chart visualization
   * @param {Array} instances - Array of step instances
   * @param {Object} timeRange - Time range object with startDate and endDate
   * @returns {Object} Processed data for chart
   */
  processTimeSeriesDataForChart(instances, timeRange) {
    // If no instances, return empty data
    if (!instances || instances.length === 0) {
      return {
        timePoints: [],
        maxDurations: [],
        minDurations: [],
        avgDurations: [],
        successCounts: [],
        errorCounts: []
      };
    }
    
    // Sort instances by timestamp
    instances.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Determine start and end times from the data or from timeRange
    let startTime, endTime;
    
    if (timeRange && timeRange.startDate) {
      startTime = new Date(timeRange.startDate).getTime();
    } else {
      startTime = new Date(instances[0].timestamp).getTime();
    }
    
    if (timeRange && timeRange.endDate) {
      endTime = new Date(timeRange.endDate).getTime();
    } else {
      endTime = new Date(instances[instances.length - 1].timestamp).getTime();
    }
    
    // Calculate time interval (divide the range into 30 periods)
    const totalTimeRange = endTime - startTime;
    const intervalMs = Math.max(totalTimeRange / 30, 1000); // At least 1 second
    
    // Create buckets for each time interval
    const buckets = [];
    let currentTime = startTime;
    
    while (currentTime <= endTime) {
      buckets.push({
        startTime: currentTime,
        endTime: currentTime + intervalMs,
        instances: [],
        maxDuration: 0,
        minDuration: Infinity,
        avgDuration: 0,
        successCount: 0,
        errorCount: 0
      });
      currentTime += intervalMs;
    }
    
    // Assign instances to buckets
    instances.forEach(instance => {
      const instanceTime = new Date(instance.timestamp).getTime();
      const bucketIndex = Math.min(
        Math.floor((instanceTime - startTime) / intervalMs),
        buckets.length - 1
      );
      
      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].instances.push(instance);
      }
    });
    
    // Calculate statistics for each bucket
    buckets.forEach(bucket => {
      if (bucket.instances.length > 0) {
        // Calculate duration statistics
        let totalDuration = 0;
        
        bucket.instances.forEach(instance => {
          const duration = instance.duration || 0;
          
          // Update max and min durations
          bucket.maxDuration = Math.max(bucket.maxDuration, duration);
          bucket.minDuration = Math.min(bucket.minDuration, duration);
          
          // Add to total for average calculation
          totalDuration += duration;
          
          // Count successes and errors
          if (instance.error) {
            bucket.errorCount++;
          } else {
            bucket.successCount++;
          }
        });
        
        // Calculate average duration
        bucket.avgDuration = totalDuration / bucket.instances.length;
      }
      
      // If no instances in this bucket, set min to 0 instead of Infinity
      if (bucket.minDuration === Infinity) {
        bucket.minDuration = 0;
      }
    });
    
    // Extract data for chart
    const timePoints = buckets.map(bucket => new Date(bucket.startTime));
    const maxDurations = buckets.map(bucket => bucket.maxDuration);
    const minDurations = buckets.map(bucket => bucket.minDuration);
    const avgDurations = buckets.map(bucket => bucket.avgDuration);
    const successCounts = buckets.map(bucket => bucket.successCount);
    const errorCounts = buckets.map(bucket => bucket.errorCount);
    
    return {
      timePoints,
      maxDurations,
      minDurations,
      avgDurations,
      successCounts,
      errorCounts
    };
  }
}; 