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
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.95rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    transition: 'all 0.2s ease',
    opacity: disabled ? 0.6 : 1,
    width: fullWidth ? '100%' : 'auto',
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: '#4f46e5',
      color: 'white',
      boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
    },
    success: {
      backgroundColor: '#10b981',
      color: 'white',
      boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
    },
    secondary: {
      backgroundColor: '#8b5cf6',
      color: 'white',
      boxShadow: '0 4px 6px -1px rgba(139, 92, 246, 0.2)',
    },
    danger: {
      backgroundColor: '#ef4444',
      color: 'white',
      boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.2)',
    },
    outline: {
      backgroundColor: 'transparent',
      border: '1px solid #d1d5db',
      color: '#374151',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: '#6b7280',
      padding: '6px',
    }
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      style={{...baseStyle, ...variants[variant]}}
      {...props}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};
