import React from 'react';
import { FileText, BookOpen, CheckCircle, ListChecks } from 'lucide-react';

export type RightActivityId = 'preview' | 'outline' | 'qa';

interface RightActivityBarProps {
  activeActivity: RightActivityId;
  onActivityClick: (activityId: RightActivityId) => void;
  onTogglePanel?: () => void;
  isPanelVisible?: boolean;
}

const activities: Array<{ id: RightActivityId; label: string }> = [
  { id: 'preview', label: '预览' },
  { id: 'outline', label: '大纲' },
  { id: 'qa', label: '质检' },
];

const getActivityIcon = (id: RightActivityId) => {
  switch (id) {
    case 'preview':
      return <FileText size={20} />;
    case 'outline':
      return <BookOpen size={20} />;
    case 'qa':
      return <ListChecks size={20} />;
    default:
      return null;
  }
};

export const RightActivityBar: React.FC<RightActivityBarProps> = ({ 
  activeActivity, 
  onActivityClick,
  onTogglePanel,
  isPanelVisible 
}) => {
  return (
    <div 
      className="w-10 h-full flex flex-col items-center py-2 border-l"
      style={{
        backgroundColor: 'var(--color-vscode-activitybar)',
        borderColor: 'var(--color-vscode-border)',
      }}
    >
      <div className="flex-1 flex flex-col items-center">
        {activities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => onActivityClick(activity.id)}
            className="w-10 h-10 flex items-center justify-center mb-1 transition-all duration-200"
            style={{
              color: activeActivity === activity.id ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
              borderLeft: activeActivity === activity.id ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
              backgroundColor: activeActivity === activity.id ? 'rgba(0, 122, 204, 0.1)' : 'transparent',
            }}
            title={activity.label}
          >
            <span style={{ color: 'inherit' }}>
              {getActivityIcon(activity.id)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RightActivityBar;
