import type { Job } from '@/types';
import { formatDistanceToNow, truncateText } from '@/lib/utils';

interface JobsListProps {
  jobs: Job[];
  onRefresh: () => void;
}

export function JobsList({ jobs, onRefresh }: JobsListProps) {
  const getStatusColor = (status: Job['status']) => {
    switch (status) {
      case 'completed':
        return 'border-green-500 bg-green-500/10';
      case 'failed':
        return 'border-red-500 bg-red-500/10';
      case 'running':
        return 'border-yellow-500 bg-yellow-500/10';
      case 'pending':
        return 'border-blue-500 bg-blue-500/10';
      case 'cancelled':
        return 'border-gray-500 bg-gray-500/10';
      default:
        return 'border-slate-500 bg-slate-500/10';
    }
  };

  const getStatusBadgeColor = (status: Job['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-600';
      case 'failed':
        return 'bg-red-600';
      case 'running':
        return 'bg-yellow-600';
      case 'pending':
        return 'bg-blue-600';
      case 'cancelled':
        return 'bg-gray-600';
      default:
        return 'bg-slate-600';
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg shadow-lg flex flex-col h-full">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-700/50">
        <h2 className="text-lg font-semibold text-white">Jobs</h2>
        <button
          onClick={onRefresh}
          className="p-2 hover:bg-slate-600 rounded-lg transition-colors"
          title="Refresh"
        >
          🔄
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {jobs.length === 0 ? (
          <p className="text-center text-slate-400 py-8 text-sm">No jobs found</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const results = job.results ? JSON.parse(job.results) : null;
              const resultCount = results?.results?.length || 0;

              return (
                <div
                  key={job.id}
                  className={`p-4 rounded-lg border-l-4 transition-all hover:shadow-md ${getStatusColor(
                    job.status
                  )}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <code className="text-xs text-slate-400 font-mono">
                      {truncateText(job.id, 12)}
                    </code>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold text-white uppercase ${getStatusBadgeColor(
                        job.status
                      )}`}
                    >
                      {job.status}
                    </span>
                  </div>

                  <p className="text-sm text-slate-200 mb-2 line-clamp-2">
                    {job.question}
                  </p>

                  {resultCount > 0 && (
                    <div className="text-xs text-slate-400 py-2 px-3 bg-slate-700/50 rounded border-t border-slate-600">
                      {resultCount} model response(s)
                    </div>
                  )}

                  <div className="text-xs text-slate-500 mt-2 space-y-1">
                    <div>Created: {formatDistanceToNow(job.created_at)}</div>
                    {job.completed_at && (
                      <div>Completed: {formatDistanceToNow(job.completed_at)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
