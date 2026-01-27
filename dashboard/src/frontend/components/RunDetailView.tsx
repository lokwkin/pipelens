import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { ArrowLeft, ChevronDown, ChevronUp, Search, X, Copy, Check, Maximize2 } from 'lucide-react';
import { api, type Step } from '@/lib/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import GanttChart from './GanttChart';

interface RunDetailViewProps {
  runId: string;
  onBack: () => void;
  onStepNameClick?: (stepName: string, pipeline?: string) => void;
}

export default function RunDetailView({ runId, onBack, onStepNameClick }: RunDetailViewProps) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [pipeline, setPipeline] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [copiedStepKey, setCopiedStepKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedInDialog, setCopiedInDialog] = useState(false);
  const [selectedStepForDialog, setSelectedStepForDialog] = useState<Step | null>(null);

  useEffect(() => {
    if (!runId) return;

    // Fetch run data to get pipeline
    api.loadRunData(runId).then((data) => {
      if (data) {
        setPipeline(data.pipeline);
      }
    });

    setLoading(true);
    api
      .loadRunDetails(runId)
      .then((data) => {
        if (data) setSteps(data);
      })
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => {
    if (!runId) return;

    setLoading(true);
    api
      .loadRunDetails(runId)
      .then((data) => {
        if (data) setSteps(data);
      })
      .finally(() => setLoading(false));
  }, [runId]);

  const toggleRow = (stepKey: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(stepKey)) {
      newExpanded.delete(stepKey);
    } else {
      newExpanded.add(stepKey);
    }
    setExpandedRows(newExpanded);
  };

  const handleGanttStepClick = (stepKey: string) => {
    // Expand the row if not already expanded
    const wasExpanded = expandedRows.has(stepKey);
    if (!wasExpanded) {
      toggleRow(stepKey);
    }
    
    // Scroll to the row after a brief delay to ensure it's rendered (longer delay if we just expanded)
    setTimeout(() => {
      const rowElement = document.getElementById(`step-row-${stepKey}`);
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight the row briefly
        rowElement.classList.add('bg-accent/50');
        setTimeout(() => {
          rowElement.classList.remove('bg-accent/50');
        }, 1500);
      }
    }, wasExpanded ? 50 : 150);
  };

  const filteredSteps = steps.filter((step) => {
    const matchesSearch = !searchQuery || step.stepKey.toLowerCase().includes(searchQuery.toLowerCase()) || step.stepName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || statusFilter === 'all' || step.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'destructive' | 'secondary'> = {
      completed: 'default',
      error: 'destructive',
      running: 'secondary',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const copyToClipboard = async (stepKey: string, data: { records?: any; result?: any }) => {
    try {
      const text = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(text);
      setCopiedStepKey(stepKey);
      setTimeout(() => setCopiedStepKey(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const openDetailsDialog = (step: Step) => {
    setSelectedStepForDialog(step);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Runs
        </Button>

        {/* Details Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Step Details: {selectedStepForDialog?.stepKey}</DialogTitle>
              <DialogDescription>{selectedStepForDialog?.stepName}</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto space-y-4">
              <div>
                <strong>Start Time:</strong>{' '}
                {selectedStepForDialog && format(new Date(selectedStepForDialog.startTime), 'yyyy-MM-dd HH:mm:ss')}
              </div>
              {selectedStepForDialog?.endTime && (
                <div>
                  <strong>End Time:</strong>{' '}
                  {format(new Date(selectedStepForDialog.endTime), 'yyyy-MM-dd HH:mm:ss')}
                </div>
              )}
              <div>
                <strong>Duration:</strong> {selectedStepForDialog && formatDuration(selectedStepForDialog.duration)}
              </div>
              <div>
                <strong>Status:</strong> {selectedStepForDialog && getStatusBadge(selectedStepForDialog.status)}
              </div>
              {(selectedStepForDialog?.records || selectedStepForDialog?.result) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <strong>Details:</strong>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (selectedStepForDialog) {
                          try {
                            const text = JSON.stringify({ records: selectedStepForDialog.records, result: selectedStepForDialog.result }, null, 2);
                            await navigator.clipboard.writeText(text);
                            setCopiedInDialog(true);
                            setTimeout(() => setCopiedInDialog(false), 2000);
                          } catch (error) {
                            console.error('Failed to copy to clipboard:', error);
                          }
                        }
                      }}
                    >
                      {copiedInDialog ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="p-4 bg-background rounded text-xs overflow-auto break-words whitespace-pre-wrap max-w-full border">
                    {JSON.stringify({ records: selectedStepForDialog.records, result: selectedStepForDialog.result }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            <GanttChart steps={steps} onStepClick={handleGanttStepClick} />
            
            <div className="mb-4">
              <h3 className="text-base font-semibold mb-3">Total Steps: {steps.length}</h3>
              <div className="flex gap-3 mb-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search steps..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter || undefined} onValueChange={(value) => setStatusFilter(value || undefined)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                  </SelectContent>
                </Select>
                {(searchQuery || statusFilter) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter(undefined);
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                )}
              </div>
            </div>

            <div className="border border-border rounded bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Step Key</TableHead>
                    <TableHead>Step Name</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSteps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                        No steps found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSteps.map((step) => {
                      const isExpanded = expandedRows.has(step.stepKey);
                      return (
                        <React.Fragment key={step.stepKey}>
                          <TableRow id={`step-row-${step.stepKey}`}>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleRow(step.stepKey)}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{step.stepKey}</TableCell>
                            <TableCell 
                              className={cn(
                                onStepNameClick && "cursor-pointer hover:text-primary hover:underline"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                onStepNameClick?.(step.stepName, pipeline);
                              }}
                            >
                              {step.stepName}
                            </TableCell>
                            <TableCell>{formatDuration(step.duration)}</TableCell>
                            <TableCell>{getStatusBadge(step.status)}</TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={5} className="bg-muted/50">
                                <div className="p-4 space-y-2">
                                  <div>
                                    <strong>Start Time:</strong>{' '}
                                    {format(new Date(step.startTime), 'yyyy-MM-dd HH:mm:ss')}
                                  </div>
                                  {step.endTime && (
                                    <div>
                                      <strong>End Time:</strong>{' '}
                                      {format(new Date(step.endTime), 'yyyy-MM-dd HH:mm:ss')}
                                    </div>
                                  )}
                                  {(step.records || step.result) && (
                                    <div>
                                      <div className="flex items-center gap-2 mb-2">
                                        <strong>Details:</strong>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2"
                                          onClick={() => copyToClipboard(step.stepKey, { records: step.records, result: step.result })}
                                        >
                                          {copiedStepKey === step.stepKey ? (
                                            <>
                                              <Check className="h-3 w-3 mr-1" />
                                              Copied!
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="h-3 w-3 mr-1" />
                                              Copy
                                            </>
                                          )}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2"
                                          onClick={() => openDetailsDialog(step)}
                                        >
                                          <Maximize2 className="h-3 w-3 mr-1" />
                                          View Larger
                                        </Button>
                                      </div>
                                      <pre className="mt-2 p-3 bg-background rounded text-xs overflow-auto max-h-96 break-words whitespace-pre-wrap max-w-full">
                                        {JSON.stringify({ records: step.records, result: step.result }, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
    </div>
  );
}
