import React from 'react';
import { styles } from '../styles';

export const StatBox = ({ label, value, color, icon: Icon }: any) => (
  <div style={styles.statBox}>
    <div style={{...styles.statIcon, backgroundColor: `${color}20`, color: color}}>
      <Icon size={24} />
    </div>
    <div>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  </div>
);
