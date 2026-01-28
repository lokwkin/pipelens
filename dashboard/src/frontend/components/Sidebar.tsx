import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Workflow, List, Upload, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  pipelines: string[];
  selectedPipeline: string;
  onPipelineChange: (pipeline: string) => void;
  currentView: string;
  onViewChange: (view: string) => void;
}

export default function Sidebar({
  pipelines,
  selectedPipeline,
  onPipelineChange,
  currentView,
  onViewChange,
}: SidebarProps) {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState('3000');

  const navItems = [
    { id: 'runs-view', label: 'Pipeline Runs', icon: Workflow },
    { id: 'step-stats-view', label: 'Step Execution Stats', icon: List },
    { id: 'import-view', label: 'Import Logs', icon: Upload },
    { id: 'settings-view', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="fixed left-0 top-0 h-full w-[240px] bg-background border-r border-border flex flex-col">
      <div className="p-3 border-b border-border">
        <h1 className="text-sm font-semibold mb-3 text-foreground">Pipelens Portal</h1>
        <Select 
          value={selectedPipeline || undefined} 
          onValueChange={(value) => onPipelineChange(value || '')}
        >
          <SelectTrigger className="w-full h-8 text-sm bg-background hover:bg-accent border-border">
            <SelectValue placeholder="Select a pipeline" />
          </SelectTrigger>
          <SelectContent>
            {pipelines.map((pipeline) => (
              <SelectItem key={pipeline} value={pipeline}>
                {pipeline}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors',
                isActive
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
              Auto-refresh
            </Label>
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
          <Select value={refreshInterval} onValueChange={setRefreshInterval} disabled={!autoRefresh}>
            <SelectTrigger className="w-full h-8 text-xs bg-background hover:bg-accent border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3000">3 sec</SelectItem>
              <SelectItem value="10000">10 sec</SelectItem>
              <SelectItem value="30000">30 sec</SelectItem>
              <SelectItem value="60000">1 min</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
