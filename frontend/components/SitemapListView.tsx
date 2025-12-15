import React from 'react';
import { 
  FileCode, 
  ExternalLink, 
  Copy, 
  Trash2,
  PieChart,
  ClipboardList,
  CheckCircle2,
  ListPlus
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
}

export const SitemapListView = ({ 
  sitemaps, 
  onCopy, 
  onCopyUrls, 
  onCopyNextBatch,
  onCopyPending,
  onDelete 
}: SitemapListViewProps) => {
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
          {sitemaps.map((item, idx) => {
            const hasPending = item.stats && item.stats.pending > 0;
            return (
              <div key={item._id} className="flex flex-col sm:flex-row sm:items-center px-4 py-4 border-b border-gray-50 gap-4 hover:bg-gray-50 bg-white transition-colors">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="text-xs text-gray-400 w-6 pt-1 font-mono shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-indigo-700 hover:text-indigo-900 text-sm font-mono truncate flex items-center gap-2 decoration-transparent"
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
                       <span className="text-gray-300 hidden sm:inline">|</span>
                       <span className="text-[10px] text-gray-400">Found: {new Date(item.foundAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2 self-end sm:self-center pl-10 sm:pl-0">
                  
                  {/* Quick Actions Group */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
                     <Button 
                        variant="primary" 
                        onClick={() => onCopyNextBatch(item.url, 20)} 
                        className="!p-1.5 !h-8 text-[10px] px-2" 
                        title="Copy Next 20 Pending URLs"
                        disabled={!hasPending}
                      >
                        <ListPlus size={14} className="mr-1" /> Next 20
                      </Button>
                      <Button 
                        variant="success" 
                        onClick={() => onCopyPending(item.url)} 
                        className="!p-1.5 !h-8 text-[10px] px-2" 
                        title="Copy All Pending URLs from this sitemap"
                        disabled={!hasPending}
                      >
                        <CheckCircle2 size={14} className="mr-1" /> All Pending
                      </Button>
                  </div>

                  <div className="w-px h-6 bg-gray-200 mx-1"></div>

                   <Button variant="ghost" onClick={() => onCopyUrls(item._id)} className="!p-2 text-gray-400 hover:text-indigo-600" title="Copy ALL URLs (Text)">
                    <ClipboardList size={16} />
                  </Button>
                  <Button variant="ghost" onClick={() => onCopy(item.url)} className="!p-2 text-gray-400 hover:text-indigo-600" title="Copy XML Link">
                    <Copy size={16} />
                  </Button>
                  <Button variant="ghost" onClick={() => onDelete(item._id)} className="!p-2 text-gray-400 hover:text-red-600" title="Delete Sitemap Entry">
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};