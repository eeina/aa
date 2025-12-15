import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

interface SitemapUrlItem {
  _id: string;
  url: string;
  copied: boolean;
}

function App() {
  const [sitemapUrl, setSitemapUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [urls, setUrls] = useState<SitemapUrlItem[]>([]);
  const [currentDomain, setCurrentDomain] = useState<string>('');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSitemapUrl(event.target.value);
  };

  const fetchUrls = async (domain: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/urls?domain=${encodeURIComponent(domain)}`);
      if (response.ok) {
        const data = await response.json();
        setUrls(data);
      }
    } catch (error) {
      console.error('Error fetching URLs:', error);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setUrls([]);
    setCurrentDomain('');

    if (!sitemapUrl) {
      setMessage('Please enter a Sitemap XML URL.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/extract-sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrl }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`${data.message} ${data.newUrlsStored} new URLs added.`);
        setCurrentDomain(data.domain);
        await fetchUrls(data.domain);
      } else {
        setMessage(`Error: ${data.error || 'Something went wrong.'}`);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      setMessage('Network error: Could not connect to the backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNext10 = async () => {
    const uncopiedUrls = urls.filter(u => !u.copied);
    if (uncopiedUrls.length === 0) return;

    const batch = uncopiedUrls.slice(0, 10);
    const textToCopy = batch.map(u => u.url).join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      
      // Mark as copied in backend
      const urlStrings = batch.map(u => u.url);
      await fetch('http://localhost:3000/api/mark-copied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlStrings }),
      });

      // Update local state
      setUrls(prevUrls => prevUrls.map(u => 
        urlStrings.includes(u.url) ? { ...u, copied: true } : u
      ));

      setMessage(`Copied ${batch.length} URLs to clipboard!`);
    } catch (err) {
      console.error('Failed to copy!', err);
      setMessage('Failed to copy to clipboard.');
    }
  };

  const uncopiedCount = urls.filter(u => !u.copied).length;
  const copiedCount = urls.filter(u => u.copied).length;

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Sitemap URL Manager</h1>
      
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.inputGroup}>
          <input
            type="url"
            value={sitemapUrl}
            onChange={handleChange}
            placeholder="Enter Sitemap XML URL (e.g., https://site.com/sitemap.xml)"
            style={styles.input}
            required
          />
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Processing...' : 'Load Sitemap'}
          </button>
        </div>
      </form>

      {message && <div style={styles.message}>{message}</div>}

      {urls.length > 0 && (
        <div style={styles.resultsContainer}>
          <div style={styles.statsBar}>
            <div style={styles.statItem}>Total: <strong>{urls.length}</strong></div>
            <div style={styles.statItem}>Copied: <strong style={{color: '#28a745'}}>{copiedCount}</strong></div>
            <div style={styles.statItem}>Remaining: <strong style={{color: '#dc3545'}}>{uncopiedCount}</strong></div>
            
            <button 
              onClick={handleCopyNext10} 
              disabled={uncopiedCount === 0}
              style={{
                ...styles.copyButton,
                ...(uncopiedCount === 0 ? styles.buttonDisabled : {})
              }}
            >
              Copy Next 10 Uncopied
            </button>
          </div>

          <div style={styles.urlList}>
            {urls.map((item) => (
              <div key={item._id} style={{
                ...styles.urlItem,
                ...(item.copied ? styles.urlItemCopied : {})
              }}>
                <span style={styles.urlText}>{item.url}</span>
                <span style={styles.statusBadge}>
                  {item.copied ? '✅ Copied' : '⏳ Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    maxWidth: '900px',
    margin: '40px auto',
    padding: '25px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
  },
  header: {
    textAlign: 'center' as 'center',
    color: '#1a1a1a',
    marginBottom: '30px',
    fontSize: '2rem',
  },
  form: {
    marginBottom: '20px',
  },
  inputGroup: {
    display: 'flex',
    gap: '10px',
  },
  input: {
    flex: 1,
    padding: '15px',
    fontSize: '16px',
    border: '2px solid #e1e4e8',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  button: {
    padding: '0 25px',
    fontSize: '16px',
    fontWeight: '600',
    backgroundColor: '#0070f3',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  message: {
    marginBottom: '20px',
    padding: '12px',
    backgroundColor: '#f0f9ff',
    borderLeft: '4px solid #0070f3',
    borderRadius: '4px',
    color: '#004a87',
  },
  resultsContainer: {
    borderTop: '1px solid #eaeaea',
    paddingTop: '20px',
  },
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as 'wrap',
    gap: '15px',
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #eaeaea',
  },
  statItem: {
    fontSize: '1.1rem',
  },
  copyButton: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 'bold',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(40, 167, 69, 0.2)',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  urlList: {
    display: 'flex',
    flexDirection: 'column' as 'column',
    gap: '8px',
    maxHeight: '500px',
    overflowY: 'auto' as 'auto',
    border: '1px solid #eaeaea',
    borderRadius: '8px',
    padding: '10px',
    backgroundColor: '#fafafa',
  },
  urlItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 15px',
    backgroundColor: 'white',
    border: '1px solid #eee',
    borderRadius: '6px',
    transition: 'background 0.2s',
  },
  urlItemCopied: {
    backgroundColor: '#f0fff4',
    borderColor: '#d1e7dd',
    opacity: 0.8,
  },
  urlText: {
    fontSize: '14px',
    color: '#333',
    wordBreak: 'break-all' as 'break-all',
    marginRight: '15px',
  },
  statusBadge: {
    fontSize: '12px',
    fontWeight: 'bold',
    minWidth: '80px',
    textAlign: 'right' as 'right',
    color: '#666',
  }
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);