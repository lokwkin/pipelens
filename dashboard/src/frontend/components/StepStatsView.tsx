import { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { api, type DateRange, type StepTimeSeriesData } from '@/lib/api';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Copy, Check, Maximize2 } from 'lucide-react';
import React from 'react';

interface StepStatsViewProps {
  pipeline: string;
  dateRange: DateRange;
  onRunClick?: (runId: string) => void;
  initialStepName?: string;
  onStepChange?: (stepName: string) => void;
}

export default function StepStatsView({ pipeline, dateRange, onRunClick, initialStepName, onStepChange }: StepStatsViewProps) {
  const [stepNames, setStepNames] = useState<string[]>([]);
  const [selectedStep, setSelectedStep] = useState<string>(initialStepName || '');
  const [data, setData] = useState<StepTimeSeriesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
  });
  const [copiedRowKey, setCopiedRowKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedInDialog, setCopiedInDialog] = useState(false);
  const [selectedRowForDialog, setSelectedRowForDialog] = useState<{
    stepKey: string;
    stepName?: string;
    startTime?: string;
    endTime?: string;
    duration: number;
    status: string;
    records?: any;
    result?: any;
  } | null>(null);

  // Update selected step when initialStepName changes (e.g., from URL)
  useEffect(() => {
    if (initialStepName && stepNames.includes(initialStepName)) {
      setSelectedStep(initialStepName);
    }
  }, [initialStepName, stepNames]);

  const toggleRow = (rowKey: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowKey)) {
      newExpanded.delete(rowKey);
    } else {
      newExpanded.add(rowKey);
    }
    setExpandedRows(newExpanded);
  };

  useEffect(() => {
    if (!pipeline) {
      setStepNames([]);
      return;
    }
    api.loadStepNames(pipeline).then(setStepNames);
  }, [pipeline]);

  useEffect(() => {
    if (!pipeline || !selectedStep) {
      setData(null);
      return;
    }

    setLoading(true);
    setExpandedRows(new Set()); // Reset expanded rows when data changes
    api
      .loadStepTimeSeries(pipeline, selectedStep, dateRange, pagination)
      .then(setData)
      .finally(() => setLoading(false));
  }, [pipeline, selectedStep, dateRange, pagination]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const copyToClipboard = async (rowKey: string, data: { records?: any; result?: any }) => {
    try {
      const text = JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(text);
      setCopiedRowKey(rowKey);
      setTimeout(() => setCopiedRowKey(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const openDetailsDialog = (item: any, rowKey: string) => {
    const records = item.stepMeta?.records || item.records;
    const result = item.stepMeta?.result || item.result;
    const startTime = item.stepMeta?.time?.startTs 
      ? new Date(item.stepMeta.time.startTs).toISOString()
      : item.startTime;
    const endTime = item.stepMeta?.time?.endTs 
      ? new Date(item.stepMeta.time.endTs).toISOString()
      : item.endTime || item.timestamp;
    const status = item.status || (item.stepMeta?.error ? 'error' : 'completed');
    
    setSelectedRowForDialog({
      stepKey: item.stepKey,
      stepName: item.stepMeta?.name || item.stepName,
      startTime,
      endTime,
      duration: item.duration,
      status,
      records,
      result,
    });
    setDialogOpen(true);
  };

  const chartData = data?.timeSeries.map((item) => ({
    timestamp: format(new Date(item.timestamp), 'MM-dd HH:mm'),
    duration: item.duration,
  })) || [];

  return (
    <div className="space-y-4">
        {/* Details Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Step Details: {selectedRowForDialog?.stepKey}</DialogTitle>
              <DialogDescription>{selectedRowForDialog?.stepName || selectedRowForDialog?.stepKey}</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto space-y-4">
              {selectedRowForDialog?.startTime && (
                <div>
                  <strong>Start Time:</strong>{' '}
                  {format(new Date(selectedRowForDialog.startTime), 'yyyy-MM-dd HH:mm:ss')}
                </div>
              )}
              {selectedRowForDialog?.endTime && (
                <div>
                  <strong>End Time:</strong>{' '}
                  {format(new Date(selectedRowForDialog.endTime), 'yyyy-MM-dd HH:mm:ss')}
                </div>
              )}
              <div>
                <strong>Duration:</strong> {formatDuration(selectedRowForDialog?.duration || 0)}
              </div>
              <div>
                <strong>Status:</strong>{' '}
                <Badge variant={selectedRowForDialog?.status === 'error' ? 'destructive' : 'default'}>
                  {selectedRowForDialog?.status}
                </Badge>
              </div>
              {(selectedRowForDialog?.records || selectedRowForDialog?.result) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <strong>Details:</strong>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (selectedRowForDialog) {
                          try {
                            const text = JSON.stringify({ records: selectedRowForDialog.records, result: selectedRowForDialog.result }, null, 2);
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
                    {JSON.stringify({ records: selectedRowForDialog.records, result: selectedRowForDialog.result }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <div className="mb-4">
          <Select value={selectedStep} onValueChange={(value) => {
            setSelectedStep(value);
            onStepChange?.(value);
          }}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select a step" />
            </SelectTrigger>
            <SelectContent>
              {stepNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedStep && data && (
          <>
            <div className="mb-6">
              <h3 className="text-base font-semibold mb-4">{selectedStep}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="border border-border rounded bg-card p-4">
                    <div className="text-sm text-muted-foreground mb-2">Execution Count</div>
                    <div className="text-2xl font-semibold">{data.stats.totalExecutions} total</div>
                    <div className="flex justify-between mt-2 text-sm">
                      <span className="text-green-600">{data.stats.successCount} success</span>
                      <span className="text-red-600">{data.stats.errorCount} errors</span>
                    </div>
                </div>
                <div className="border border-border rounded bg-card p-4">
                    <div className="text-sm text-muted-foreground mb-2">Duration Statistics</div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Average</div>
                        <div className="text-lg font-semibold">{formatDuration(data.stats.avgDuration)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Minimum</div>
                        <div className="text-lg font-semibold">{formatDuration(data.stats.minDuration)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Maximum</div>
                        <div className="text-lg font-semibold">{formatDuration(data.stats.maxDuration)}</div>
                      </div>
                    </div>
                </div>
              </div>

              {chartData.length > 0 && (
                <div className="border border-border rounded bg-card p-4 mb-4">
                    <h4 className="text-base font-semibold mb-4">Performance Over Time</h4>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timestamp" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="duration" stroke="#8884d8" />
                      </LineChart>
                    </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="border border-border rounded bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead className="min-w-[180px]">Timestamp (UTC)</TableHead>
                    <TableHead className="min-w-[120px]">Run ID</TableHead>
                    <TableHead className="min-w-[150px]">Step Key</TableHead>
                    <TableHead className="min-w-[100px]">Duration</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.timeSeries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                        No data found
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.timeSeries.map((item, idx) => {
                      const rowKey = `${item.runId}-${item.stepKey}-${idx}`;
                      const isExpanded = expandedRows.has(rowKey);
                      const records = item.stepMeta?.records || item.records;
                      const result = item.stepMeta?.result || item.result;
                      const startTime = item.stepMeta?.time?.startTs 
                        ? new Date(item.stepMeta.time.startTs).toISOString()
                        : item.startTime;
                      const endTime = item.stepMeta?.time?.endTs 
                        ? new Date(item.stepMeta.time.endTs).toISOString()
                        : item.endTime || item.timestamp;
                      // Derive status from stepMeta.error or use item.status if available
                      const status = item.status || (item.stepMeta?.error ? 'error' : 'completed');
                      
                      return (
                        <React.Fragment key={rowKey}>
                          <TableRow>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleRow(rowKey)}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{format(new Date(item.timestamp), 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                            <TableCell 
                              className={cn(
                                "font-mono text-sm whitespace-nowrap",
                                onRunClick && "cursor-pointer hover:text-primary hover:underline"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                onRunClick?.(item.runId);
                              }}
                            >
                              {item.runId}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{item.stepKey}</TableCell>
                            <TableCell className="whitespace-nowrap">{formatDuration(item.duration)}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant={status === 'error' ? 'destructive' : 'default'}>
                                {status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={6} className="bg-muted/50">
                                <div className="p-4 space-y-2">
                                  {startTime && (
                                    <div>
                                      <strong>Start Time:</strong>{' '}
                                      {format(new Date(startTime), 'yyyy-MM-dd HH:mm:ss')}
                                    </div>
                                  )}
                                  {endTime && (
                                    <div>
                                      <strong>End Time:</strong>{' '}
                                      {format(new Date(endTime), 'yyyy-MM-dd HH:mm:ss')}
                                    </div>
                                  )}
                                  {(records || result) && (
                                    <div>
                                      <div className="flex items-center gap-2 mb-2">
                                        <strong>Details:</strong>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2"
                                          onClick={() => copyToClipboard(rowKey, { records, result })}
                                        >
                                          {copiedRowKey === rowKey ? (
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
                                          onClick={() => openDetailsDialog(item, rowKey)}
                                        >
                                          <Maximize2 className="h-3 w-3 mr-1" />
                                          View Larger
                                        </Button>
                                      </div>
                                      <pre className="mt-2 p-3 bg-background rounded text-xs overflow-auto max-h-96 break-words whitespace-pre-wrap max-w-full">
                                        {JSON.stringify({ records, result }, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  {!records && !result && (
                                    <div className="text-sm text-muted-foreground">No additional details available</div>
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

            {data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {data.pagination.page === 1 ? 1 : (data.pagination.page - 1) * data.pagination.pageSize + 1} to{' '}
                  {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalItems)} of{' '}
                  {data.pagination.totalItems} items
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.pagination.page === 1}
                    onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.pagination.page >= data.pagination.totalPages}
                    onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {!selectedStep && (
          <div className="text-center py-12 text-muted-foreground text-sm">Select a pipeline and step to view instances</div>
        )}
    </div>
  );
}
