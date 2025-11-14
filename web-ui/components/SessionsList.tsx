import type { Session } from '@/types';
import { formatDistanceToNow } from '@/lib/utils';

interface SessionsListProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onRefresh: () => void;
}

export function SessionsList({
  sessions,
  selectedSessionId,
  onSelectSession,
  onRefresh,
}: SessionsListProps) {
  return (
    <div className="bg-slate-800 rounded-lg shadow-lg flex flex-col h-full">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-700/50">
        <h2 className="text-lg font-semibold text-white">Sessions</h2>
        <button
          onClick={onRefresh}
          className="p-2 hover:bg-slate-600 rounded-lg transition-colors"
          title="Refresh"
        >
          🔄
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {sessions.length === 0 ? (
          <p className="text-center text-slate-400 py-8 text-sm">No sessions found</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <button
                key={session.session_id}
                onClick={() => onSelectSession(session.session_id)}
                className={`w-full text-left p-3 rounded-lg transition-all ${
                  selectedSessionId === session.session_id
                    ? 'bg-blue-600 border-2 border-blue-400'
                    : 'bg-slate-700 hover:bg-slate-600 border-2 border-transparent'
                }`}
              >
                <div className="text-sm font-medium text-white truncate mb-1">
                  {session.session_id.substring(0, 20)}...
                </div>
                <div className="text-xs text-slate-300">
                  {formatDistanceToNow(session.last_updated)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
