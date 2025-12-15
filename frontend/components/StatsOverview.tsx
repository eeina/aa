import React from 'react';
import { List, AlertCircle, CheckCircle } from 'lucide-react';
import { StatBox } from './StatBox';

interface StatsOverviewProps {
  stats: {
    totalUrls: number;
    pending: number;
    copied: number;
  };
}

export const StatsOverview = ({ stats }: StatsOverviewProps) => {
  return (
    <div className="grid grid-cols-1 gap-3">
      <StatBox label="Total URLs" value={stats.totalUrls} color="#4f46e5" icon={List} />
      <StatBox label="Pending" value={stats.pending} color="#f59e0b" icon={AlertCircle} />
      <StatBox label="Done" value={stats.copied} color="#10b981" icon={CheckCircle} />
    </div>
  );
};