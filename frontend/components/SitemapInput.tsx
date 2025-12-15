import React from 'react';
import { RefreshCw, Link as LinkIcon, Filter } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

interface SitemapInputProps {
  sitemapUrl: string;
  setSitemapUrl: (url: string) => void;
  filterPattern: string;
  setFilterPattern: (pattern: string) => void;
  loading: boolean;
  onExtract: (e: React.FormEvent) => void;
}

export const SitemapInput = ({ 
  sitemapUrl, 
  setSitemapUrl, 
  filterPattern,
  setFilterPattern,
  loading, 
  onExtract 
}: SitemapInputProps) => {
  return (
    <Card title="1. Import Sitemap" icon={RefreshCw}>
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
              Filter by URL Text
            </label>
            <input
              type="text"
              placeholder="e.g. /recipe/ (Optional)"
              value={filterPattern}
              onChange={e => setFilterPattern(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white"
            />
          </div>
        </div>

        <Button type="submit" disabled={loading} fullWidth icon={loading ? RefreshCw : LinkIcon}>
          {loading ? 'Importing...' : 'Import URLs (Unchecked)'}
        </Button>
      </form>
    </Card>
  );
};