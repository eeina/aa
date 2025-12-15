import React, { useState, useEffect, useCallback } from 'react';
import { 
  Link, 
  Copy, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  List, 
  ExternalLink,
  PieChart,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  FileText,
  X
} from 'lucide-react';

import { SitemapUrlItem } from './types';
import { styles } from './styles';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { StatBox } from './components/StatBox';
import { Notification } from './components/Notification';

export default function App() {
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<SitemapUrlItem[]>([]); // Current Page URLs
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [showRawModal, setShowRawModal] = useState(false);
  
  // Pagination & Stats
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [stats, setStats] = useState({ totalUrls: 0, pending: 0, copied: 0 });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 4000);
  };

  const fetchUrls = useCallback(async (pageToLoad = 1) => {
    try {
      // By default we don't send a domain filter, effectively getting "all" URLs.
      const res = await fetch(`http://localhost:5000/api/urls?page=${pageToLoad}&limit=50`);
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
  }, []);

  // Initialize: Load full database page 1
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
        body: JSON.stringify({ sitemapUrl }),
      });
      const data = await res.json();
      
      if (res.ok) {
        showToast(`Successfully processed. Found ${data.totalUrlsFound} URLs.`);
        // Refresh the list (showing full database, page 1 to potentially show new items depending on sort, or just refresh stats)
        setSitemapUrl('');
        await fetchUrls(1);
      } else {
        showToast(data.error || 'Extraction failed', 'error');
      }
    } catch (err) {
      showToast('Connection error. Is backend running?', 'error');
    } finally {
      setLoading(false);
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
        body: JSON.stringify({ allPending: true }),
      });
      // Refresh view
      fetchUrls(pagination.page);
    } catch (e) {
       showToast('Failed to update status on server', 'error');
    }
  }

  // Copy ALL pending in the entire database
  const copyAllPending = async () => {
    if (stats.pending === 0) return showToast('No pending URLs.', 'error');

    setLoading(true);
    try {
      // Get text from backend
      const res = await fetch('http://localhost:5000/api/urls/pending');
      const data = await res.json();
      
      if (data.text) {
        const success = await copyBatchText(data.text);
        if (success) {
          await markAllPendingAsCopied();
          showToast(`Copied ${data.count} URLs!`);
        }
      } else {
        showToast('No URLs to copy', 'error');
      }
    } catch (e) {
      showToast('Failed to fetch pending list', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Copy current page items
  const copyPagePending = async () => {
    const pagePending = urls.filter(u => !u.copied);
    if (pagePending.length === 0) return showToast('No pending URLs on this page.', 'error');

    const text = pagePending.map(u => u.url).join('\n');
    const success = await copyBatchText(text);
    if (success) {
      // Mark these specific URLs as copied
      try {
        await fetch('http://localhost:5000/api/mark-copied', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: pagePending.map(u => u.url) }),
        });
        
        // Optimistic UI update
        setUrls(prev => prev.map(u => ({ ...u, copied: true })));
        // Also refresh stats slightly
        setStats(prev => ({ 
          ...prev, 
          copied: prev.copied + pagePending.length, 
          pending: prev.pending - pagePending.length 
        }));
        showToast(`Copied ${pagePending.length} URLs from this page!`);
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
        setUrls(prev => prev.map(u => u._id === item._id ? { ...u, copied: true } : u));
        showToast('URL copied!');
      } catch (err) {
        showToast('Failed to update status', 'error');
      }
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm("Are you sure you want to delete ALL data? This cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/clear-database', {
        method: 'POST'
      });
      if (res.ok) {
        setUrls([]);
        setStats({ totalUrls: 0, pending: 0, copied: 0 });
        setPagination({ page: 1, limit: 50, total: 0, pages: 1 });
        showToast('Database cleared successfully.');
      } else {
        showToast('Failed to clear database.', 'error');
      }
    } catch (e) {
      showToast('Error connecting to server.', 'error');
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      fetchUrls(newPage);
      const listContainer = document.getElementById('url-list-container');
      if (listContainer) listContainer.scrollTop = 0;
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}><Link size={24} color="white" /></div>
          <h1>Sitemap Manager (Full DB)</h1>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.mainGrid}>
        
        {/* Left Column: Input & Actions */}
        <div style={styles.column}>
          <Card title="Extract Sitemap" icon={RefreshCw}>
            <form onSubmit={handleExtract} style={styles.form}>
              <div style={styles.inputWrapper}>
                <input
                  type="url"
                  placeholder="https://example.com/sitemap.xml"
                  value={sitemapUrl}
                  onChange={e => setSitemapUrl(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>
              <Button type="submit" disabled={loading} fullWidth icon={loading ? RefreshCw : Link}>
                {loading ? 'Processing...' : 'Load Sitemap'}
              </Button>
            </form>
          </Card>

          {stats.totalUrls > 0 && (
            <Card title="Quick Actions" icon={Copy}>
              <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <Button 
                  variant="success" 
                  onClick={copyAllPending} 
                  disabled={loading || stats.pending === 0} 
                  fullWidth 
                  icon={Copy}
                >
                  {loading ? 'Processing...' : `Copy All Pending (${stats.pending})`}
                </Button>
                
                <Button 
                  variant="secondary" 
                  onClick={copyPagePending} 
                  disabled={urls.filter(u => !u.copied).length === 0} 
                  fullWidth 
                  icon={Copy}
                >
                  Copy This Page
                </Button>

                <Button 
                  variant="outline" 
                  onClick={() => setShowRawModal(true)} 
                  fullWidth 
                  icon={FileText}
                >
                  View Page Raw List
                </Button>

                <div style={styles.progressContainer}>
                  <div style={styles.progressLabel}>
                    <span>Progress</span>
                    <span>{stats.totalUrls > 0 ? Math.round((stats.copied / stats.totalUrls) * 100) : 0}%</span>
                  </div>
                  <div style={styles.progressBarBg}>
                    <div style={{...styles.progressBarFill, width: `${stats.totalUrls > 0 ? (stats.copied / stats.totalUrls) * 100 : 0}%`}}></div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Database Management */}
          <Card title="Management" icon={Trash2}>
             <Button variant="danger" onClick={handleClearDatabase} fullWidth icon={Trash2}>
                Clear Full Database
             </Button>
          </Card>

          {/* Stats */}
          {stats.totalUrls > 0 && (
            <div style={styles.statsGrid}>
              <StatBox label="Total URLs" value={stats.totalUrls} color="#4f46e5" icon={List} />
              <StatBox label="Pending" value={stats.pending} color="#f59e0b" icon={AlertCircle} />
              <StatBox label="Done" value={stats.copied} color="#10b981" icon={CheckCircle} />
            </div>
          )}
        </div>

        {/* Right Column: List */}
        <div style={styles.columnWide}>
          <Notification message={toast.msg} type={toast.type} />
          
          <Card title="URL Database" icon={List} actions={
            <div style={{fontSize: '0.85rem', color: '#6b7280'}}>
              Page {pagination.page} of {pagination.pages || 1} • {pagination.total} URLs
            </div>
          }>
            {stats.totalUrls === 0 ? (
              <div style={styles.emptyState}>
                <PieChart size={48} color="#d1d5db" />
                <p>Database is empty. Enter a sitemap URL to populate.</p>
              </div>
            ) : (
              <>
                <div id="url-list-container" style={styles.list}>
                  {urls.map((item, idx) => (
                    <div key={item._id} style={{
                      ...styles.listItem,
                      opacity: item.copied ? 0.6 : 1,
                      backgroundColor: item.copied ? '#f9fafb' : 'white',
                    }}>
                      <div style={styles.listIndex}>#{((pagination.page - 1) * pagination.limit) + idx + 1}</div>
                      <div style={styles.listContent}>
                        <a 
                          href={item.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={styles.link}
                          title={item.url}
                        >
                          {item.url} <ExternalLink size={12} />
                        </a>
                        <div style={{fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px'}}>
                          {item.sourceDomain}
                        </div>
                      </div>
                      <div style={styles.listActions}>
                        {item.copied ? (
                          <span style={styles.badgeSuccess}>Copied</span>
                        ) : (
                          <Button variant="ghost" onClick={() => copySingle(item)}>
                            <Copy size={16} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Pagination Controls */}
                {pagination.pages > 1 && (
                  <div style={styles.paginationContainer}>
                    <button 
                      style={styles.pageBtn} 
                      disabled={pagination.page === 1}
                      onClick={() => handlePageChange(1)}
                    >
                      <ChevronsLeft size={18} />
                    </button>
                    <button 
                      style={styles.pageBtn} 
                      disabled={pagination.page === 1}
                      onClick={() => handlePageChange(pagination.page - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    
                    <span style={styles.pageInfo}>
                      Page <strong>{pagination.page}</strong> of {pagination.pages}
                    </span>

                    <button 
                      style={styles.pageBtn} 
                      disabled={pagination.page === pagination.pages}
                      onClick={() => handlePageChange(pagination.page + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button 
                      style={styles.pageBtn} 
                      disabled={pagination.page === pagination.pages}
                      onClick={() => handlePageChange(pagination.pages)}
                    >
                      <ChevronsRight size={18} />
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

      </main>

      {/* Raw Data Modal */}
      {showRawModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Raw List (Current Page)</h3>
              <Button variant="ghost" onClick={() => setShowRawModal(false)}>
                <X size={20} />
              </Button>
            </div>
            <textarea
              readOnly
              value={urls.map(u => u.url).join('\n')}
              style={styles.rawTextarea}
              onClick={(e) => e.currentTarget.select()}
            />
            <div style={styles.modalActions}>
              <Button variant="outline" onClick={() => setShowRawModal(false)}>
                Close
              </Button>
              <Button onClick={() => copyBatchText(urls.map(u => u.url).join('\n')).then(() => showToast('Page copied!'))}>
                Copy Page
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
