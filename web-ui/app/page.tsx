'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChatSidebar } from '@/components/ChatSidebar';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { ChatInterface } from '@/components/ChatInterface';
import { SystemMonitor } from '@/components/SystemMonitor';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useWebSocket } from '@/lib/useWebSocket';
import { api } from '@/lib/api';
import type { Session, ConversationMessage, Stats, Job } from '@/types';

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.getSessions();
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }, []);

  const loadConversations = useCallback(async (sessionId: string) => {
    try {
      const data = await api.getConversations(sessionId);
      setConversations(data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const data = await api.getJobs();
      setJobs(data);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    loadConversations(sessionId);
  }, [loadConversations]);

  const handleNewChat = useCallback(() => {
    setSelectedSessionId(null);
    setConversations([]);
  }, []);

  const handleClearAll = useCallback(async () => {
    try {
      await api.clearAllConversations();
      setSessions([]);
      setSelectedSessionId(null);
      setConversations([]);
      setShowClearAllDialog(false);
      loadSessions();
      loadStats();
    } catch (error) {
      console.error('Failed to clear all conversations:', error);
    }
  }, [loadSessions, loadStats]);

  const handleClearAllClick = useCallback(() => {
    setShowClearAllDialog(true);
  }, []);

  const handleStopJob = useCallback(async (jobId: string) => {
    try {
      await api.stopJob(jobId);
      // Reload jobs to reflect the cancellation
      loadJobs();
      loadStats();
      // Reload conversations if we're viewing the affected session
      if (selectedSessionId) {
        loadConversations(selectedSessionId);
      }
    } catch (error) {
      console.error('Failed to stop job:', error);
    }
  }, [selectedSessionId, loadJobs, loadStats, loadConversations]);

  const handleSendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;

    setIsLoading(true);
    try {
      // Create a new session if none selected
      const sessionId = selectedSessionId || `session-${Date.now()}`;

      // Add user message to conversations
      const userMessage: ConversationMessage = {
        id: Date.now(),
        session_id: sessionId,
        message_index: conversations.length,
        role: 'user',
        content: message,
        created_at: new Date().toISOString()
      };

      setConversations(prev => [...prev, userMessage]);

      // Send message to backend API
      try {
        const result = await api.sendMessage(sessionId, message);
        console.log('Message sent, job ID:', result.jobId);
      } catch (error) {
        console.error('Failed to send message:', error);
        setIsLoading(false);
        // Don't continue - let user know it failed
        return;
      }

      // Update selected session if new
      if (!selectedSessionId) {
        setSelectedSessionId(sessionId);
      }

      // Reload sessions to update the list
      loadSessions();
      
      // Keep loading state true - it will be reset by WebSocket message when job completes
      // or by onJobCompleted callback
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsLoading(false);
    }
  }, [selectedSessionId, conversations.length, loadSessions]);

  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      console.log('WebSocket message:', message);

      switch (message.type) {
        case 'conversation_updated':
          console.log('Conversation updated for session:', message.sessionId);

          // Always reload sessions to update the list
          loadSessions();

          // Reload conversations if this is the currently selected session
          if (message.sessionId === selectedSessionId) {
            console.log('Reloading conversations for selected session');
            loadConversations(message.sessionId);
          } else {
            console.log('Session not selected, only reloading sessions list');
          }

          // Reload stats
          loadStats();
          break;

        case 'conversation_cleared':
          console.log('Conversation cleared for session:', message.sessionId);
          if (message.sessionId === selectedSessionId) {
            setConversations([]);
          }
          loadSessions();
          break;

        case 'job_updated':
        case 'job_cancelled':
          console.log('Job updated:', message.jobId, message.status);
          loadJobs();
          loadStats();
          
          // Clear loading state when job completes
          if (message.status === 'completed' || message.status === 'failed' || message.status === 'cancelled') {
            setIsLoading(false);
          }
          break;
      }
    },
    onConnected: () => {
      console.log('WebSocket connected');
    },
    onDisconnected: () => {
      console.log('WebSocket disconnected');
    },
  });

  // Initial load
  useEffect(() => {
    loadSessions();
    loadStats();
    loadJobs();
  }, [loadSessions, loadStats, loadJobs]);

  // Auto-refresh stats and jobs every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
      loadJobs();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadStats, loadJobs]);

  // Convert sessions to chat sessions format
  const chatSessions = sessions.map(session => {
    // Create a descriptive title from first message or session ID
    let title = 'New conversation';
    if (session.first_message) {
      // Use first 50 chars of first message as title
      title = session.first_message.substring(0, 50);
      if (session.first_message.length > 50) {
        title += '...';
      }
    } else if (session.session_id.startsWith('session_')) {
      title = 'New conversation';
    } else {
      // Use session ID if it's not auto-generated
      title = session.session_id.substring(0, 30);
    }

    return {
      id: session.session_id,
      title,
      timestamp: new Date(session.last_updated),
      isActive: session.session_id === selectedSessionId
    };
  });

  // Convert conversations to messages format
  const messages = conversations.map((conv, index) => ({
    id: `msg-${conv.id || index}`,
    role: conv.role as 'user' | 'assistant' | 'system',
    content: conv.content,
    model: conv.model_name,
    timestamp: new Date(conv.created_at)
  }));

  // Filter jobs by current session
  const sessionJobs = selectedSessionId 
    ? jobs.filter(job => job.session_id === selectedSessionId) 
    : [];

  // Check if there are any running jobs for current session
  const hasRunningJobs = sessionJobs.some(job => job.status === 'running');

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <>
      <ConfirmDialog
        isOpen={showClearAllDialog}
        title="Clear All Conversations"
        message="Are you sure you want to clear all conversations? This action cannot be undone and all conversation history will be permanently deleted."
        confirmText="Clear All"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={handleClearAll}
        onCancel={() => setShowClearAllDialog(false)}
      />

      <div className="flex h-screen bg-[var(--background)] overflow-hidden">
      {/* Mobile Sidebar Toggle */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--accent-primary)] transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`w-80 flex-shrink-0 fixed lg:relative z-40 h-full transition-transform duration-300 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <ChatSidebar
          sessions={chatSessions}
          onNewChat={() => {
            handleNewChat();
            setIsSidebarOpen(false);
          }}
          onSelectSession={(id) => {
            handleSelectSession(id);
            setIsSidebarOpen(false);
          }}
          onClearAll={handleClearAllClick}
          activeSessionId={selectedSessionId || undefined}
          jobs={jobs}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        {selectedSessionId && conversations.length > 0 ? (
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            isJobRunning={hasRunningJobs}
          />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <WelcomeScreen />
            <div className="border-t border-[var(--border)] p-6">
              <form onSubmit={(e) => {
                e.preventDefault();
                const input = (e.target as HTMLFormElement).querySelector('textarea');
                if (input) {
                  handleSendMessage(input.value);
                  input.value = '';
                }
              }} className="max-w-4xl mx-auto">
                <div className="relative bg-[var(--card-bg)] rounded-3xl border border-[var(--border)] focus-within:border-[var(--accent-primary)] transition-colors">
                  <div className="flex items-center gap-3 px-5 py-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-rose-400 flex items-center justify-center flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>
                    </div>
                    <textarea
                      placeholder="What's in your mind?..."
                      className="flex-1 bg-transparent border-none outline-none resize-none text-[var(--foreground)] placeholder:text-[var(--text-muted)] text-base max-h-[200px]"
                      rows={1}
                      disabled={isLoading}
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-11 h-11 rounded-full gradient-button flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)] text-center mt-3">
                  AI can make mistakes. Consider checking important information.
                </p>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* System Monitor Floating Button */}
      <SystemMonitor
        stats={stats}
        jobs={jobs}
        isConnected={isConnected}
        onRefreshJobs={loadJobs}
        onStopJob={handleStopJob}
      />
    </div>
    </>
  );
}
