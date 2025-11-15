'use client';

import { useState } from 'react';
import { Activity, Zap, CheckCircle, XCircle, Clock, TrendingUp, X, StopCircle } from 'lucide-react';
import type { Stats, Job } from '@/types';

interface SystemMonitorProps {
  stats: Stats | null;
  jobs: Job[];
  isConnected: boolean;
  onRefreshJobs?: () => void;
  onStopJob?: (jobId: string) => Promise<void>;
}

export function SystemMonitor({ stats, jobs, isConnected, onRefreshJobs, onStopJob }: SystemMonitorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'jobs'>('stats');

  const runningJobsCount = jobs.filter(j => j.status === 'running').length;
  const hasActiveJobs = runningJobsCount > 0;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed sm:bottom-4 sm:right-4 sm:top-4 sm:right-6 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all z-30 flex items-center justify-center relative"
        title="System Monitor"
      >
        <Activity size={18} className="sm:w-5 sm:h-5" />
        {hasActiveJobs && (
          <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-bold animate-pulse">
            {runningJobsCount}
          </span>
        )}
      </button>

      {/* Monitor Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 monitor-backdrop-enter"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-[var(--sidebar-bg)] border-l border-[var(--border)] z-50 flex flex-col shadow-2xl monitor-panel-enter">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-[var(--accent-primary)]" />
                <h2 className="text-lg font-semibold">System Monitor</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-[var(--card-bg)] flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Connection Status */}
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)]">Status</span>
              <div className={`flex items-center gap-2 text-sm font-medium ${
                isConnected ? 'text-green-400' : 'text-red-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-400' : 'bg-red-400'
                } ${isConnected ? 'animate-pulse' : ''}`} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setActiveTab('stats')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === 'stats'
                    ? 'text-[var(--accent-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                Statistics
                {activeTab === 'stats' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-primary)]" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('jobs')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === 'jobs'
                    ? 'text-[var(--accent-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                Jobs ({jobs.length})
                {activeTab === 'jobs' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-primary)]" />
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'stats' ? (
                <StatsView stats={stats} />
              ) : (
                <JobsView jobs={jobs} onRefresh={onRefreshJobs} onStopJob={onStopJob} />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function StatsView({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        <Activity size={48} className="mx-auto mb-3 opacity-50" />
        <p>No statistics available</p>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Jobs',
      value: stats.totalJobs,
      icon: Zap,
      color: 'from-blue-400 to-cyan-400'
    },
    {
      label: 'Completed',
      value: stats.completedJobs,
      icon: CheckCircle,
      color: 'from-green-400 to-emerald-400'
    },
    {
      label: 'Failed',
      value: stats.failedJobs,
      icon: XCircle,
      color: 'from-red-400 to-rose-400'
    },
    {
      label: 'Running',
      value: stats.runningJobs,
      icon: TrendingUp,
      color: 'from-orange-400 to-amber-400'
    },
    {
      label: 'Pending',
      value: stats.pendingJobs,
      icon: Clock,
      color: 'from-purple-400 to-pink-400'
    },
    {
      label: 'Conversations',
      value: stats.totalConversations,
      icon: Activity,
      color: 'from-indigo-400 to-violet-400'
    }
  ];

  return (
    <div className="space-y-3">
      {statCards.map((stat, index) => (
        <div
          key={index}
          className="bg-[var(--card-bg)] rounded-xl p-4 border border-[var(--border)] hover:border-[var(--accent-primary)] transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                <stat.icon size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-[var(--foreground)]">{stat.value}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function JobsView({ jobs, onRefresh, onStopJob }: { jobs: Job[]; onRefresh?: () => void; onStopJob?: (jobId: string) => Promise<void> }) {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        <Clock size={48} className="mx-auto mb-3 opacity-50" />
        <p>No jobs found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">Recent Jobs</h3>
        <button
          onClick={onRefresh}
          className="text-xs text-[var(--accent-primary)] hover:text-[var(--accent-hover)] font-medium"
        >
          Refresh
        </button>
      </div>

      {jobs
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((job) => (
          <JobCard key={job.id} job={job} onStop={onStopJob} />
        ))}
    </div>
  );
}

function JobCard({ job, onStop }: { job: Job; onStop?: (jobId: string) => Promise<void> }) {
  const [isStopping, setIsStopping] = useState(false);
  
  const statusColors = {
    pending: 'bg-gray-500',
    running: 'bg-orange-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    cancelled: 'bg-gray-400'
  };

  const statusIcons = {
    pending: Clock,
    running: TrendingUp,
    completed: CheckCircle,
    failed: XCircle,
    cancelled: X
  };

  const StatusIcon = statusIcons[job.status];

  const handleStop = async () => {
    if (!onStop) return;
    
    setIsStopping(true);
    try {
      await onStop(job.id);
    } catch (error) {
      console.error('Failed to stop job:', error);
    } finally {
      setIsStopping(false);
    }
  };

  const calculateDuration = () => {
    if (!job.started_at) return null;
    const endTime = job.completed_at ? new Date(job.completed_at) : new Date();
    const startTime = new Date(job.started_at);
    const durationMs = endTime.getTime() - startTime.getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const duration = calculateDuration();

  return (
    <div className="bg-[var(--card-bg)] rounded-xl p-4 border border-[var(--border)] hover:border-[var(--accent-primary)] transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[job.status]}`} />
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase">
            {job.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon size={16} className="text-[var(--text-muted)]" />
          {job.status === 'running' && onStop && (
            <button
              onClick={handleStop}
              disabled={isStopping}
              className="ml-2 p-1 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
              title="Stop job"
            >
              <StopCircle size={16} className="text-red-400" />
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-[var(--foreground)] mb-2 line-clamp-2">
        {job.question}
      </p>

      <div className="mb-3 space-y-2">
        {job.models && job.models.length > 0 && (
          <div className="flex flex-col text-xs">
            <span className="text-[var(--text-secondary)] mb-1">Models:</span>
            <div className="flex flex-wrap gap-1">
              {job.models.map((model, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                  {model}
                </span>
              ))}
            </div>
          </div>
        )}
        {job.model_name && !job.models?.length && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">model name</span>
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded">{job.model_name}</span>
          </div>
        )}
        {job.type === 'query-models' && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">query-models</span>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded">{job.type}</span>
          </div>
        )}
      </div>

      {job.progress > 0 && job.status === 'running' && (
        <div className="mb-2">
          <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">{job.progress}%</p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{new Date(job.created_at).toLocaleString()}</span>
          {duration && (
            <span className="px-2 py-0.5 bg-[var(--border)] rounded flex items-center gap-1">
              <Clock size={12} />
              {duration}
            </span>
          )}
        </div>
      </div>

      {job.error && (
        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
          {job.error}
        </div>
      )}
    </div>
  );
}
