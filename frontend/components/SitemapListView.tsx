import React, { useState } from 'react';
import { 
  FileCode, ExternalLink, Copy, Trash2, PieChart, ClipboardList, CheckCircle2, ListPlus, Sparkles
} from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { SitemapFileItem } from '../types';

interface SitemapListViewProps {
  sitemaps: SitemapFileItem[];
  onCopy: (text: string) => void;
  onCopyUrls: (id: string) => void;
  onCopyNextBatch: (sitemapUrl: string, amount: number) => void;
  onCopyPending: (sitemapUrl: string) => void;
  onDelete: (id: string) => void;
  onProcessQuality: (sitemapUrl: string, limit: number) => void;
}

const SitemapRow = ({ 
  item, idx, onCopy, onCopyUrls, onCopyNextBatch, onCopyPending, onDelete, onProcessQuality 
}: any) => {
  const [batchSize, setBatchSize] = useState(10);
  const hasPending = item.stats && item.stats.pending > 0;

  return (
    <div className="flex flex-col xl:flex-row xl:items-center px-4 py-4 border-b border-gray-50 gap-4 hover:bg-gray-50 bg-white transition-colors">
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="text-xs text-gray-400 w-6 pt-1 font-mono shrink-0">{idx + 1}</div>
        <div className="flex-1 min-w-0">
          <a 
            href={item.url} target="_blank" rel="noreferrer" 
            className="text-indigo-700 hover:text-indigo-900 text-sm font-mono truncate flex items-center gap-2"
            title={item.url}
          >
            {item.url} <ExternalLink size={10} className="text-gray-400" />
          </a>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
             {item.stats && (
               <div className="flex items-center gap-2 text-xs">
                 <span className={`font-semibold ${item.stats.pending > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                   {item.stats.pending} Pending
                 </span>
                 <span className="text-gray-300">/</span>
                 <span className="text-gray-500">{item.stats.total} Total</span>
               </div>
             )}
             <span className="text-gray-300 hidden xl:inline">|</span>
             <span className="text-[10px] text-gray-400">Found: {new Date(item.foundAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-2 self-end xl:self-center pl-10 xl:pl-0">
        <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
          <input 
            type="number" 
            min="1" 
            max="100" 
            value={batchSize}
            onChange={(e) => setBatchSize(parseInt(e.target.value) || 10)}
            className="w-10 text-center text-xs p-1 h-8 rounded border border-gray-300 focus:outline-none focus:border-indigo-500"
            title="Batch Size"
          />
          <Button 
            variant="secondary" onClick={() => onProcessQuality(item.url, batchSize)} 
            className="!p-1.5 !h-8 text-[10px] px-2" disabled={!hasPending}
            title={`Check Quality of next ${batchSize} URLs and Copy Passing`}
          >
            <Sparkles size={14} className="mr-1" /> Quality Copy
          </Button>
           <Button 
              variant="primary" onClick={() => onCopyNextBatch(item.url, batchSize)} 
              className="!p-1.5 !h-8 text-[10px] px-2" disabled={!hasPending}
              title={`Copy Next ${batchSize} Pending URLs`}
            >
              <ListPlus size={14} className="mr-1" /> Quick Copy
            </Button>
        </div>

        <div className="w-px h-6 bg-gray-200 mx-1 hidden xl:block"></div>
        <div className="flex gap-1">
           <Button variant="ghost" onClick={() => onCopyPending(item.url)} className="!p-2 text-gray-400 hover:text-green-600" title="Copy ALL Pending">
             <CheckCircle2 size={16} />
           </Button>
           <Button variant="ghost" onClick={() => onCopyUrls(item._id)} className="!p-2 text-gray-400 hover:text-indigo-600" title="Copy ALL URLs (Text)">
            <ClipboardList size={16} />
          </Button>
          <Button variant="ghost" onClick={() => onDelete(item._id)} className="!p-2 text-gray-400 hover:text-red-600" title="Delete Sitemap Entry">
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export const SitemapListView = ({ sitemaps, onCopy, onCopyUrls, onCopyNextBatch, onCopyPending, onDelete, onProcessQuality }: SitemapListViewProps & { onProcessQuality: any }) => {
  return (
    <Card title="Managed Sitemaps (XML)" icon={FileCode} className="h-full">
      <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
         Showing {sitemaps.length} sitemap file{sitemaps.length !== 1 ? 's' : ''}
      </div>
      {sitemaps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-4">
          <PieChart size={48} />
          <p>No sitemaps extracted yet.</p>
        </div>
      ) : (
        <div className="flex flex-col h-[500px] overflow-y-auto custom-scrollbar">
          {sitemaps.map((item, idx) => (
            <SitemapRow 
              key={item._id} item={item} idx={idx}
              onCopy={onCopy} onCopyUrls={onCopyUrls}
              onCopyNextBatch={onCopyNextBatch} onCopyPending={onCopyPending}
              onDelete={onDelete} onProcessQuality={onProcessQuality}
            />
          ))}
        </div>
      )}
    </Card>
  );
};