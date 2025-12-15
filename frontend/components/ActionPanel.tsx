import React from 'react';
import { Copy, ClipboardList, Trash2, FileText, ScanSearch } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

interface ActionPanelProps {
  loading: boolean;
  scanLoading: boolean;
  stats: { totalUrls: number; unchecked: number; pending: number; copied: number };
  filterStatus: string;
  searchTerm: string;
  onCopyNextBatch: (amount: number) => void;
  onCopyAllPending: () => void;
  onCopyPagePending: () => void;
  onShowRaw: () => void;
  onClearDatabase: () => void;
  onRunScan: () => void;
  pageHasPending: boolean;
}

export const ActionPanel = ({
  loading,
  scanLoading,
  stats,
  filterStatus,
  searchTerm,
  onCopyNextBatch,
  onCopyAllPending,
  onCopyPagePending,
  onShowRaw,
  onClearDatabase,
  onRunScan,
  pageHasPending
}: ActionPanelProps) => {
  const progressPercent = stats.totalUrls > 0 ? Math.round((stats.copied / stats.totalUrls) * 100) : 0;

  return (
    <>
      {stats.unchecked > 0 && (
        <Card title="2. Quality Check" icon={ScanSearch} className="border-indigo-100 bg-indigo-50/50">
          <p className="text-xs text-indigo-700 mb-3">
            {stats.unchecked} URLs are waiting to be scanned for content quality (Rating &ge; 4.0, Reviews &ge; 50).
          </p>
          <Button 
            variant="primary" 
            onClick={onRunScan} 
            disabled={scanLoading} 
            fullWidth 
            icon={ScanSearch}
            className="!bg-indigo-600 hover:!bg-indigo-700"
          >
            {scanLoading ? 'Scanning (Please wait)...' : 'Scan Unchecked URLs'}
          </Button>
        </Card>
      )}

      <Card title="3. Actions" icon={Copy}>
        <div className="flex flex-col gap-3">
          <Button 
            variant="secondary" 
            onClick={() => onCopyNextBatch(10)} 
            disabled={loading || filterStatus === 'copied' || filterStatus === 'rejected'} 
            fullWidth 
            icon={ClipboardList}
          >
            Copy Next 10 Pending
          </Button>

          <Button 
            variant="success" 
            onClick={onCopyAllPending} 
            disabled={loading || filterStatus === 'copied' || filterStatus === 'rejected'} 
            fullWidth 
            icon={Copy}
          >
            Copy All Pending
          </Button>
          
          <Button 
            variant="outline" 
            onClick={onCopyPagePending} 
            disabled={!pageHasPending} 
            fullWidth 
            icon={Copy}
          >
            Copy This Page
          </Button>

          <Button 
            variant="ghost" 
            onClick={onShowRaw} 
            fullWidth 
            icon={FileText}
          >
            View Page Raw List
          </Button>

          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5 font-medium">
              <span>Overall Completion</span>
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

      <Card title="Management" icon={Trash2}>
         <Button variant="danger" onClick={onClearDatabase} fullWidth icon={Trash2}>
            Clear Full Database
         </Button>
      </Card>
    </>
  );
};