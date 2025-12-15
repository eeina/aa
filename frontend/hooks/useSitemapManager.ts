import { useState, useEffect, useCallback } from 'react';
import { SitemapUrlItem, SitemapFileItem } from '../types';

export const useSitemapManager = () => {
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [extractionFilter, setExtractionFilter] = useState('');
  const [enableQualityFilter, setEnableQualityFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<SitemapUrlItem[]>([]);
  const [sitemaps, setSitemaps] = useState<SitemapFileItem[]>([]);
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'copied'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [stats, setStats] = useState({ totalUrls: 0, pending: 0, copied: 0 });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 4000);
  };

  const fetchUrls = useCallback(async (pageToLoad = 1) => {
    try {
      const queryParams = new URLSearchParams({ page: pageToLoad.toString(), limit: '50', status: filterStatus, search: searchTerm });
      const res = await fetch(`http://localhost:5000/api/urls?${queryParams}`);
      if (res.ok) {
        const result = await res.json();
        setUrls(result.data);
        setPagination(result.pagination);
        setStats(result.stats);
      }
    } catch (e) { console.error(e); showToast('Failed to fetch URLs', 'error'); }
  }, [filterStatus, searchTerm]);

  const fetchSitemaps = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:5000/api/sitemaps');
      if (res.ok) { const result = await res.json(); setSitemaps(result.data); }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchUrls(1); fetchSitemaps(); }, [fetchUrls, fetchSitemaps]);

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sitemapUrl) return;
    setLoading(true);
    try {
      showToast('Processing started...', 'success');
      const res = await fetch('http://localhost:5000/api/extract-sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrl, filterPattern: extractionFilter, enableQualityFilter }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Done! Found ${data.totalUrlsFound} URLs.`);
        setSitemapUrl(''); setExtractionFilter(''); setEnableQualityFilter(false);
        await fetchUrls(1); await fetchSitemaps();
      } else { showToast(data.error || 'Extraction failed', 'error'); }
    } catch (err) { showToast('Connection error', 'error'); } finally { setLoading(false); }
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); showToast('Copied to clipboard!'); return true; } 
    catch (err) { showToast('Clipboard access denied.', 'error'); return false; }
  };

  const copyBatch = async (endpoint: string, body: any = {}, successMsg: string) => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { await fetchUrls(pagination.page); await fetchSitemaps(); showToast(successMsg); }
    } catch (e) { showToast('Operation failed', 'error'); } finally { setLoading(false); }
  };

  const copyNextBatch = async (amount: number, parentSitemap?: string) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: amount.toString(), search: searchTerm, ...(parentSitemap ? { parentSitemap } : {}) });
      const res = await fetch(`http://localhost:5000/api/urls/pending?${q}`);
      const data = await res.json();
      if (data.urls?.length > 0) {
        await navigator.clipboard.writeText(data.text);
        await copyBatch('http://localhost:5000/api/mark-copied', { urls: data.urls }, `Copied ${data.count} URLs!`);
      } else showToast('No URLs to copy', 'error');
    } catch (e) { showToast('Failed to fetch batch', 'error'); } finally { setLoading(false); }
  };

  const processQualityBatch = async (sitemapUrl: string, limit: number) => {
    setLoading(true);
    try {
      showToast(`Processing ${limit} URLs for quality...`);
      const res = await fetch('http://localhost:5000/api/sitemaps/process-quality', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentSitemap: sitemapUrl, limit })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchUrls(pagination.page); await fetchSitemaps();
        if (data.count > 0) {
          await navigator.clipboard.writeText(data.text);
          showToast(`Copied ${data.count} High-Quality URLs (Processed ${data.processedCount})`);
        } else {
          showToast(`Processed ${data.processedCount} URLs. None met quality criteria.`);
        }
      } else showToast('Process failed', 'error');
    } catch(e) { showToast('Error', 'error'); } finally { setLoading(false); }
  };

  const copyAllPending = async (parentSitemap?: string) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ search: searchTerm, ...(parentSitemap ? { parentSitemap } : {}) });
      const res = await fetch(`http://localhost:5000/api/urls/pending?${q}`);
      const data = await res.json();
      if (data.text) {
        await navigator.clipboard.writeText(data.text);
        await copyBatch('http://localhost:5000/api/mark-copied', { allPending: true, search: searchTerm, parentSitemap }, `Copied ${data.count} URLs!`);
      } else showToast('No URLs to copy', 'error');
    } catch (e) { showToast('Failed', 'error'); } finally { setLoading(false); }
  };

  const copyPagePending = async () => {
    const pagePending = urls.filter(u => !u.copied);
    if (!pagePending.length) return showToast('No pending URLs on page', 'error');
    await navigator.clipboard.writeText(pagePending.map(u => u.url).join('\n'));
    await copyBatch('http://localhost:5000/api/mark-copied', { urls: pagePending.map(u => u.url) }, `Copied ${pagePending.length} URLs!`);
  };

  const copySingle = async (item: SitemapUrlItem) => {
    await navigator.clipboard.writeText(item.url);
    await copyBatch('http://localhost:5000/api/mark-copied', { urls: [item.url] }, 'URL copied!');
  };

  const deleteItem = async (endpoint: string) => {
    if (!window.confirm("Are you sure?")) return;
    try { const res = await fetch(endpoint, { method: 'DELETE' }); if (res.ok) { await fetchUrls(pagination.page); await fetchSitemaps(); showToast('Deleted'); } } catch (e) { showToast('Error', 'error'); }
  };

  const copySitemapChildUrls = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:5000/api/sitemaps/${id}/urls`);
      const data = await res.json();
      if (data.text) { await navigator.clipboard.writeText(data.text); showToast(`Copied ${data.count} URLs!`); }
      else showToast('No URLs found', 'error');
    } catch (e) { showToast('Error', 'error'); }
  };

  const clearDb = async () => {
    if (!window.confirm("Delete ALL data?")) return;
    await fetch('http://localhost:5000/api/clear-database', { method: 'POST' });
    setUrls([]); setSitemaps([]); setStats({ totalUrls: 0, pending: 0, copied: 0 }); showToast('Database cleared');
  };

  return {
    sitemapUrl, setSitemapUrl, extractionFilter, setExtractionFilter, enableQualityFilter, setEnableQualityFilter,
    loading, urls, sitemaps, toast, filterStatus, setFilterStatus, searchTerm, setSearchTerm, pagination, stats,
    handleExtract, copyNextBatch, copyAllPending, copyPagePending, copySingle, copyText, processQualityBatch,
    deleteUrl: (id: string) => deleteItem(`http://localhost:5000/api/urls/${id}`),
    deleteSitemap: (id: string) => deleteItem(`http://localhost:5000/api/sitemaps/${id}`),
    copySitemapChildUrls, copySitemapNextBatch: (url: string, amt: number) => copyNextBatch(amt, url),
    copySitemapPending: (url: string) => copyAllPending(url), handleClearDatabase: clearDb,
    handlePageChange: (p: number) => { if (p >= 1 && p <= pagination.pages) fetchUrls(p); }
  };
};