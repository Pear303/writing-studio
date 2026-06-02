import React, { useState } from 'react';
import { FileText, BookOpen, ListChecks } from 'lucide-react';

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
      return <FileText size={18} />;
    case 'outline':
      return <BookOpen size={18} />;
    case 'qa':
      return <ListChecks size={18} />;
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
  const [hoveredActivity, setHoveredActivity] = useState<string | null>(null);

  return (
    <div 
      className="w-10 h-full flex flex-col items-center py-2 border-l"
      style={{
        backgroundColor: 'var(--color-vscode-activitybar)',
        borderColor: 'var(--color-vscode-border)',
      }}
    >
      <div className="flex-1 flex flex-col items-center">
        {activities.map((activity) => {
          const isActive = activeActivity === activity.id;
          const isHovered = hoveredActivity === activity.id;
          return (
            <button
              key={activity.id}
              onClick={() => onActivityClick(activity.id)}
              onMouseEnter={() => setHoveredActivity(activity.id)}
              onMouseLeave={() => setHoveredActivity(null)}
              className="w-9 h-9 flex items-center justify-center mb-1 relative"
              style={{
                color: isActive ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
                transition: 'color 0.2s ease',
              }}
              title={activity.label}
            >
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  transform: `translateY(-50%) scaleX(${isActive ? 1 : 0})`,
                  width: '2px',
                  height: '18px',
                  backgroundColor: 'var(--color-vscode-active)',
                  borderRadius: '2px 0 0 2px',
                  transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '4px',
                  borderRadius: '5px',
                  backgroundColor: isActive ? 'var(--color-vscode-active-light)' : isHovered ? 'var(--color-hover-bg)' : 'transparent',
                  transition: 'background-color 0.15s ease',
                }}
              />
              <span style={{ color: 'inherit', position: 'relative', zIndex: 1, transition: 'transform 0.15s ease', transform: isHovered && !isActive ? 'scale(1.1)' : 'scale(1)' }}>
                {getActivityIcon(activity.id)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RightActivityBar;
