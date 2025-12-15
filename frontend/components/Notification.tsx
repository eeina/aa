import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

export const Notification = ({ message, type }: { message: string, type: string }) => {
  if (!message) return null;
  const isError = type === 'error';
  
  return (
    <div className={`mb-4 px-4 py-3 rounded-lg border flex items-center gap-3 shadow-sm animate-[slideIn_0.3s_ease-out] ${
      isError 
        ? 'bg-red-50 border-red-200 text-red-700' 
        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
    }`}>
      {isError ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
      <span className="font-medium text-sm">{message}</span>
    </div>
  );
};