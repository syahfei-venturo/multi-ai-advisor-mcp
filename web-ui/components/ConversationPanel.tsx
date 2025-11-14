'use client';

import { useEffect, useRef } from 'react';
import type { ConversationMessage } from '@/types';
import { formatDistanceToNow } from '@/lib/utils';

interface ConversationPanelProps {
  messages: ConversationMessage[];
  sessionId: string | null;
  onClear: () => void;
  onRefresh: () => void;
}

export function ConversationPanel({
  messages,
  sessionId,
  onClear,
  onRefresh,
}: ConversationPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="bg-slate-800 rounded-lg shadow-lg flex flex-col h-full">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-700/50">
        <h2 className="text-lg font-semibold text-white">Conversation History</h2>
        <div className="flex gap-2">
          <button
            onClick={onClear}
            disabled={!sessionId || messages.length === 0}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Clear
          </button>
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-slate-600 rounded-lg transition-colors"
            title="Refresh"
          >
            🔄
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto p-6">
        {!sessionId ? (
          <p className="text-center text-slate-400 py-8">
            Select a session to view conversation history
          </p>
        ) : messages.length === 0 ? (
          <p className="text-center text-slate-400 py-8">
            No messages in this conversation
          </p>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="animate-fade-in"
                style={{
                  animation: 'fadeIn 0.3s ease-in',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-green-600 text-white'
                    }`}
                  >
                    {msg.role}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDistanceToNow(msg.created_at)}
                  </span>
                </div>
                <div className="bg-slate-700 p-4 rounded-lg border-l-4 border-blue-500">
                  <pre className="whitespace-pre-wrap break-words font-sans text-slate-200">
                    {msg.content}
                  </pre>
                  {msg.thinking_text && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
                        💭 Thinking Process
                      </summary>
                      <pre className="mt-2 text-slate-400 whitespace-pre-wrap">
                        {msg.thinking_text}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
