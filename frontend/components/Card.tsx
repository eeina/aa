import React from 'react';
import { LucideIcon } from 'lucide-react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

export const Card = ({ children, title, icon: Icon, actions, className = '' }: CardProps) => (
  <div className={`bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden ${className}`}>
    {(title || actions) && (
      <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="bg-indigo-50 p-1.5 rounded-md text-indigo-600">
              <Icon size={18} />
            </div>
          )}
          {title && <h3 className="m-0 text-base font-semibold text-gray-800">{title}</h3>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    )}
    <div className="p-5">
      {children}
    </div>
  </div>
);