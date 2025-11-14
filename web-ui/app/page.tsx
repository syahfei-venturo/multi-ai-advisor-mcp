'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatsCards } from '@/components/StatsCards';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { SessionsList } from '@/components/SessionsList';
import { ConversationPanel } from '@/components/ConversationPanel';
import { JobsList } from '@/components/JobsList';
import { useWebSocket } from '@/lib/useWebSocket';
import { api } from '@/lib/api';
import type { Stats, Session, ConversationMessage, Job } from '@/types';

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMessage[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);

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

  const handleClearConversation = useCallback(async () => {
    if (!selectedSessionId) return;

    if (!confirm('Are you sure you want to clear this conversation?')) {
      return;
    }

    try {
      await api.clearConversation(selectedSessionId);
      setConversations([]);
      loadSessions();
      loadStats();
    } catch (error) {
      console.error('Failed to clear conversation:', error);
    }
  }, [selectedSessionId, loadSessions, loadStats]);

  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      console.log('WebSocket message:', message);

      switch (message.type) {
        case 'conversation_updated':
          if (message.sessionId === selectedSessionId) {
            loadConversations(message.sessionId);
          }
          loadSessions();
          loadStats();
          break;

        case 'conversation_cleared':
          if (message.sessionId === selectedSessionId) {
            setConversations([]);
          }
          loadSessions();
          break;

        case 'job_updated':
        case 'job_cancelled':
          loadJobs();
          loadStats();
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
    loadStats();
    loadSessions();
    loadJobs();
  }, [loadStats, loadSessions, loadJobs]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
      loadJobs();
      if (selectedSessionId) {
        loadConversations(selectedSessionId);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [loadStats, loadJobs, loadConversations, selectedSessionId]);

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <header className="bg-slate-800 rounded-lg shadow-lg p-6 mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            🤖 Multi-AI Advisor Dashboard
          </h1>
          <ConnectionStatus isConnected={isConnected} />
        </header>

        {/* Stats Cards */}
        <StatsCards stats={stats} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-350px)]">
          {/* Sessions Panel */}
          <div className="lg:col-span-3">
            <SessionsList
              sessions={sessions}
              selectedSessionId={selectedSessionId}
              onSelectSession={handleSelectSession}
              onRefresh={loadSessions}
            />
          </div>

          {/* Conversations Panel */}
          <div className="lg:col-span-5">
            <ConversationPanel
              messages={conversations}
              sessionId={selectedSessionId}
              onClear={handleClearConversation}
              onRefresh={() => selectedSessionId && loadConversations(selectedSessionId)}
            />
          </div>

          {/* Jobs Panel */}
          <div className="lg:col-span-4">
            <JobsList jobs={jobs} onRefresh={loadJobs} />
          </div>
        </div>
      </div>
    </div>
  );
}
