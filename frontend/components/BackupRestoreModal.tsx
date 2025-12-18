import React, { useState, useRef } from 'react';
import { X, Download, Upload, AlertTriangle, FileJson, CheckCircle } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

interface BackupRestoreModalProps {
  show: boolean;
  onClose: () => void;
  onRestore: (file: File, clearBefore: boolean) => Promise<any>;
}

export const BackupRestoreModal = ({ show, onClose, onRestore }: BackupRestoreModalProps) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup');
  const [file, setFile] = useState<File | null>(null);
  const [clearBefore, setClearBefore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!show) return null;

  const handleBackup = () => {
    window.location.href = 'http://localhost:5000/api/backup';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatusMsg('');
    }
  };

  const handleRestoreSubmit = async () => {
    if (!file) return;
    if (!confirm('This will modify your database. Continue?')) return;

    setLoading(true);
    setStatusMsg('Restoring data... This may take a few minutes for large files.');
    try {
      const res = await onRestore(file, clearBefore);
      if (res.success) {
        setStatusMsg(res.message || 'Restore successful!');
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setStatusMsg('Error: ' + (res.error || 'Unknown error'));
      }
    } catch (e: any) {
      setStatusMsg('Connection Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-[fadeIn_0.2s]">
      <div className="bg-white rounded-xl shadow-2xl w-[90%] max-w-lg overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">Database Tools</h3>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            <X size={20} />
          </Button>
        </div>

        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('backup')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'backup' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Backup (Export)
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'restore' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Restore (Import)
          </button>
        </div>
        
        <div className="p-6">
          {activeTab === 'backup' ? (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                <Download size={32} />
              </div>
              <div>
                <h4 className="text-gray-900 font-semibold mb-2">Export Database</h4>
                <p className="text-sm text-gray-500">
                  Download a complete JSON backup of all Sitemaps and URLs. 
                  <br/>Designed for large datasets (streams data).
                </p>
              </div>
              <Button onClick={handleBackup} fullWidth icon={Download}>
                Download Backup
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Upload size={32} />
              </div>
              
              <div className="space-y-4">
                 <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors relative">
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept=".json"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={loading}
                    />
                    {file ? (
                      <div className="flex items-center justify-center gap-2 text-emerald-600 font-medium">
                        <FileJson size={20} /> {file.name}
                      </div>
                    ) : (
                      <div className="text-gray-500">
                        <p className="text-sm font-medium text-gray-700">Click to upload backup file</p>
                        <p className="text-xs mt-1">Accepts .json files</p>
                      </div>
                    )}
                 </div>

                 <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <input 
                      id="clear-db" 
                      type="checkbox" 
                      checked={clearBefore}
                      onChange={e => setClearBefore(e.target.checked)}
                      className="mt-1 w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                      disabled={loading}
                    />
                    <label htmlFor="clear-db" className="text-sm text-amber-800 cursor-pointer select-none">
                      <strong>Clear existing database before restore?</strong>
                      <p className="text-xs text-amber-700 mt-0.5">Checked: Wipes current data (Cleaner). <br/>Unchecked: Skips duplicates (Safer).</p>
                    </label>
                 </div>
              </div>

              {statusMsg && (
                 <div className={`text-sm p-3 rounded-lg flex items-center gap-2 ${statusMsg.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {statusMsg.includes('Error') ? <AlertTriangle size={16}/> : <CheckCircle size={16}/>}
                    {statusMsg}
                 </div>
              )}

              <Button 
                variant="success" 
                onClick={handleRestoreSubmit} 
                disabled={!file || loading} 
                fullWidth 
                icon={loading ? undefined : Upload}
              >
                {loading ? 'Restoring (Please Wait)...' : 'Start Restore'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};