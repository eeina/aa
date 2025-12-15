import React from 'react';
import { styles } from '../styles';

export const Card = ({ children, title, icon: Icon, actions }: any) => (
  <div style={styles.card}>
    {(title || actions) && (
      <div style={styles.cardHeader}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
          {Icon && <div style={styles.iconBox}><Icon size={20} color="#4f46e5"/></div>}
          {title && <h3 style={styles.cardTitle}>{title}</h3>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
    )}
    <div style={styles.cardContent}>
      {children}
    </div>
  </div>
);
