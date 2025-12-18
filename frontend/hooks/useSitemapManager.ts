import React, { useState, useEffect, useCallback } from 'react';
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
      const q = new URLSearchParams({ page: pageToLoad.toString(), limit: '50', status: filterStatus, search: searchTerm });
      const res = await fetch(`http://localhost:5000/api/urls?${q}`);
      if (res.ok) {
        const r = await res.json();
        setUrls(r.data);
        setPagination(r.pagination);
        setStats(r.stats);
      }
    } catch (e) { showToast('Fetch failed', 'error'); }
  }, [filterStatus, searchTerm]);

  const fetchSitemaps = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:5000/api/sitemaps');
      if (res.ok) setSitemaps((await res.json()).data);
    } catch (e) {}
  }, []);

  useEffect(() => { fetchUrls(1); fetchSitemaps(); }, [fetchUrls, fetchSitemaps]);

  // handleExtract uses React.FormEvent, requiring the React import to resolve the namespace.
  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sitemapUrl) return;
    setLoading(true);
    try {
      showToast('Extracting...');
      const res = await fetch('http://localhost:5000/api/extract-sitemap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrl, filterPattern: extractionFilter, enableQualityFilter }),
      });
      if (res.ok) { showToast('Done!'); setSitemapUrl(''); await fetchUrls(1); await fetchSitemaps(); }
      else showToast('Failed', 'error');
    } catch (err) { showToast('Error', 'error'); } finally { setLoading(false); }
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); showToast('Copied!'); return true; } 
    catch (err) { showToast('Denied', 'error'); return false; }
  };

  const copyBatchAction = async (endpoint: string, body: any, msg: string) => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { await fetchUrls(pagination.page); await fetchSitemaps(); showToast(msg); }
    } finally { setLoading(false); }
  };

  const copyNextBatch = async (amount: number, parentSitemap?: string) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: amount.toString(), search: searchTerm, ...(parentSitemap ? { parentSitemap } : {}) });
      const res = await fetch(`http://localhost:5000/api/urls/pending?${q}`);
      const data = await res.json();
      if (data.urls?.length) {
        await navigator.clipboard.writeText(data.text);
        await copyBatchAction('http://localhost:5000/api/mark-copied', { urls: data.urls }, `Copied ${data.count}!`);
      } else showToast('No URLs', 'error');
    } finally { setLoading(false); }
  };

  const processQualityBatch = async (sitemapUrl: string, limit: number) => {
    setLoading(true);
    try {
      showToast(`Checking quality...`);
      const res = await fetch('http://localhost:5000/api/sitemaps/process-quality', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentSitemap: sitemapUrl, limit })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchUrls(pagination.page); await fetchSitemaps();
        if (data.count > 0) { await navigator.clipboard.writeText(data.text); showToast(`Copied ${data.count} quality URLs!`); }
        else showToast('No quality URLs found', 'error');
      }
    } finally { setLoading(false); }
  };

  const copyAllPending = async (parentSitemap?: string) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ search: searchTerm, ...(parentSitemap ? { parentSitemap } : {}) });
      const res = await fetch(`http://localhost:5000/api/urls/pending?${q}`);
      const data = await res.json();
      if (data.text) {
        await navigator.clipboard.writeText(data.text);
        await copyBatchAction('http://localhost:5000/api/mark-copied', { allPending: true, search: searchTerm, parentSitemap }, `Copied ${data.count}!`);
      }
    } finally { setLoading(false); }
  };

  const backupDatabase = async () => {
    setLoading(true);
    try {
      showToast('Preparing backup (Large data takes longer)...');
      window.location.href = 'http://localhost:5000/api/backup';
    } finally { setLoading(false); }
  };

  const restoreDatabase = async (file: File) => {
    setLoading(true);
    try {
      showToast('Reading backup file...');
      const text = await file.text();
      const data = JSON.parse(text);
      showToast(`Restoring ${data.urls?.length || 0} records...`);
      const res = await fetch('http://localhost:5000/api/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, clearFirst: true })
      });
      if (res.ok) { showToast('Restore complete!'); await fetchUrls(1); await fetchSitemaps(); }
      else showToast('Restore failed', 'error');
    } catch (e) { showToast('Invalid backup file', 'error'); }
    finally { setLoading(false); }
  };

  const clearDb = async () => {
    if (!window.confirm("Delete ALL data?")) return;
    await fetch('http://localhost:5000/api/clear-database', { method: 'POST' });
    setUrls([]); setSitemaps([]); setStats({ totalUrls: 0, pending: 0, copied: 0 }); showToast('Cleared');
  };

  return {
    sitemapUrl, setSitemapUrl, extractionFilter, setExtractionFilter, enableQualityFilter, setEnableQualityFilter,
    loading, urls, sitemaps, toast, filterStatus, setFilterStatus, searchTerm, setSearchTerm, pagination, stats,
    handleExtract, copyNextBatch, copyAllPending, copySingle: (i: any) => copyText(i.url), copyText, processQualityBatch,
    backupDatabase, restoreDatabase,
    deleteUrl: (id: string) => fetch(`http://localhost:5000/api/urls/${id}`, { method: 'DELETE' }).then(() => fetchUrls(pagination.page)),
    deleteSitemap: (id: string) => fetch(`http://localhost:5000/api/sitemaps/${id}`, { method: 'DELETE' }).then(() => fetchSitemaps()),
    copySitemapChildUrls: async (id: string) => {
      const res = await fetch(`http://localhost:5000/api/sitemaps/${id}/urls`);
      const d = await res.json();
      if (d.text) { await navigator.clipboard.writeText(d.text); showToast(`Copied ${d.count}!`); }
    },
    copySitemapNextBatch: (url: string, amt: number) => copyNextBatch(amt, url),
    copySitemapPending: (url: string) => copyAllPending(url), handleClearDatabase: clearDb,
    handlePageChange: (p: number) => { if (p >= 1 && p <= pagination.pages) fetchUrls(p); },
    copyPagePending: async () => {
      const pending = urls.filter(u => !u.copied);
      if (pending.length) {
        await navigator.clipboard.writeText(pending.map(u => u.url).join('\n'));
        await copyBatchAction('http://localhost:5000/api/mark-copied', { urls: pending.map(u => u.url) }, `Copied ${pending.length}!`);
      }
    }
  };
};