import { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { api, type DateRange, type StepTimeSeriesData } from '@/lib/api';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface StepStatsViewProps {
  pipeline: string;
  dateRange: DateRange;
}

export default function StepStatsView({ pipeline, dateRange }: StepStatsViewProps) {
  const [stepNames, setStepNames] = useState<string[]>([]);
  const [selectedStep, setSelectedStep] = useState<string>('');
  const [data, setData] = useState<StepTimeSeriesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
  });

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

  const chartData = data?.timeSeries.map((item) => ({
    timestamp: format(new Date(item.timestamp), 'MM-dd HH:mm'),
    duration: item.duration,
  })) || [];

  return (
    <div className="space-y-4">
        <div className="mb-4">
          <Select value={selectedStep} onValueChange={setSelectedStep}>
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
                    <h4 className="text-sm font-medium mb-4">Performance Over Time</h4>
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

            <div className="border border-border rounded bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp (UTC)</TableHead>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Step Key</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.timeSeries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                        No data found
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.timeSeries.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{format(new Date(item.timestamp), 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                        <TableCell className="font-mono text-sm">{item.runId}</TableCell>
                        <TableCell className="font-mono text-sm">{item.stepKey}</TableCell>
                        <TableCell>{formatDuration(item.duration)}</TableCell>
                        <TableCell>
                          <Badge variant={item.status === 'error' ? 'destructive' : 'default'}>
                            {item.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
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
