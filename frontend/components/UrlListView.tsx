import React from 'react';
import { 
  List, 
  ExternalLink, 
  Copy, 
  PieChart, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight 
} from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { SitemapUrlItem } from '../types';

interface UrlListViewProps {
  urls: SitemapUrlItem[];
  pagination: { page: number; total: number; pages: number; limit: number };
  statsTotal: number;
  filterStatus: 'all' | 'pending' | 'copied';
  setFilterStatus: (status: 'all' | 'pending' | 'copied') => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onCopySingle: (item: SitemapUrlItem) => void;
  onPageChange: (page: number) => void;
}

export const UrlListView = ({
  urls,
  pagination,
  statsTotal,
  filterStatus,
  setFilterStatus,
  searchTerm,
  setSearchTerm,
  onCopySingle,
  onPageChange
}: UrlListViewProps) => {

  const renderPagination = () => {
    if (pagination.pages <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-2 p-4 border-t border-gray-100">
        <button 
          className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          disabled={pagination.page === 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft size={16} />
        </button>
        <button 
          className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          disabled={pagination.page === 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        
        <span className="text-sm text-gray-600 mx-2 font-medium">
          Page <span className="text-indigo-600">{pagination.page}</span> of {pagination.pages}
        </span>

        <button 
          className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          disabled={pagination.page === pagination.pages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <button 
          className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          disabled={pagination.page === pagination.pages}
          onClick={() => onPageChange(pagination.pages)}
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    );
  };

  return (
    <Card title="URL Database" icon={List} className="h-full">
      {/* Filter Bar */}
      <div className="px-5 pb-4 mb-4 border-b border-gray-100 flex flex-wrap gap-4 items-center">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {(['all', 'pending', 'copied'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                filterStatus === status 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="flex-1 relative min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Filter URLs (e.g. recipe)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
         Showing {pagination.total} result{pagination.total !== 1 ? 's' : ''} • Page {pagination.page} of {pagination.pages || 1}
      </div>

      {/* List Content */}
      {statsTotal === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-4">
          <PieChart size={48} />
          <p>Database is empty. Enter a sitemap URL to populate.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col h-[500px] overflow-y-auto custom-scrollbar">
            {urls.length === 0 && (
               <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                  No URLs match your current filters.
               </div>
            )}
            {urls.map((item, idx) => (
              <div key={item._id} className={`flex items-center px-4 py-3 border-b border-gray-50 gap-4 transition-colors ${
                item.copied ? 'bg-gray-50/80 opacity-60' : 'hover:bg-gray-50 bg-white'
              }`}>
                <div className="text-xs text-gray-400 w-10 shrink-0 font-mono">
                  #{((pagination.page - 1) * pagination.limit) + idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <a 
                    href={item.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-gray-700 hover:text-indigo-600 text-sm font-mono truncate flex items-center gap-2 decoration-transparent"
                    title={item.url}
                  >
                    {item.url} <ExternalLink size={10} className="text-gray-400" />
                  </a>
                  <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                    {item.sourceDomain}
                  </div>
                </div>
                <div className="shrink-0">
                  {item.copied ? (
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-200">Copied</span>
                  ) : (
                    <Button variant="ghost" onClick={() => onCopySingle(item)} className="!p-2 text-gray-400 hover:text-indigo-600">
                      <Copy size={16} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {renderPagination()}
        </>
      )}
    </Card>
  );
};