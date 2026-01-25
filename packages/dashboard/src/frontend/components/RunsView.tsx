import { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Search } from 'lucide-react';
import { api, type DateRange, type Run } from '@/lib/api';
import { format } from 'date-fns';

interface RunsViewProps {
  pipeline: string;
  dateRange: DateRange;
  onRunClick: (runId: string) => void;
}

export default function RunsView({ pipeline, dateRange, onRunClick }: RunsViewProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 0,
  });

  useEffect(() => {
    if (!pipeline) {
      setRuns([]);
      return;
    }

    setLoading(true);
    api
      .loadRuns(pipeline, dateRange, { page: pagination.page, pageSize: pagination.pageSize }, searchQuery)
      .then((data) => {
        setRuns(data.items);
        setPagination(data.pagination);
      })
      .finally(() => setLoading(false));
  }, [pipeline, dateRange, pagination.page, pagination.pageSize, searchQuery]);

  const handleSearch = () => {
    setPagination({ ...pagination, page: 1 });
  };

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

  return (
    <div className="space-y-4">
        <div className="mb-4 max-w-md">
          <div className="flex gap-2">
            <Input
              placeholder="Search by Run ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!pipeline ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Select a pipeline to view runs</div>
        ) : loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Loading...</div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No runs found</div>
        ) : (
          <>
            <div className="border border-border rounded bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Pipeline</TableHead>
                    <TableHead>Start Time (UTC)</TableHead>
                    <TableHead>End Time (UTC)</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow
                      key={run.runId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onRunClick(run.runId)}
                    >
                      <TableCell className="font-mono text-sm">{run.runId}</TableCell>
                      <TableCell>{run.pipeline}</TableCell>
                      <TableCell>{format(new Date(run.startTime), 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                      <TableCell>
                        {run.endTime ? format(new Date(run.endTime), 'yyyy-MM-dd HH:mm:ss') : '-'}
                      </TableCell>
                      <TableCell>{formatDuration(run.duration)}</TableCell>
                      <TableCell>{getStatusBadge(run.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {pagination.page === 1 ? 1 : (pagination.page - 1) * pagination.pageSize + 1} to{' '}
                {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of{' '}
                {pagination.totalItems} runs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page === 1}
                  onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                >
                  Next
                </Button>
                <Select
                  value={pagination.pageSize.toString()}
                  onValueChange={(value) =>
                    setPagination({ ...pagination, pageSize: parseInt(value), page: 1 })
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 per page</SelectItem>
                    <SelectItem value="25">25 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
