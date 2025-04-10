import { StepMeta } from '../step';
import { PipelineMeta } from '../pipeline';
import axios from 'axios';
import { Transport } from './base-transport';

// Types for batched events
type LogEvent = {
  type: 'initiate-run' | 'finish-run' | 'initiate-step' | 'finish-step';
  runId?: string;
  pipelineMeta?: PipelineMeta;
  step?: StepMeta;
  status?: 'completed' | 'failed' | 'running';
};

export interface HttpTransportOptions {
  baseUrl: string;
  batchLogs?: boolean;
  flushInterval?: number;
  maxBatchSize?: number;
  debug?: boolean;
  maxRetries?: number;
}

export class HttpTransport implements Transport {
  private baseUrl: string;
  private headers: Record<string, string>;
  private batchLogs: boolean;
  private flushInterval: number;
  private maxBatchSize: number;
  private debug: boolean;
  private maxRetries: number;

  // Cache for events waiting to be sent
  private eventCache: LogEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private activeFlushes = 0;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;

    this.headers = {
      'Content-Type': 'application/json',
    };

    // Batching configuration
    this.batchLogs = options.batchLogs ?? false;
    this.flushInterval = options.flushInterval ?? 3000; // Default 3 seconds
    this.maxBatchSize = options.maxBatchSize ?? 100; // Default 100 items max
    this.debug = options.debug ?? false;
    this.maxRetries = options.maxRetries ?? 3; // Default 3 retries

    // Start the flush timer if batching is enabled
    if (this.batchLogs) {
      this.startFlushTimer();
    }
  }

  private startFlushTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.flushEvents();
    }, this.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Helper function to delay execution
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendEventsWithRetry(events: LogEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    this.activeFlushes++;
    let retryCount = 0;

    try {
      while (retryCount <= this.maxRetries) {
        try {
          // Send the batch to the server
          await axios.post(`${this.baseUrl}ingestion/batch`, { events }, { headers: this.headers });

          if (this.debug) {
            console.log(`[HttpTransport] Successfully sent ${events.length} events`);
          }

          // Success, so we can exit the retry loop
          return;
        } catch (error: any) {
          console.error('Error sending batched events:', error);

          if (this.debug) {
            console.error(`[HttpTransport] Failed to send ${events.length} events: ${error.message}`);
          }

          // If this is the last retry, or if we have a special error that should not retry, break
          if (retryCount >= this.maxRetries || error.message === 'Network error during flush') {
            if (retryCount >= this.maxRetries && this.debug) {
              console.error(
                `[HttpTransport] Max retries (${this.maxRetries}) exceeded for batch of ${events.length} events. Dropping events.`,
              );
            }
            break;
          }

          // Calculate backoff time with exponential backoff. 1 sec initially.
          const backoffTime = 1000 * Math.pow(2, retryCount);

          if (this.debug) {
            console.log(
              `[HttpTransport] Scheduling retry in ${backoffTime}ms (attempt ${retryCount + 1}/${this.maxRetries})`,
            );
          }

          // Wait before retrying
          await this.delay(backoffTime);

          // Increment retry counter
          retryCount++;

          if (this.debug) {
            console.log(
              `[HttpTransport] Retrying batch of ${events.length} events (attempt ${retryCount}/${this.maxRetries})`,
            );
          }
        }
      }
    } finally {
      this.activeFlushes--;
    }
  }

  private async flushEvents(): Promise<void> {
    // If no events to send, don't do anything
    if (this.eventCache.length === 0) {
      return;
    }

    // Take all current events
    const events = [...this.eventCache];
    this.eventCache = [];

    if (this.debug) {
      console.log(`[HttpTransport] Flushing ${events.length} events to ${this.baseUrl}ingestion/batch`);
    }

    // Send events with retry without waiting
    this.sendEventsWithRetry(events).catch((err) => {
      console.error('[HttpTransport] Unexpected error in flush process:', err);
    });
  }

  // Check if we should flush based on cache size
  private flushIfCacheFull(): void {
    if (this.batchLogs && this.eventCache.length >= this.maxBatchSize) {
      this.flushEvents();
    }
  }

  public async initiateRun(pipelineMeta: PipelineMeta): Promise<void> {
    if (this.batchLogs) {
      this.eventCache.push({
        type: 'initiate-run',
        pipelineMeta,
      });
      this.flushIfCacheFull();
      return;
    }

    // Non-batched mode uses the original implementation
    try {
      await axios.post(`${this.baseUrl}ingestion/pipeline/start`, pipelineMeta, { headers: this.headers });
    } catch (error: any) {
      console.error('Error initiating run:', error);
      throw new Error(`Failed to initiate run: ${error.message}`);
    }
  }

  public async finishRun(pipelineMeta: PipelineMeta, status: 'completed' | 'failed' | 'running'): Promise<void> {
    if (this.batchLogs) {
      this.eventCache.push({
        type: 'finish-run',
        pipelineMeta,
        status,
      });
      this.flushIfCacheFull();
      return;
    }

    // Non-batched mode uses the original implementation
    try {
      await axios.post(`${this.baseUrl}ingestion/pipeline/finish`, { pipelineMeta, status }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error finishing run:', error);
      throw new Error(`Failed to finish run: ${error.message}`);
    }
  }

  public async initiateStep(runId: string, step: StepMeta): Promise<void> {
    if (this.batchLogs) {
      this.eventCache.push({
        type: 'initiate-step',
        runId,
        step,
      });
      this.flushIfCacheFull();
      return;
    }

    // Non-batched mode uses the original implementation
    try {
      await axios.post(`${this.baseUrl}ingestion/step/start`, { runId, step }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error initiating step:', error);
      throw new Error(`Failed to initiate step: ${error.message}`);
    }
  }

  public async finishStep(runId: string, step: StepMeta): Promise<void> {
    if (this.batchLogs) {
      this.eventCache.push({
        type: 'finish-step',
        runId,
        step,
      });
      this.flushIfCacheFull();
      return;
    }

    // Non-batched mode uses the original implementation
    try {
      await axios.post(`${this.baseUrl}ingestion/step/finish`, { runId, step }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error finishing step:', error);
      throw new Error(`Failed to finish step: ${error.message}`);
    }
  }

  // Make sure to call this when the application is shutting down
  public async flushAndStop(): Promise<void> {
    if (this.debug) {
      console.log('[HttpTransport] Flushing events and stopping timer before shutdown');
    }
    this.stopFlushTimer();

    // Flush current events
    await this.flushEvents();

    // Wait for any active flushes to complete
    if (this.activeFlushes > 0) {
      if (this.debug) {
        console.log(`[HttpTransport] Waiting for ${this.activeFlushes} active flushes to complete`);
      }

      // Simple polling to wait for active flushes to complete
      while (this.activeFlushes > 0) {
        await this.delay(100);
      }
    }
  }
}
