import React from 'react';
import { Copy, ClipboardList, FileText } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

interface ActionPanelProps {
  loading: boolean;
  stats: { totalUrls: number; pending: number; copied: number };
  filterStatus: string;
  searchTerm: string;
  onCopyNextBatch: (amount: number) => void;
  onCopyAllPending: () => void;
  onCopyPagePending: () => void;
  onShowRaw: () => void;
  pageHasPending: boolean;
}

export const ActionPanel = ({
  loading,
  stats,
  filterStatus,
  searchTerm,
  onCopyNextBatch,
  onCopyAllPending,
  onCopyPagePending,
  onShowRaw,
  pageHasPending
}: ActionPanelProps) => {
  const progressPercent = stats.totalUrls > 0 ? Math.round((stats.copied / stats.totalUrls) * 100) : 0;

  return (
    <Card title="Quick Actions" icon={Copy}>
      <div className="flex flex-col gap-3">
        <Button 
          variant="primary" 
          onClick={() => onCopyNextBatch(10)} 
          disabled={loading || (filterStatus === 'copied')} 
          fullWidth 
          icon={ClipboardList}
        >
          Copy Next 10 Pending {searchTerm ? '(Filtered)' : ''}
        </Button>

        <Button 
          variant="success" 
          onClick={onCopyAllPending} 
          disabled={loading || (filterStatus === 'copied')} 
          fullWidth 
          icon={Copy}
        >
          {loading ? 'Processing...' : `Copy All Pending ${searchTerm ? '(Filtered)' : ''}`}
        </Button>
        
        <Button 
          variant="secondary" 
          onClick={onCopyPagePending} 
          disabled={!pageHasPending} 
          fullWidth 
          icon={Copy}
        >
          Copy This Page
        </Button>

        <Button 
          variant="outline" 
          onClick={onShowRaw} 
          fullWidth 
          icon={FileText}
        >
          View Page Raw List
        </Button>

        <div className="mt-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5 font-medium">
            <span>Progress (Total DB)</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500 ease-out" 
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      </div>
    </Card>
  );
};