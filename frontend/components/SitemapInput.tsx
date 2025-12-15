import React from 'react';
import { RefreshCw, Link as LinkIcon, Filter, Star } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

interface SitemapInputProps {
  sitemapUrl: string;
  setSitemapUrl: (url: string) => void;
  filterPattern: string;
  setFilterPattern: (pattern: string) => void;
  enableQualityFilter: boolean;
  setEnableQualityFilter: (enabled: boolean) => void;
  loading: boolean;
  onExtract: (e: React.FormEvent) => void;
}

export const SitemapInput = ({ 
  sitemapUrl, 
  setSitemapUrl, 
  filterPattern,
  setFilterPattern,
  enableQualityFilter,
  setEnableQualityFilter,
  loading, 
  onExtract 
}: SitemapInputProps) => {
  return (
    <Card title="Extract Sitemap" icon={RefreshCw}>
      <form onSubmit={onExtract} className="flex flex-col gap-4">
        <div className="space-y-3">
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1 ml-1">Sitemap URL</label>
            <input
              type="url"
              placeholder="https://example.com/sitemap.xml"
              value={sitemapUrl}
              onChange={e => setSitemapUrl(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              required
            />
          </div>
          
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1 ml-1 flex items-center gap-1">
              <Filter size={12} />
              Import Filter (URL Pattern)
            </label>
            <input
              type="text"
              placeholder="e.g. /recipe/ (Optional)"
              value={filterPattern}
              onChange={e => setFilterPattern(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white"
            />
          </div>

          <div className="relative flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center h-5">
              <input
                id="quality-filter"
                type="checkbox"
                checked={enableQualityFilter}
                onChange={(e) => setEnableQualityFilter(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
              />
            </div>
            <label htmlFor="quality-filter" className="text-sm text-gray-700 select-none cursor-pointer">
              <span className="font-semibold flex items-center gap-1">
                <Star size={12} className="text-yellow-500 fill-yellow-500"/> Quality Filter
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">Only import if Rating ≥ 4.0 & Reviews ≥ 50</span>
            </label>
          </div>
        </div>

        <Button type="submit" disabled={loading} fullWidth icon={loading ? RefreshCw : LinkIcon}>
          {loading ? 'Processing...' : 'Load Sitemap'}
        </Button>
      </form>
    </Card>
  );
};