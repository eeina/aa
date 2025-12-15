import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { SitemapUrlItem } from '../types';

interface RawModalProps {
  show: boolean;
  onClose: () => void;
  urls: SitemapUrlItem[];
  onCopy: (text: string) => Promise<boolean | void>;
}

export const RawModal = ({ show, onClose, urls, onCopy }: RawModalProps) => {
  if (!show) return null;
  const textContent = urls.map(u => u.url).join('\n');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-[fadeIn_0.2s]">
      <div className="bg-white rounded-xl shadow-2xl w-[90%] max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">Raw List (Current Page)</h3>
          <Button variant="ghost" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        
        <div className="p-6 flex-1 overflow-hidden">
          <textarea
            readOnly
            value={textContent}
            className="w-full h-full min-h-[300px] p-4 border border-gray-300 rounded-lg font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-indigo-500 bg-gray-50 text-gray-600"
            onClick={(e) => e.currentTarget.select()}
          />
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => onCopy(textContent)}>
            Copy Page
          </Button>
        </div>
      </div>
    </div>
  );
};