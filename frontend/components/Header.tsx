import React from 'react';
import { Link } from 'lucide-react';

export const Header = () => {
  return (
    <header className="bg-white px-8 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md">
          <Link size={20} color="white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Sitemap Manager</h1>
      </div>
    </header>
  );
};