import { useState, useEffect } from 'react';
import { BrowserRouter, useSearchParams, useNavigate } from 'react-router-dom';
import { api, type DateRange } from './lib/api';
import Sidebar from './components/Sidebar';
import RunsView from './components/RunsView';
import RunDetailView from './components/RunDetailView';
import StepStatsView from './components/StepStatsView';
import ImportView from './components/ImportView';
import SettingsView from './components/SettingsView';
import DateRangeSelector from './components/DateRangeSelector';

function AppContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<string[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [currentView, setCurrentView] = useState<string>('runs-view');
  const [dateRange, setDateRange] = useState<DateRange>({
    timePreset: '1440',
    startDate: null,
    endDate: null,
  });

  useEffect(() => {
    api.fetchPipelines().then(setPipelines);
  }, []);

  useEffect(() => {
    const pipeline = searchParams.get('pipeline') || '';
    const viewParam = searchParams.get('view');
    // Map URL view params to internal view IDs
    const viewMap: Record<string, string> = {
      'runs-view': 'runs-view',
      'run-detail': 'run-detail',
      'step-stats-view': 'step-stats-view',
      'import': 'import-view',
      'settings': 'settings-view',
    };
    const view = viewMap[viewParam || ''] || 'runs-view';
    const timePreset = searchParams.get('timePreset') || '1440';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    setSelectedPipeline(pipeline);
    setCurrentView(view);
    setDateRange({
      timePreset,
      startDate,
      endDate,
    });
  }, [searchParams]);

  const handlePipelineChange = (pipeline: string) => {
    setSelectedPipeline(pipeline);
    const params = new URLSearchParams(searchParams);
    if (pipeline) {
      params.set('pipeline', pipeline);
    } else {
      params.delete('pipeline');
    }
    navigate({ search: params.toString() });
  };

  const handleViewChange = (view: string) => {
    setCurrentView(view);
    const params = new URLSearchParams(searchParams);
    // Map internal view IDs to URL params
    const viewParamMap: Record<string, string> = {
      'runs-view': 'runs-view',
      'run-detail': 'run-detail',
      'step-stats-view': 'step-stats-view',
      'import-view': 'import',
      'settings-view': 'settings',
    };
    params.set('view', viewParamMap[view] || view);
    navigate({ search: params.toString() });
  };

  const handleDateRangeChange = (newDateRange: DateRange) => {
    setDateRange(newDateRange);
    const params = new URLSearchParams(searchParams);
    if (newDateRange.timePreset !== 'custom') {
      params.set('timePreset', newDateRange.timePreset);
      params.delete('startDate');
      params.delete('endDate');
    } else {
      params.set('timePreset', 'custom');
      if (newDateRange.startDate) {
        params.set('startDate', newDateRange.startDate);
      } else {
        params.delete('startDate');
      }
      if (newDateRange.endDate) {
        params.set('endDate', newDateRange.endDate);
      } else {
        params.delete('endDate');
      }
    }
    navigate({ search: params.toString() });
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        pipelines={pipelines}
        selectedPipeline={selectedPipeline}
        onPipelineChange={handlePipelineChange}
        currentView={currentView}
        onViewChange={handleViewChange}
      />
      <div className="flex-1 flex flex-col ml-[240px]">
        <div className="px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-foreground">
              {currentView === 'runs-view' && 'Pipeline Runs'}
              {currentView === 'run-detail' && 'Run Detail'}
              {currentView === 'step-stats-view' && 'Step Execution Stats'}
              {currentView === 'import-view' && 'Import Logs'}
              {currentView === 'settings-view' && 'Settings'}
            </h1>
            <DateRangeSelector dateRange={dateRange} onDateRangeChange={handleDateRangeChange} />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-8 bg-muted/30">
          {currentView === 'runs-view' && (
            <RunsView
              pipeline={selectedPipeline}
              dateRange={dateRange}
              onRunClick={(runId) => {
                const params = new URLSearchParams(searchParams);
                params.set('view', 'run-detail');
                params.set('runId', runId);
                navigate({ search: params.toString() });
              }}
            />
          )}
          {currentView === 'run-detail' && (
            <RunDetailView
              runId={searchParams.get('runId') || ''}
              onBack={() => {
                const params = new URLSearchParams(searchParams);
                params.set('view', 'runs-view');
                params.delete('runId');
                navigate({ search: params.toString() });
              }}
            />
          )}
          {currentView === 'step-stats-view' && (
            <StepStatsView pipeline={selectedPipeline} dateRange={dateRange} />
          )}
          {currentView === 'import-view' && <ImportView />}
          {currentView === 'settings-view' && <SettingsView pipeline={selectedPipeline} />}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
