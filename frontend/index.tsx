import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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
