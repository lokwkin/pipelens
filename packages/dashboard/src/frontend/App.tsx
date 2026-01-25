import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { api, type DateRange } from './lib/api';
import Sidebar from './components/Sidebar';
import RunsView from './components/RunsView';
import RunDetailView from './components/RunDetailView';
import StepStatsView from './components/StepStatsView';
import ImportView from './components/ImportView';
import SettingsView from './components/SettingsView';
import DateRangeSelector from './components/DateRangeSelector';

function AppContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [pipelines, setPipelines] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    timePreset: '1440',
    startDate: null,
    endDate: null,
  });

  useEffect(() => {
    api.fetchPipelines().then(setPipelines);
  }, []);

  useEffect(() => {
    const timePreset = searchParams.get('timePreset') || '1440';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    setDateRange({
      timePreset,
      startDate,
      endDate,
    });
  }, [searchParams]);

  // Get current view from pathname
  const getCurrentView = () => {
    const path = location.pathname;
    if (path.startsWith('/pipelines/') && path.includes('/runs/')) {
      return 'run-detail';
    }
    if (path.startsWith('/pipelines/') && path.includes('/stats/')) {
      return 'step-stats-view';
    }
    if (path.startsWith('/pipelines/') && path.includes('/runs')) {
      return 'runs-view';
    }
    if (path.startsWith('/pipelines/') && path.includes('/stats')) {
      return 'step-stats-view';
    }
    if (path === '/import') {
      return 'import-view';
    }
    if (path.startsWith('/settings')) {
      return 'settings-view';
    }
    return 'runs-view';
  };

  // Get selected pipeline from pathname
  const getSelectedPipeline = () => {
    const match = location.pathname.match(/^\/pipelines\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  };

  const handlePipelineChange = (pipeline: string) => {
    const currentPath = location.pathname;
    const currentView = getCurrentView();
    
    // Preserve current view when changing pipeline
    if (pipeline) {
      if (currentView === 'runs-view' || currentView === 'run-detail') {
        navigate(`/pipelines/${encodeURIComponent(pipeline)}/runs`);
      } else if (currentView === 'step-stats-view') {
        // Extract stepName if present
        const stepMatch = currentPath.match(/\/stats\/(.+)$/);
        if (stepMatch) {
          navigate(`/pipelines/${encodeURIComponent(pipeline)}/stats/${encodeURIComponent(stepMatch[1])}`);
        } else {
          navigate(`/pipelines/${encodeURIComponent(pipeline)}/stats`);
        }
      } else {
        navigate(`/pipelines/${encodeURIComponent(pipeline)}/runs`);
      }
    } else {
      // If no pipeline selected, go to import or settings based on current view
      if (currentView === 'settings-view') {
        navigate('/settings');
      } else {
        navigate('/import');
      }
    }
  };

  const handleViewChange = (view: string) => {
    const selectedPipeline = getSelectedPipeline();
    const currentPath = location.pathname;
    
    // Map internal view IDs to paths
    if (view === 'runs-view') {
      if (selectedPipeline) {
        navigate(`/pipelines/${encodeURIComponent(selectedPipeline)}/runs`);
      } else {
        navigate('/import');
      }
    } else if (view === 'step-stats-view') {
      if (selectedPipeline) {
        navigate(`/pipelines/${encodeURIComponent(selectedPipeline)}/stats`);
      } else {
        navigate('/import');
      }
    } else if (view === 'import-view') {
      navigate('/import');
    } else if (view === 'settings-view') {
      if (selectedPipeline) {
        navigate(`/settings/${encodeURIComponent(selectedPipeline)}`);
      } else {
        navigate('/settings');
      }
    }
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

  const currentView = getCurrentView();
  const selectedPipeline = getSelectedPipeline();

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
            {(currentView === 'runs-view' || currentView === 'step-stats-view') && (
              <DateRangeSelector dateRange={dateRange} onDateRangeChange={handleDateRangeChange} />
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-8 bg-muted/30">
          <Routes>
            <Route path="/" element={<Navigate to="/import" replace />} />
            <Route
              path="/pipelines/:pipeline/runs"
              element={
                <RunsViewWrapper dateRange={dateRange} />
              }
            />
            <Route
              path="/pipelines/:pipeline/runs/:runId"
              element={
                <RunDetailViewWrapper />
              }
            />
            <Route
              path="/pipelines/:pipeline/stats"
              element={
                <StepStatsViewWrapper dateRange={dateRange} />
              }
            />
            <Route
              path="/pipelines/:pipeline/stats/:stepName"
              element={
                <StepStatsViewWrapper dateRange={dateRange} />
              }
            />
            <Route path="/import" element={<ImportView />} />
            <Route path="/settings" element={<SettingsView pipeline="" />} />
            <Route path="/settings/:pipeline" element={<SettingsViewWrapper />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function RunsViewWrapper({ dateRange }: { dateRange: DateRange }) {
  const { pipeline } = useParams<{ pipeline: string }>();
  const navigate = useNavigate();
  const decodedPipeline = pipeline ? decodeURIComponent(pipeline) : '';

  return (
    <RunsView
      pipeline={decodedPipeline}
      dateRange={dateRange}
      onRunClick={(runId) => {
        navigate(`/pipelines/${encodeURIComponent(decodedPipeline)}/runs/${encodeURIComponent(runId)}`);
      }}
    />
  );
}

function RunDetailViewWrapper() {
  const { runId, pipeline } = useParams<{ runId: string; pipeline: string }>();
  const navigate = useNavigate();
  const decodedPipeline = pipeline ? decodeURIComponent(pipeline) : '';

  return (
    <RunDetailView
      runId={runId || ''}
      onBack={() => {
        navigate(`/pipelines/${encodeURIComponent(decodedPipeline)}/runs`);
      }}
      onStepNameClick={(stepName, pipelineFromRun) => {
        const pipelineToUse = pipelineFromRun || decodedPipeline;
        if (pipelineToUse) {
          navigate(`/pipelines/${encodeURIComponent(pipelineToUse)}/stats/${encodeURIComponent(stepName)}`);
        }
      }}
    />
  );
}

function StepStatsViewWrapper({ dateRange }: { dateRange: DateRange }) {
  const { stepName, pipeline } = useParams<{ stepName?: string; pipeline: string }>();
  const navigate = useNavigate();
  const decodedPipeline = pipeline ? decodeURIComponent(pipeline) : '';
  const decodedStepName = stepName ? decodeURIComponent(stepName) : undefined;

  const handleStepChange = (newStep: string) => {
    if (newStep) {
      navigate(`/pipelines/${encodeURIComponent(decodedPipeline)}/stats/${encodeURIComponent(newStep)}`);
    } else {
      navigate(`/pipelines/${encodeURIComponent(decodedPipeline)}/stats`);
    }
  };

  return (
    <StepStatsView
      pipeline={decodedPipeline}
      dateRange={dateRange}
      initialStepName={decodedStepName}
      onStepChange={handleStepChange}
      onRunClick={(runId) => {
        navigate(`/pipelines/${encodeURIComponent(decodedPipeline)}/runs/${encodeURIComponent(runId)}`);
      }}
    />
  );
}

function SettingsViewWrapper() {
  const { pipeline } = useParams<{ pipeline: string }>();
  return <SettingsView pipeline={pipeline ? decodeURIComponent(pipeline) : ''} />;
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
