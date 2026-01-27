import { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { api, type Settings } from '@/lib/api';

interface SettingsViewProps {
  pipeline: string;
}

export default function SettingsView({ pipeline }: SettingsViewProps) {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(false);
  const [retentionDays, setRetentionDays] = useState(14);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [editingColumn, setEditingColumn] = useState<number | null>(null);
  const [columnForm, setColumnForm] = useState({
    name: '',
    path: '',
    pipeline: '',
  });

  useEffect(() => {
    if (!pipeline) return;
    setLoading(true);
    api
      .getSettings(pipeline)
      .then((data) => {
        setSettings(data);
        setRetentionDays(data.retentionDays || 14);
      })
      .finally(() => setLoading(false));
  }, [pipeline]);

  const handleSaveRetention = async () => {
    if (!pipeline) return;
    const newSettings = { ...settings, retentionDays };
    await api.saveSettings(pipeline, newSettings);
    setSettings(newSettings);
  };

  const handleAddColumn = () => {
    setColumnForm({ name: '', path: '', pipeline: 'all' });
    setEditingColumn(null);
    setShowColumnDialog(true);
  };

  const handleEditColumn = (index: number) => {
    const column = settings.presetColumns?.[index];
    if (column) {
      setColumnForm({
        name: column.name,
        path: column.path,
        pipeline: column.pipeline || 'all',
      });
      setEditingColumn(index);
      setShowColumnDialog(true);
    }
  };

  const handleSaveColumn = async () => {
    if (!pipeline) return;
    const columns = settings.presetColumns || [];
    const newColumn = {
      name: columnForm.name,
      path: columnForm.path,
      pipeline: columnForm.pipeline === 'all' ? undefined : columnForm.pipeline,
    };

    let newColumns;
    if (editingColumn !== null) {
      newColumns = [...columns];
      newColumns[editingColumn] = newColumn;
    } else {
      newColumns = [...columns, newColumn];
    }

    const newSettings = { ...settings, presetColumns: newColumns };
    await api.saveSettings(pipeline, newSettings);
    setSettings(newSettings);
    setShowColumnDialog(false);
  };

  const handleDeleteColumn = async (index: number) => {
    if (!pipeline) return;
    const columns = settings.presetColumns || [];
    const newColumns = columns.filter((_, i) => i !== index);
    const newSettings = { ...settings, presetColumns: newColumns };
    await api.saveSettings(pipeline, newSettings);
    setSettings(newSettings);
  };

  if (!pipeline) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">Select a pipeline to view settings</div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="border border-border rounded bg-card p-6">
            <h5 className="text-base font-semibold mb-4">Data Retention</h5>
            <div className="mb-4 p-4 bg-muted rounded-lg">
              <p className="text-sm mb-2">
                <strong>Data Retention Settings</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Configure how long run and step data is retained before being automatically deleted. Data older than
                the retention period will be permanently removed.
              </p>
            </div>
            <div className="flex items-end gap-4">
              <div>
                <Label htmlFor="retention-days">Retention Period (days)</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="retention-days"
                    type="number"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value) || 14)}
                    className="w-[120px]"
                    min="1"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Set how many days to keep data before automatic deletion (default: 14 days)
                </p>
              </div>
              <Button onClick={handleSaveRetention} size="sm">
                Save Settings
              </Button>
            </div>
        </div>

        <div className="border border-border rounded bg-card p-6">
            <div className="flex justify-between items-center mb-4">
              <h5 className="text-base font-semibold">Preset Data Columns</h5>
              <Button onClick={handleAddColumn} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Column
              </Button>
            </div>
            <div className="mb-4 p-4 bg-muted rounded-lg">
              <p className="text-sm mb-2">
                <strong>Custom Data Columns</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Define custom columns to display specific step data in the steps table. These columns help you monitor
                important metrics across steps without expanding each row.
              </p>
            </div>
            <div className="border border-border rounded bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column Name</TableHead>
                    <TableHead>Data Path</TableHead>
                    <TableHead>Pipeline</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.presetColumns && settings.presetColumns.length > 0 ? (
                    settings.presetColumns.map((column, index) => (
                      <TableRow key={index}>
                        <TableCell>{column.name}</TableCell>
                        <TableCell className="font-mono text-sm">{column.path}</TableCell>
                        <TableCell>{column.pipeline || <Badge variant="secondary">All</Badge>}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditColumn(index)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDeleteColumn(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No preset columns defined
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
        </div>
      </div>

      <Dialog open={showColumnDialog} onOpenChange={setShowColumnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingColumn !== null ? 'Edit' : 'Add'} Preset Column</DialogTitle>
            <DialogDescription>
              Define a custom column to display step data in the steps table.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="column-name">Column Name</Label>
              <Input
                id="column-name"
                value={columnForm.name}
                onChange={(e) => setColumnForm({ ...columnForm, name: e.target.value })}
                placeholder="e.g., Input Size"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">This will be displayed as the column header</p>
            </div>
            <div>
              <Label htmlFor="data-path">Data Path</Label>
              <div className="flex gap-2 mt-2">
                <Select
                  value={columnForm.path.split('.')[0] || ''}
                  onValueChange={(value) =>
                    setColumnForm({ ...columnForm, path: value + (columnForm.path.includes('.') ? '.' + columnForm.path.split('.').slice(1).join('.') : '') })
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="records">records</SelectItem>
                    <SelectItem value="result">result</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  id="data-path"
                  value={columnForm.path.includes('.') ? columnForm.path.split('.').slice(1).join('.') : ''}
                  onChange={(e) => {
                    const root = columnForm.path.split('.')[0] || 'records';
                    setColumnForm({ ...columnForm, path: root + (e.target.value ? '.' + e.target.value : '') });
                  }}
                  placeholder="Nested path (e.g. metrics.count)"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Complete path: <code className="bg-muted px-1 rounded">{columnForm.path || 'none'}</code>
              </p>
            </div>
            <div>
              <Label htmlFor="column-pipeline">Pipeline (Optional)</Label>
              <Select
                value={columnForm.pipeline || 'all'}
                onValueChange={(value) => setColumnForm({ ...columnForm, pipeline: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="All Pipelines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pipelines</SelectItem>
                  <SelectItem value={pipeline}>{pipeline}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Leave blank to apply to all pipelines</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowColumnDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveColumn}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
