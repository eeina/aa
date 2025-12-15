import React, { useState, useEffect, useCallback } from 'react';
import { SitemapUrlItem } from './types';

// Components
import { Header } from './components/Header';
import { SitemapInput } from './components/SitemapInput';
import { StatsOverview } from './components/StatsOverview';
import { ActionPanel } from './components/ActionPanel';
import { UrlListView } from './components/UrlListView';
import { RawModal } from './components/RawModal';
import { Notification } from './components/Notification';

export default function App() {
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [extractionFilter, setExtractionFilter] = useState(''); 
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false); // Scan state

  const [urls, setUrls] = useState<SitemapUrlItem[]>([]);
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [showRawModal, setShowRawModal] = useState(false);
  
  // View Filters
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'copied' | 'unchecked' | 'rejected'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination & Stats
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [stats, setStats] = useState({ totalUrls: 0, unchecked: 0, pending: 0, rejected: 0, copied: 0 });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 4000);
  };

  const fetchUrls = useCallback(async (pageToLoad = 1) => {
    try {
      const queryParams = new URLSearchParams({
        page: pageToLoad.toString(),
        limit: '50',
        status: filterStatus,
        search: searchTerm
      });

      const res = await fetch(`http://localhost:5000/api/urls?${queryParams}`);
      if (res.ok) {
        const result = await res.json();
        setUrls(result.data);
        setPagination(result.pagination);
        setStats(result.stats);
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to fetch URLs', 'error');
    }
  }, [filterStatus, searchTerm]);

  useEffect(() => {
    fetchUrls(1);
  }, [fetchUrls]);

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sitemapUrl) return;

    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/api/extract-sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sitemapUrl,
          filterPattern: extractionFilter
        }),
      });
      const data = await res.json();
      
      if (res.ok) {
        showToast(`Imported ${data.newUrlsStored} new URLs (Total found: ${data.totalUrlsFound}). Status: Unchecked.`);
        setSitemapUrl('');
        setExtractionFilter('');
        await fetchUrls(1);
      } else {
        showToast(data.error || 'Import failed', 'error');
      }
    } catch (err) {
      showToast('Connection error.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRunScan = async () => {
    if (stats.unchecked === 0) return showToast('No unchecked URLs to scan.', 'error');
    setScanLoading(true);
    showToast('Starting quality scan...', 'success');

    try {
      let keepScanning = true;
      let totalApproved = 0;
      let totalRejected = 0;

      // Simple loop to process batches
      while (keepScanning) {
        const res = await fetch('http://localhost:5000/api/scan-quality-batch', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ limit: 10 })
        });
        const data = await res.json();
        
        if (data.processed > 0) {
           totalApproved += data.approved;
           totalRejected += data.rejected;
           // Refresh list slightly to show progress if viewing pending/all
           fetchUrls(pagination.page);
        } else {
           keepScanning = false;
        }

        if (data.remaining === 0) keepScanning = false;
      }
      
      showToast(`Scan complete. Approved: ${totalApproved}, Rejected: ${totalRejected}`);
    } catch (error) {
      showToast('Scan interrupted due to error.', 'error');
    } finally {
      setScanLoading(false);
      fetchUrls(1);
    }
  };

  const copyBatchText = async (text: string) => {
     try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      showToast('Clipboard access denied.', 'error');
      return false;
    }
  }

  const markAllPendingAsCopied = async () => {
    try {
      await fetch('http://localhost:5000/api/mark-copied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          allPending: true,
          search: searchTerm
        }),
      });
      fetchUrls(pagination.page);
    } catch (e) {
       showToast('Failed to update status', 'error');
    }
  }

  const copyNextBatch = async (amount: number) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: amount.toString(),
        search: searchTerm
      });
      
      const res = await fetch(`http://localhost:5000/api/urls/pending?${queryParams}`);
      const data = await res.json();
      
      if (data.urls && data.urls.length > 0) {
        const success = await copyBatchText(data.text);
        if (success) {
           await fetch('http://localhost:5000/api/mark-copied', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: data.urls }),
          });
          
          setUrls(prev => prev.map(u => data.urls.includes(u.url) ? { ...u, copied: true } : u));
          fetchUrls(pagination.page);
          showToast(`Copied ${data.count} URLs!`);
        }
      } else {
        showToast('No approved, pending URLs found.', 'error');
      }
    } catch (e) {
      showToast('Failed to fetch batch', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyAllPending = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({ search: searchTerm });
      const res = await fetch(`http://localhost:5000/api/urls/pending?${queryParams}`);
      const data = await res.json();
      
      if (data.text) {
        const success = await copyBatchText(data.text);
        if (success) {
          await markAllPendingAsCopied();
          showToast(`Copied ${data.count} URLs!`);
        }
      } else {
        showToast('No pending URLs to copy', 'error');
      }
    } catch (e) {
      showToast('Failed to fetch list', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyPagePending = async () => {
    // Pending means visible on page AND not copied AND approved
    const pagePending = urls.filter(u => !u.copied && u.qualityStatus === 'approved');
    if (pagePending.length === 0) return showToast('No approved pending URLs on this page.', 'error');

    const text = pagePending.map(u => u.url).join('\n');
    const success = await copyBatchText(text);
    if (success) {
      try {
        await fetch('http://localhost:5000/api/mark-copied', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: pagePending.map(u => u.url) }),
        });
        fetchUrls(pagination.page);
        showToast(`Copied ${pagePending.length} URLs!`);
      } catch (e) {
         showToast('Failed to update status', 'error');
      }
    }
  };

  const copySingle = async (item: SitemapUrlItem) => {
    const success = await copyBatchText(item.url);
    if (success) {
       try {
        await fetch('http://localhost:5000/api/mark-copied', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: [item.url] }),
        });
        fetchUrls(pagination.page);
        showToast('URL copied!');
      } catch (err) {
        showToast('Failed to update status', 'error');
      }
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm("Delete ALL data?")) return;
    try {
      const res = await fetch('http://localhost:5000/api/clear-database', { method: 'POST' });
      if (res.ok) {
        setUrls([]);
        setStats({ totalUrls: 0, unchecked: 0, pending: 0, rejected: 0, copied: 0 });
        setPagination({ page: 1, limit: 50, total: 0, pages: 1 });
        showToast('Database cleared.');
      }
    } catch (e) {
      showToast('Error.', 'error');
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      fetchUrls(newPage);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        
        {/* Left Sidebar */}
        <div className="flex flex-col gap-6">
          <SitemapInput 
            sitemapUrl={sitemapUrl} 
            setSitemapUrl={setSitemapUrl}
            filterPattern={extractionFilter}
            setFilterPattern={setExtractionFilter}
            loading={loading} 
            onExtract={handleExtract} 
          />

          {stats.totalUrls > 0 && (
            <>
              <ActionPanel 
                loading={loading}
                scanLoading={scanLoading}
                stats={stats}
                filterStatus={filterStatus}
                searchTerm={searchTerm}
                onCopyNextBatch={copyNextBatch}
                onCopyAllPending={copyAllPending}
                onCopyPagePending={copyPagePending}
                onShowRaw={() => setShowRawModal(true)}
                onClearDatabase={handleClearDatabase}
                onRunScan={handleRunScan}
                pageHasPending={urls.some(u => !u.copied && u.qualityStatus === 'approved')}
              />
              <StatsOverview stats={stats} />
            </>
          )}
        </div>

        {/* Right Content */}
        <div className="flex flex-col gap-4 min-w-0">
          <Notification message={toast.msg} type={toast.type} />
          
          <UrlListView 
            urls={urls}
            pagination={pagination}
            statsTotal={stats.totalUrls}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onCopySingle={copySingle}
            onPageChange={handlePageChange}
          />
        </div>

      </main>

      <RawModal 
        show={showRawModal} 
        onClose={() => setShowRawModal(false)} 
        urls={urls}
        onCopy={async (text) => {
          const success = await copyBatchText(text);
          if(success) showToast('Page copied!');
        }}
      />
    </div>
  );
}