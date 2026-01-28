import { useState, useMemo } from 'react';
import { type Step } from '@/lib/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface GanttChartProps {
  steps: Step[];
  onStepClick?: (stepKey: string) => void;
}

export default function GanttChart({ steps, onStepClick }: GanttChartProps) {
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  const chartData = useMemo(() => {
    if (!steps || steps.length === 0) return null;

    // Calculate the overall time range
    const startTimes = steps.map((step) => new Date(step.startTime).getTime());
    const endTimes = steps
      .map((step) => (step.endTime ? new Date(step.endTime).getTime() : null))
      .filter((t): t is number => t !== null);

    const minStart = Math.min(...startTimes);
    const maxEnd = endTimes.length > 0 ? Math.max(...endTimes) : Date.now();
    const totalDuration = maxEnd - minStart;

    // Calculate positions and widths for each step
    const processedSteps = steps.map((step) => {
      const startTs = new Date(step.startTime).getTime();
      const endTs = step.endTime ? new Date(step.endTime).getTime() : maxEnd;

      const leftPercent = ((startTs - minStart) / totalDuration) * 100;
      const widthPercent = ((endTs - startTs) / totalDuration) * 100;

      return {
        ...step,
        leftPercent,
        widthPercent,
        startTs,
        endTs,
      };
    });

    return {
      minStart,
      maxEnd,
      totalDuration,
      steps: processedSteps,
    };
  }, [steps]);

  if (!chartData || chartData.steps.length === 0) {
    return (
      <div className="border border-border rounded bg-card p-4 text-center text-sm text-muted-foreground">
        No steps data available for Gantt Chart
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'error':
        return 'bg-destructive/20 border-destructive/30 text-destructive';
      case 'completed':
        return 'bg-primary/10 border-primary/30 text-primary';
      case 'running':
        return 'bg-accent border-accent-foreground/20 text-accent-foreground';
      default:
        return 'bg-muted border-border text-muted-foreground';
    }
  };


  const formatRelativeTime = (timestamp: number) => {
    const relativeMs = timestamp - chartData.minStart;
    if (relativeMs < 1000) return `${relativeMs}ms`;
    if (relativeMs < 60000) return `${(relativeMs / 1000).toFixed(3)}s`;
    return `${(relativeMs / 60000).toFixed(2)}m`;
  };

  const handleBarHover = (stepKey: string, event: React.MouseEvent) => {
    setHoveredStep(stepKey);
    const rect = event.currentTarget.getBoundingClientRect();
    // Position tooltip to the right of the cursor, but adjust if it would go off-screen
    const x = event.clientX + 10;
    const y = event.clientY + 10;
    setTooltipPosition({ x, y });
  };

  const handleBarLeave = () => {
    setHoveredStep(null);
    setTooltipPosition(null);
  };

  const hoveredStepData = hoveredStep ? chartData.steps.find((s) => s.stepKey === hoveredStep) : null;

  return (
    <div className="space-y-4 relative">
      {/* Tooltip */}
      {hoveredStepData && tooltipPosition && (
        <div
          className="fixed z-50 bg-popover border border-border rounded shadow-lg p-3 text-sm pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            maxWidth: '320px',
            transform: 'translateX(0)',
          }}
        >
          <div className="space-y-1">
            <div>
              <span className="font-semibold text-foreground">Key:</span>{' '}
              <span className="font-mono text-xs">{hoveredStepData.stepKey}</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Name:</span>{' '}
              <span className="text-muted-foreground">{hoveredStepData.stepName}</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Relative Start:</span>{' '}
              <span className="text-muted-foreground">{formatRelativeTime(hoveredStepData.startTs)}</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Relative End:</span>{' '}
              <span className="text-muted-foreground">{formatRelativeTime(hoveredStepData.endTs)}</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Actual Start:</span>{' '}
              <span className="text-muted-foreground font-mono text-xs">
                {format(new Date(hoveredStepData.startTs), 'yyyy-MM-dd HH:mm:ss.SSS')}
              </span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Actual End:</span>{' '}
              <span className="text-muted-foreground font-mono text-xs">
                {format(new Date(hoveredStepData.endTs), 'yyyy-MM-dd HH:mm:ss.SSS')}
              </span>
            </div>
            <div>
              <span className="font-semibold text-foreground">Status:</span>{' '}
              <span className="text-muted-foreground capitalize">{hoveredStepData.status}</span>
            </div>
            {hoveredStepData.status === 'error' && hoveredStepData.error && (
              <div className="mt-2 pt-2 border-t border-border">
                <div>
                  <span className="font-semibold text-destructive">Error:</span>
                </div>
                <div className="mt-1 text-destructive/90 text-xs break-words whitespace-pre-wrap font-mono">
                  {hoveredStepData.error}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border border-border rounded bg-card p-4">
        {/* Gantt bars - scrollable */}
        <div className="max-h-[500px] overflow-y-auto space-y-1">
          {chartData.steps.map((step) => (
            <div key={step.stepKey} className="flex items-center gap-4 min-h-[28px]">
              <div className="w-[300px] flex-shrink-0">
                <div
                  className="font-mono text-xs text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                  onMouseEnter={(e) => handleBarHover(step.stepKey, e)}
                  onMouseMove={(e) => setTooltipPosition({ x: e.clientX + 10, y: e.clientY + 10 })}
                  onMouseLeave={handleBarLeave}
                  onClick={() => onStepClick?.(step.stepKey)}
                >
                  {step.stepKey}
                </div>
              </div>
              <div className="flex-1 relative h-6">
                {/* Background timeline */}
                <div className="absolute inset-0 bg-muted/30 rounded" />
                {/* Gantt bar */}
                <div
                  className={cn(
                    'absolute top-0 bottom-0 rounded border',
                    getStatusColor(step.status),
                    'flex items-center justify-center text-xs font-medium transition-all hover:opacity-80 cursor-pointer'
                  )}
                  style={{
                    left: `${step.leftPercent}%`,
                    width: `${Math.max(step.widthPercent, 0.5)}%`,
                  }}
                  onMouseEnter={(e) => handleBarHover(step.stepKey, e)}
                  onMouseMove={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={handleBarLeave}
                  onClick={() => onStepClick?.(step.stepKey)}
                >
                  {step.widthPercent > 5 && (
                    <span className="truncate px-1">
                      {step.duration < 1000 ? `${step.duration}ms` : `${(step.duration / 1000).toFixed(2)}s`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Supplementary info */}
      <div className="flex justify-between items-center text-xs text-muted-foreground px-1">
        <div className="flex flex-col">
          <span>Start</span>
          <span className="font-mono text-foreground mt-0.5">{format(new Date(chartData.minStart), 'yyyy-MM-dd HH:mm:ss.SSS')}</span>
        </div>
        <div className="flex flex-col items-center">
          <span>Overall Duration</span>
          <span className="font-mono text-foreground mt-0.5">
            {chartData.totalDuration < 1000
              ? `${chartData.totalDuration}ms`
              : chartData.totalDuration < 60000
                ? `${(chartData.totalDuration / 1000).toFixed(3)}s`
                : `${(chartData.totalDuration / 60000).toFixed(2)}m`}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span>End</span>
          <span className="font-mono text-foreground mt-0.5">{format(new Date(chartData.maxEnd), 'yyyy-MM-dd HH:mm:ss.SSS')}</span>
        </div>
      </div>
    </div>
  );
}
