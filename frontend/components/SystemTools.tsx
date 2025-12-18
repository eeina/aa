import React from 'react';
import { Database, Trash2 } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

interface SystemToolsProps {
  onOpenBackup: () => void;
  onClearDatabase: () => void;
  hasData: boolean;
}

export const SystemTools = ({ onOpenBackup, onClearDatabase, hasData }: SystemToolsProps) => {
  return (
    <Card title="System Tools" icon={Database}>
       <div className="flex flex-col gap-3">
         <Button variant="outline" onClick={onOpenBackup} fullWidth icon={Database}>
            Backup & Restore
         </Button>
         <Button 
            variant="danger" 
            onClick={onClearDatabase} 
            fullWidth 
            icon={Trash2}
            disabled={!hasData}
         >
            Clear Full Database
         </Button>
       </div>
    </Card>
  );
};