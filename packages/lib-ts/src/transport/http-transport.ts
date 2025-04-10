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
}

export class HttpTransport implements Transport {
  private baseUrl: string;
  private headers: Record<string, string>;
  private batchLogs: boolean;
  private flushInterval: number;
  private maxBatchSize: number;

  // Cache for events waiting to be sent
  private eventCache: LogEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private isSending = false;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;

    this.headers = {
      'Content-Type': 'application/json',
    };

    // Batching configuration
    this.batchLogs = options.batchLogs ?? false;
    this.flushInterval = options.flushInterval ?? 3000; // Default 3 seconds
    this.maxBatchSize = options.maxBatchSize ?? 100; // Default 100 items max

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

  private async flushEvents(): Promise<void> {
    // If no events to send or already in the process of sending, don't do anything
    if (this.eventCache.length === 0 || this.isSending) {
      return;
    }

    try {
      this.isSending = true;

      // Take all current events
      const events = [...this.eventCache];
      this.eventCache = [];

      // Send the batch to the server
      await axios.post(`${this.baseUrl}ingestion/batch`, { events }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error sending batched events:', error);
      // In a production environment, you might want to implement retry logic here
    } finally {
      this.isSending = false;
    }
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
    this.stopFlushTimer();
    await this.flushEvents();
  }
}
