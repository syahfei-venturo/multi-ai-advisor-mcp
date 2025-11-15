'use client';

import { useState } from 'react';
import { Search, Plus, MessageCircle, Settings, User } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
  isActive?: boolean;
}

interface ChatSidebarProps {
  sessions?: ChatSession[];
  onNewChat?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onClearAll?: () => void;
  activeSessionId?: string;
}

export function ChatSidebar({
  sessions = [],
  onNewChat,
  onSelectSession,
  onClearAll,
  activeSessionId
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group sessions
  const today: ChatSession[] = [];
  const last7Days: ChatSession[] = [];
  const older: ChatSession[] = [];

  const now = new Date();
  filteredSessions.forEach(session => {
    // Calculate days difference using local time
    const sessionDate = new Date(session.timestamp);
    const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessionLocal = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

    const diffTime = nowLocal.getTime() - sessionLocal.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      today.push(session);
    } else if (diffDays > 0 && diffDays <= 7) {
      last7Days.push(session);
    } else {
      older.push(session);
    }
  });

  return (
    <div className="h-screen flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--border)] transition-transform">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <h1 className="text-xl font-bold tracking-tight mb-4">CHAT A.I+</h1>

        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className="w-full gradient-button text-white font-medium px-4 py-3 rounded-xl flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-500/20 transition-all"
        >
          <Plus size={18} />
          New chat
        </button>

        {/* Search Button */}
        {/* <button className="mt-3 w-12 h-12 bg-[var(--card-bg)] hover:bg-[var(--border)] rounded-full flex items-center justify-center transition-colors mx-auto">
          <Search size={18} className="text-[var(--text-secondary)]" />
        </button> */}
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between mb-3 px-3">
          <span className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider">
            Your conversations
          </span>
          <button 
            onClick={onClearAll}
            className="text-xs text-[var(--accent-primary)] hover:text-[var(--accent-hover)] font-medium"
          >
            Clear All
          </button>
        </div>

        {/* Today's conversations */}
        {today.length > 0 && (
          <div className="mb-6">
            {today.map((session) => (
              <ConversationItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onClick={() => onSelectSession?.(session.id)}
              />
            ))}
          </div>
        )}

        {/* Last 7 Days */}
        {last7Days.length > 0 && (
          <div className="mb-6">
            <div className="text-xs text-[var(--text-muted)] font-medium mb-2 px-3">
              Last 7 Days
            </div>
            {last7Days.map((session) => (
              <ConversationItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onClick={() => onSelectSession?.(session.id)}
              />
            ))}
          </div>
        )}

        {/* Older */}
        {older.length > 0 && (
          <div>
            <div className="text-xs text-[var(--text-muted)] font-medium mb-2 px-3">
              Older
            </div>
            {older.map((session) => (
              <ConversationItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onClick={() => onSelectSession?.(session.id)}
              />
            ))}
          </div>
        )}

        {filteredSessions.length === 0 && (
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">
            No conversations yet
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border)] space-y-2">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--card-bg)] transition-colors text-[var(--text-secondary)]">
          <Settings size={18} />
          <span className="text-sm font-medium">Settings</span>
        </button>

        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--card-bg)] transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <User size={16} className="text-white" />
          </div>
          <span className="text-sm font-medium text-[var(--foreground)]">User Account</span>
        </button>
      </div>
    </div>
  );
}

interface ConversationItemProps {
  session: ChatSession;
  isActive?: boolean;
  onClick?: () => void;
}

function ConversationItem({ session, isActive, onClick }: ConversationItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors mb-1 text-left ${
        isActive
          ? 'bg-[var(--card-bg)] text-[var(--foreground)]'
          : 'hover:bg-[var(--card-bg)] text-[var(--text-secondary)]'
      }`}
    >
      <MessageCircle size={16} className="flex-shrink-0" />
      <span className="text-sm font-medium truncate flex-1">{session.title}</span>
    </button>
  );
}
