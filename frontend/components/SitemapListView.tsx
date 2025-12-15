import React from 'react';
import { 
  FileCode, 
  ExternalLink, 
  Copy, 
  Trash2,
  PieChart
} from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { SitemapFileItem } from '../types';

interface SitemapListViewProps {
  sitemaps: SitemapFileItem[];
  onCopy: (text: string) => void;
  onDelete: (id: string) => void;
}

export const SitemapListView = ({ sitemaps, onCopy, onDelete }: SitemapListViewProps) => {
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
            <div key={item._id} className="flex items-center px-4 py-3 border-b border-gray-50 gap-4 hover:bg-gray-50 bg-white transition-colors">
              <div className="text-xs text-gray-400 w-8 shrink-0 font-mono">
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
                <div className="text-[10px] text-gray-500 mt-1 flex gap-2">
                   <span className="font-semibold">{item.sourceDomain}</span>
                   <span className="text-gray-300">|</span>
                   <span>Found: {new Date(item.foundAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <Button variant="ghost" onClick={() => onCopy(item.url)} className="!p-2 text-gray-400 hover:text-indigo-600" title="Copy URL">
                  <Copy size={16} />
                </Button>
                <Button variant="ghost" onClick={() => onDelete(item._id)} className="!p-2 text-gray-400 hover:text-red-600" title="Delete Sitemap Entry">
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};