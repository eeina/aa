import React from 'react';
import { List, AlertCircle, CheckCircle, HelpCircle, XCircle } from 'lucide-react';
import { StatBox } from './StatBox';

interface StatsOverviewProps {
  stats: {
    totalUrls: number;
    unchecked: number;
    pending: number;
    rejected: number;
    copied: number;
  };
}

export const StatsOverview = ({ stats }: StatsOverviewProps) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
       <div className="col-span-2 lg:col-span-1">
        <StatBox label="Total DB" value={stats.totalUrls} color="#6366f1" icon={List} />
      </div>
      <StatBox label="Unchecked" value={stats.unchecked} color="#94a3b8" icon={HelpCircle} />
      <StatBox label="Pending (Ready)" value={stats.pending} color="#f59e0b" icon={AlertCircle} />
      <StatBox label="Rejected" value={stats.rejected} color="#ef4444" icon={XCircle} />
      <div className="col-span-2 lg:col-span-1">
        <StatBox label="Copied / Done" value={stats.copied} color="#10b981" icon={CheckCircle} />
      </div>
    </div>
  );
};