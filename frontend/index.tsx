import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
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

// --- Types ---
interface SitemapUrlItem {
  _id: string;
  url: string;
  copied: boolean;
  sourceDomain: string;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'success' | 'outline' | 'ghost' | 'secondary' | 'danger';
  icon?: React.ElementType;
  fullWidth?: boolean;
}

// --- Constants ---
const ITEMS_PER_PAGE = 50;

// --- Components ---

const Button: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  disabled = false, 
  icon: Icon = null, 
  fullWidth = false,
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.95rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    transition: 'all 0.2s ease',
    opacity: disabled ? 0.6 : 1,
    width: fullWidth ? '100%' : 'auto',
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: '#4f46e5',
      color: 'white',
      boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
    },
    success: {
      backgroundColor: '#10b981',
      color: 'white',
      boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
    },
    secondary: {
      backgroundColor: '#8b5cf6',
      color: 'white',
      boxShadow: '0 4px 6px -1px rgba(139, 92, 246, 0.2)',
    },
    danger: {
      backgroundColor: '#ef4444',
      color: 'white',
      boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.2)',
    },
    outline: {
      backgroundColor: 'transparent',
      border: '1px solid #d1d5db',
      color: '#374151',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: '#6b7280',
      padding: '6px',
    }
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      style={{...baseStyle, ...variants[variant]}}
      {...props}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const Card = ({ children, title, icon: Icon, actions }: any) => (
  <div style={styles.card}>
    {(title || actions) && (
      <div style={styles.cardHeader}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
          {Icon && <div style={styles.iconBox}><Icon size={20} color="#4f46e5"/></div>}
          {title && <h3 style={styles.cardTitle}>{title}</h3>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    )}
    <div style={styles.cardContent}>
      {children}
    </div>
  </div>
);

const StatBox = ({ label, value, color, icon: Icon }: any) => (
  <div style={styles.statBox}>
    <div style={{...styles.statIcon, backgroundColor: `${color}20`, color: color}}>
      <Icon size={24} />
    </div>
    <div>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  </div>
);

const Notification = ({ message, type }: { message: string, type: string }) => {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div style={{
      ...styles.notification,
      backgroundColor: isError ? '#fef2f2' : '#ecfdf5',
      borderColor: isError ? '#fca5a5' : '#6ee7b7',
      color: isError ? '#991b1b' : '#065f46',
    }}>
      {isError ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
      <span>{message}</span>
    </div>
  );
};

// --- Main App Component ---

function App() {
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<SitemapUrlItem[]>([]);
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [currentDomain, setCurrentDomain] = useState('');
  const [showRawModal, setShowRawModal] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);

  // Stats
  const total = urls.length;
  const copied = urls.filter(u => u.copied).length;
  const pending = total - copied;

  // Pagination Logic
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const displayedUrls = urls.slice(startIndex, endIndex);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 4000);
  };

  const fetchUrls = useCallback(async (domain: string) => {
    if (!domain) return;
    try {
      const res = await fetch(`http://localhost:5000/api/urls?domain=${encodeURIComponent(domain)}`);
      if (res.ok) {
        const data = await res.json();
        setUrls(data);
        setCurrentDomain(domain);
        localStorage.setItem('lastDomain', domain); // Persist
        setCurrentPage(1); 
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to fetch URLs', 'error');
    }
  }, []);

  // Restore state on load
  useEffect(() => {
    const lastDomain = localStorage.getItem('lastDomain');
    if (lastDomain) {
      fetchUrls(lastDomain);
    }
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
        await fetchUrls(data.domain);
      } else {
        showToast(data.error || 'Extraction failed', 'error');
      }
    } catch (err) {
      showToast('Connection error. Is backend running?', 'error');
    } finally {
      setLoading(false);
    }
  };

  const markAsCopied = async (items: SitemapUrlItem[]) => {
    const idsToUpdate = items.map(i => i.url);
    try {
      await fetch('http://localhost:5000/api/mark-copied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: idsToUpdate }),
      });
      
      // Optimistic update
      setUrls(prev => prev.map(u => 
        idsToUpdate.includes(u.url) ? { ...u, copied: true } : u
      ));
    } catch (e) {
      console.error('Failed to sync copy status', e);
      showToast('Failed to update status on server', 'error');
    }
  };

  const copyBatch = async (batch: SitemapUrlItem[], successMessage: string) => {
    if (batch.length === 0) return showToast('No pending URLs to copy.', 'error');

    const text = batch.map(u => u.url).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      await markAsCopied(batch);
      showToast(successMessage);
    } catch (err) {
      showToast('Clipboard access denied.', 'error');
    }
  };

  const copyAllPending = () => {
    const pendingUrls = urls.filter(u => !u.copied);
    copyBatch(pendingUrls, `Copied all ${pendingUrls.length} pending URLs!`);
  };

  const copyPagePending = () => {
    const pagePending = displayedUrls.filter(u => !u.copied);
    copyBatch(pagePending, `Copied ${pagePending.length} URLs from this page!`);
  };

  const copySingle = async (item: SitemapUrlItem) => {
    try {
      await navigator.clipboard.writeText(item.url);
      await markAsCopied([item]);
      showToast('URL copied!');
    } catch (err) {
      showToast('Failed to copy', 'error');
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
        setCurrentDomain('');
        localStorage.removeItem('lastDomain');
        showToast('Database cleared successfully.');
      } else {
        showToast('Failed to clear database.', 'error');
      }
    } catch (e) {
      showToast('Error connecting to server.', 'error');
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
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
          <h1>Sitemap Manager</h1>
        </div>
        {currentDomain && <div style={styles.domainBadge}>{currentDomain}</div>}
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

          {urls.length > 0 && (
            <Card title="Quick Actions" icon={Copy}>
              <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <Button 
                  variant="success" 
                  onClick={copyAllPending} 
                  disabled={pending === 0} 
                  fullWidth 
                  icon={Copy}
                >
                  Copy All Pending ({pending})
                </Button>
                
                <Button 
                  variant="secondary" 
                  onClick={copyPagePending} 
                  disabled={displayedUrls.filter(u => !u.copied).length === 0} 
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
                  View Raw List
                </Button>

                <div style={styles.progressContainer}>
                  <div style={styles.progressLabel}>
                    <span>Progress</span>
                    <span>{total > 0 ? Math.round((copied / total) * 100) : 0}%</span>
                  </div>
                  <div style={styles.progressBarBg}>
                    <div style={{...styles.progressBarFill, width: `${total > 0 ? (copied / total) * 100 : 0}%`}}></div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Database Management */}
          <Card title="Management" icon={Trash2}>
             <Button variant="danger" onClick={handleClearDatabase} fullWidth icon={Trash2}>
                Clear Database
             </Button>
          </Card>

          {/* Stats */}
          {urls.length > 0 && (
            <div style={styles.statsGrid}>
              <StatBox label="Total URLs" value={total} color="#4f46e5" icon={List} />
              <StatBox label="Pending" value={pending} color="#f59e0b" icon={AlertCircle} />
              <StatBox label="Done" value={copied} color="#10b981" icon={CheckCircle} />
            </div>
          )}
        </div>

        {/* Right Column: List */}
        <div style={styles.columnWide}>
          <Notification message={toast.msg} type={toast.type} />
          
          <Card title="URL Database" icon={List} actions={
            <div style={{fontSize: '0.85rem', color: '#6b7280'}}>
              Page {currentPage} of {totalPages || 1} • Total {total}
            </div>
          }>
            {urls.length === 0 ? (
              <div style={styles.emptyState}>
                <PieChart size={48} color="#d1d5db" />
                <p>No URLs loaded. Enter a sitemap URL to extract or previous session was cleared.</p>
              </div>
            ) : (
              <>
                <div id="url-list-container" style={styles.list}>
                  {displayedUrls.map((item, idx) => (
                    <div key={item._id} style={{
                      ...styles.listItem,
                      opacity: item.copied ? 0.6 : 1,
                      backgroundColor: item.copied ? '#f9fafb' : 'white',
                    }}>
                      <div style={styles.listIndex}>#{startIndex + idx + 1}</div>
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
                {totalPages > 1 && (
                  <div style={styles.paginationContainer}>
                    <button 
                      style={styles.pageBtn} 
                      disabled={currentPage === 1}
                      onClick={() => handlePageChange(1)}
                    >
                      <ChevronsLeft size={18} />
                    </button>
                    <button 
                      style={styles.pageBtn} 
                      disabled={currentPage === 1}
                      onClick={() => handlePageChange(currentPage - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    
                    <span style={styles.pageInfo}>
                      Page <strong>{currentPage}</strong> of {totalPages}
                    </span>

                    <button 
                      style={styles.pageBtn} 
                      disabled={currentPage === totalPages}
                      onClick={() => handlePageChange(currentPage + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button 
                      style={styles.pageBtn} 
                      disabled={currentPage === totalPages}
                      onClick={() => handlePageChange(totalPages)}
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
              <h3 style={styles.modalTitle}>Raw URL List ({urls.length})</h3>
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
              <Button onClick={() => {
                navigator.clipboard.writeText(urls.map(u => u.url).join('\n'))
                  .then(() => showToast('All URLs copied!'))
                  .catch(() => showToast('Failed to copy', 'error'));
              }}>
                Copy All to Clipboard
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f3f4f6',
  },
  header: {
    backgroundColor: 'white',
    padding: '16px 40px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#111827',
  },
  logoIcon: {
    width: '36px',
    height: '36px',
    backgroundColor: '#4f46e5',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  domainBadge: {
    backgroundColor: '#eef2ff',
    color: '#4f46e5',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '350px 1fr',
    gap: '24px',
    padding: '40px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  columnWide: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    minWidth: 0,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #f3f4f6',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  cardTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: '600',
    color: '#374151',
  },
  iconBox: {
    backgroundColor: '#eef2ff',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
  },
  cardContent: {
    padding: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputWrapper: {
    position: 'relative',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.15s',
  } as React.CSSProperties,
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '12px',
  },
  statBox: {
    backgroundColor: 'white',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: '700',
    lineHeight: 1,
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: '#6b7280',
    fontWeight: '500',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '400px', // Ensure height stability
    maxHeight: '600px', // Or auto if you want page scroll
    overflowY: 'auto',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #f3f4f6',
    gap: '16px',
    transition: 'background-color 0.1s',
  },
  listIndex: {
    fontSize: '0.85rem',
    color: '#9ca3af',
    width: '40px', // Slightly wider for 2000 items
  },
  listContent: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  link: {
    color: '#374151',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontFamily: 'monospace',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  listActions: {
    display: 'flex',
    alignItems: 'center',
  },
  badgeSuccess: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    fontSize: '0.75rem',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  progressContainer: {
    marginTop: '4px',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
    color: '#6b7280',
    marginBottom: '6px',
    fontWeight: '500',
  },
  progressBarBg: {
    height: '8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    transition: 'width 0.3s ease',
  },
  notification: {
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontWeight: '500',
    fontSize: '0.95rem',
    animation: 'slideIn 0.3s ease-out',
  },
  emptyState: {
    padding: '60px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    color: '#9ca3af',
    textAlign: 'center',
  },
  paginationContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    borderTop: '1px solid #e5e7eb',
    gap: '12px',
    backgroundColor: '#f9fafb',
  },
  pageBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    cursor: 'pointer',
    color: '#374151',
    transition: 'all 0.2s',
  },
  pageInfo: {
    fontSize: '0.9rem',
    color: '#374151',
    minWidth: '100px',
    textAlign: 'center' as 'center',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    width: '90%',
    maxWidth: '600px',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '85vh',
  },
  modalHeader: {
    padding: '16px 24px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#111827',
  },
  rawTextarea: {
    flex: 1,
    margin: '20px',
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    resize: 'none',
    minHeight: '300px',
    outline: 'none',
  },
  modalActions: {
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    backgroundColor: '#f9fafb',
    borderBottomLeftRadius: '12px',
    borderBottomRightRadius: '12px',
  },
};

// Add global styles for animation and responsiveness
const styleEl = document.createElement('style');
styleEl.innerHTML = `
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 900px) {
    .mainGrid {
      grid-template-columns: 1fr !important;
    }
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
document.head.appendChild(styleEl);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);