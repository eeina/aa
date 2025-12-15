import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'success' | 'outline' | 'ghost' | 'secondary' | 'danger';
  icon?: React.ElementType;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  disabled = false, 
  icon: Icon = null, 
  fullWidth = false,
  className = '',
  ...props
}) => {
  const baseClasses = "flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95";
  
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow",
    success: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm hover:shadow",
    secondary: "bg-purple-600 text-white hover:bg-purple-700 shadow-sm hover:shadow",
    danger: "bg-red-500 text-white hover:bg-red-600 shadow-sm hover:shadow",
    outline: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50",
    ghost: "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700 p-1.5"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      className={`${baseClasses} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={2} />}
      {children}
    </button>
  );
};