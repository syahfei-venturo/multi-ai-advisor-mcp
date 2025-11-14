import type { Stats } from '@/types';

interface StatsCardsProps {
  stats: Stats | null;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      icon: '📊',
      label: 'Total Jobs',
      value: stats?.totalJobs ?? 0,
      color: 'from-blue-500 to-blue-600',
    },
    {
      icon: '✅',
      label: 'Completed',
      value: stats?.completedJobs ?? 0,
      color: 'from-green-500 to-green-600',
    },
    {
      icon: '🔄',
      label: 'Running',
      value: stats?.runningJobs ?? 0,
      color: 'from-yellow-500 to-yellow-600',
    },
    {
      icon: '💬',
      label: 'Conversations',
      value: stats?.totalConversations ?? 0,
      color: 'from-purple-500 to-purple-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-slate-800 rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow"
        >
          <div className="flex items-center gap-4">
            <div className={`bg-gradient-to-br ${card.color} p-3 rounded-lg text-3xl`}>
              {card.icon}
            </div>
            <div>
              <h3 className="text-3xl font-bold text-white">{card.value}</h3>
              <p className="text-slate-400 text-sm">{card.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
