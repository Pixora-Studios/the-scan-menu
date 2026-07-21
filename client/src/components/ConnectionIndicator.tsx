import React from 'react';
import { ConnectionStatus } from '../hooks/useSocket';

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
}

export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({ status }) => {
  const statusColors = {
    connected: 'bg-emerald-500',
    connecting: 'bg-amber-500 animate-pulse',
    disconnected: 'bg-red-500',
  };

  const statusLabels = {
    connected: 'Live',
    connecting: 'Reconnecting...',
    disconnected: 'Offline',
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-full shadow-sm border border-slate-150 text-[10px] font-bold text-slate-500 shrink-0 font-mono">
      <span className={`w-1.5 h-1.5 rounded-full ${statusColors[status]}`} />
      <span>{statusLabels[status]}</span>
    </div>
  );
};

export default ConnectionIndicator;
