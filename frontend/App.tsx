import React, { useState } from 'react';
import { Header } from './components/Header';
import { SitemapInput } from './components/SitemapInput';
import { StatsOverview } from './components/StatsOverview';
import { ActionPanel } from './components/ActionPanel';
import { UrlListView } from './components/UrlListView';
import { SitemapListView } from './components/SitemapListView';
import { RawModal } from './components/RawModal';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { Notification } from './components/Notification';
import { useSitemapManager } from './hooks/useSitemapManager';

export default function App() {
  const [activeTab, setActiveTab] = useState<'urls' | 'sitemaps'>('urls');
  const [showRawModal, setShowRawModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const m = useSitemapManager();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      <Header />
      <main className="flex-1 w-full max-w-[1400px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        <div className="flex flex-col gap-6">
          <SitemapInput 
            sitemapUrl={m.sitemapUrl} setSitemapUrl={m.setSitemapUrl}
            filterPattern={m.extractionFilter} setFilterPattern={m.setExtractionFilter}
            enableQualityFilter={m.enableQualityFilter} setEnableQualityFilter={m.setEnableQualityFilter}
            loading={m.loading} onExtract={m.handleExtract} 
          />
          {(m.stats.totalUrls > 0 || m.sitemaps.length > 0) && (
            <>
              <ActionPanel 
                loading={m.loading} stats={m.stats} filterStatus={m.filterStatus} searchTerm={m.searchTerm}
                onCopyNextBatch={(n) => m.copyNextBatch(n)} onCopyAllPending={() => m.copyAllPending()} 
                onCopyPagePending={m.copyPagePending} onShowRaw={() => setShowRawModal(true)} 
                onClearDatabase={m.handleClearDatabase} pageHasPending={m.urls.some(u => !u.copied)}
                onOpenBackup={() => setShowBackupModal(true)}
              />
              <StatsOverview stats={m.stats} />
            </>
          )}
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <Notification message={m.toast.msg} type={m.toast.type} />
          <div className="flex gap-4 border-b border-gray-200">
             {['urls', 'sitemaps'].map((tab) => (
               <button key={tab} onClick={() => setActiveTab(tab as any)}
                 className={`pb-2 px-4 font-medium text-sm border-b-2 transition-colors capitalize ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                 {tab === 'urls' ? 'Content URLs' : `Managed Sitemaps (${m.sitemaps.length})`}
               </button>
             ))}
          </div>
          {activeTab === 'urls' ? (
            <UrlListView 
              urls={m.urls} pagination={m.pagination} statsTotal={m.stats.totalUrls}
              filterStatus={m.filterStatus} setFilterStatus={m.setFilterStatus}
              searchTerm={m.searchTerm} setSearchTerm={m.setSearchTerm}
              onCopySingle={m.copySingle} onDeleteSingle={m.deleteUrl} onPageChange={m.handlePageChange}
            />
          ) : (
            <SitemapListView 
              sitemaps={m.sitemaps} onCopy={m.copyText} onCopyUrls={m.copySitemapChildUrls}
              onCopyNextBatch={m.copySitemapNextBatch} onCopyPending={m.copySitemapPending} 
              onDelete={m.deleteSitemap} onProcessQuality={m.processQualityBatch}
            />
          )}
        </div>
      </main>
      <RawModal show={showRawModal} onClose={() => setShowRawModal(false)} urls={m.urls} onCopy={m.copyText} />
      <BackupRestoreModal show={showBackupModal} onClose={() => setShowBackupModal(false)} onRestore={m.handleRestore} />
    </div>
  );
}