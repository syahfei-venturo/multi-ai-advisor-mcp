interface ConnectionStatusProps {
  isConnected: boolean;
}

export function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-700 rounded-full">
      <span
        className={`w-2.5 h-2.5 rounded-full ${
          isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      <span className="text-sm text-slate-200">
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}
