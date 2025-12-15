import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { styles } from '../styles';

export const Notification = ({ message, type }: { message: string, type: string }) => {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div style={{
      ...styles.notification,
      backgroundColor: isError ? '#fef2f2' : '#ecfdf5',
      borderColor: isError ? '#fca5a5' : '#6ee7b7',
      color: isError ? '#991b1b' : '#065f46',
    }}>
      {isError ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
      <span>{message}</span>
    </div>
  );
};
