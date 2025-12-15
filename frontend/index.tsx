import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [newUrlsStored, setNewUrlsStored] = useState<number | null>(null);
  const [totalUrlsFound, setTotalUrlsFound] = useState<number | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setWebsiteUrl(event.target.value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setNewUrlsStored(null);
    setTotalUrlsFound(null);

    if (!websiteUrl) {
      setMessage('Please enter a website URL.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/extract-sitemap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: websiteUrl }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        setNewUrlsStored(data.newUrlsStored);
        setTotalUrlsFound(data.totalUrlsFound);
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

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Sitemap Extractor</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="url"
          value={websiteUrl}
          onChange={handleChange}
          placeholder="Enter website URL (e.g., https://example.com)"
          aria-label="Website URL"
          style={styles.input}
          required
        />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Processing...' : 'Extract & Store Sitemaps'}
        </button>
      </form>

      {message && (
        <div style={styles.message}>
          <p>{message}</p>
          {newUrlsStored !== null && <p>New URLs stored: {newUrlsStored}</p>}
          {totalUrlsFound !== null && <p>Total URLs found: {totalUrlsFound}</p>}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    fontFamily: 'Arial, sans-serif',
    maxWidth: '800px',
    margin: '50px auto',
    padding: '20px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    backgroundColor: '#f9f9f9',
    textAlign: 'center' as 'center',
  },
  header: {
    color: '#333',
    marginBottom: '30px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as 'column',
    gap: '15px',
    marginBottom: '20px',
  },
  input: {
    padding: '12px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    width: '100%',
    boxSizing: 'border-box' as 'border-box',
  },
  button: {
    padding: '12px 20px',
    fontSize: '16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.3s ease',
  },
  buttonHover: {
    backgroundColor: '#0056b3',
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
    cursor: 'not-allowed',
  },
  message: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#e9ecef',
    border: '1px solid #dee2e6',
    borderRadius: '4px',
    color: '#333',
    textAlign: 'left' as 'left',
  },
};


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);