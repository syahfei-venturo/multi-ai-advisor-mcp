'use client';

import {
  Compass,
  Zap,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  GitBranch,
  ArrowRight
} from 'lucide-react';

interface CapabilityCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  bgColor: string;
  type: 'dark' | 'light';
}

interface ExampleCard {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export function WelcomeScreen() {
  const capabilities: CapabilityCard[] = [
    {
      icon: <Compass size={24} />,
      title: 'Explore',
      description: 'Learn how to use multi-AI advisor for your needs',
      bgColor: 'bg-zinc-900',
      type: 'dark'
    },
    {
      icon: <Zap size={24} />,
      title: 'Capabilities',
      description: 'How much capable advisors to fulfill your needs',
      bgColor: 'bg-zinc-900',
      type: 'dark'
    },
    {
      icon: <AlertTriangle size={24} />,
      title: 'Limitation',
      description: 'How much capable AI advisors to fulfill your needs',
      bgColor: 'bg-zinc-900',
      type: 'dark'
    }
  ];

  const examples: ExampleCard[] = [
    {
      icon: <Lightbulb className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-rose-400 p-2" />,
      title: '"Explain"',
      description: 'Quantum computing in simple terms'
    },
    {
      icon: <MessageSquare className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 p-2" />,
      title: '"How to"',
      description: 'Make a search engine platform like google'
    },
    {
      icon: <GitBranch className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 p-2" />,
      title: '"Remember"',
      description: 'Quantum computing in simple terms'
    },
    {
      icon: <MessageSquare className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 p-2" />,
      title: '"Allows"',
      description: 'User to provide follow-up corrections'
    },
    {
      icon: <Lightbulb className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-emerald-400 p-2" />,
      title: '"May"',
      description: 'Occasionally generate incorrect information'
    },
    {
      icon: <AlertTriangle className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-400 p-2" />,
      title: '"Limited"',
      description: 'Knowledge of world and events after 2021'
    }
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 sm:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-3 tracking-tight">
          CHAT A.I+
        </h1>
        <p className="text-xl sm:text-3xl text-[var(--foreground)] font-medium px-4">
          Good day! How may I assist you today?
        </p>
      </div>

      {/* Capability Cards - Top Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8 w-full max-w-4xl">
        {capabilities.map((capability, index) => (
          <div
            key={index}
            className={`${capability.bgColor} rounded-2xl p-6 border border-[var(--border)] hover:border-[var(--accent-primary)] transition-all cursor-pointer group`}
          >
            <div className="text-white mb-3 group-hover:scale-110 transition-transform">
              {capability.icon}
            </div>
            <h3 className="text-white text-lg font-semibold mb-2">
              {capability.title}
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              {capability.description}
            </p>
          </div>
        ))}
      </div>

      {/* Example Cards - Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 w-full max-w-4xl">
        {examples.map((example, index) => (
          <div
            key={index}
            className="bg-[var(--card-bg)] rounded-2xl p-5 border border-[var(--border)] hover:border-[var(--accent-primary)] transition-all cursor-pointer group flex items-center gap-4"
          >
            <div className="flex-shrink-0">
              {example.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {example.title}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] truncate">
                {example.description}
              </p>
            </div>
            <ArrowRight
              size={20}
              className="text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] group-hover:translate-x-1 transition-all flex-shrink-0"
            />
          </div>
        ))}
      </div>

      {/* Additional Info */}
      <div className="mt-12 text-center text-sm text-[var(--text-muted)]">
        <p>Powered by Multi-AI Advisor with multiple model perspectives</p>
      </div>
    </div>
  );
}
