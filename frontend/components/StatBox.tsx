import React from 'react';

interface StatBoxProps {
  label: string;
  value: number;
  color: string; // Hex color string, simplified for tailwind we might map this or just use style for dynamic color
  icon: React.ElementType;
}

export const StatBox = ({ label, value, color, icon: Icon }: StatBoxProps) => {
  // We use inline style for the specific dynamic colors to keep flexibility, 
  // but use Tailwind for layout.
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
      <div 
        className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15`, color: color }}
      >
        <Icon size={24} />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 leading-none mb-1">{value}</div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      </div>
    </div>
  );
};