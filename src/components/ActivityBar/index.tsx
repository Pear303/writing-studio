import React, { useState } from 'react';
import { BookOpen, Package, Bot, Settings, Workflow } from 'lucide-react';
import type { ActivityId } from '../../types';

interface ActivityBarProps {
  activeActivity: ActivityId;
  onActivityClick: (activityId: ActivityId) => void;
}

const activities: Array<{ id: ActivityId; label: string }> = [
  { id: 'books', label: '书籍' },
  { id: 'materials', label: '素材箱' },
  { id: 'agent', label: 'Agent' },
  { id: 'pipeline', label: '流水线写作' },
  { id: 'settings', label: '设置' },
];

const getActivityIcon = (id: ActivityId) => {
  switch (id) {
    case 'books':
      return <BookOpen size={24} />;
    case 'materials':
      return <Package size={24} />;
    case 'agent':
      return <Bot size={24} />;
    case 'pipeline':
      return <Workflow size={24} />;
    case 'settings':
      return <Settings size={24} />;
    default:
      return null;
  }
};

export const ActivityBar = ({ activeActivity, onActivityClick }: ActivityBarProps) => {
  const [hoveredActivity, setHoveredActivity] = useState<string | null>(null);

  const mainActivities = activities.filter(a => a.id !== 'settings');
  const bottomActivities = activities.filter(a => a.id === 'settings');

  return (
    <div 
      className="w-activitybar h-full flex flex-col items-center py-2 border-r"
      style={{
        backgroundColor: 'var(--color-vscode-activitybar)',
        borderColor: 'var(--color-vscode-border)',
      }}
    >
      <div className="flex-1">
        {mainActivities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => onActivityClick(activity.id)}
            onMouseEnter={() => setHoveredActivity(activity.id)}
            onMouseLeave={() => setHoveredActivity(null)}
            className="w-12 h-12 flex items-center justify-center mb-2 transition-all duration-200"
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

      <div className="mt-auto">
        {bottomActivities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => onActivityClick(activity.id)}
            onMouseEnter={() => setHoveredActivity(activity.id)}
            onMouseLeave={() => setHoveredActivity(null)}
            className="w-12 h-12 flex items-center justify-center mb-2 transition-all duration-200"
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
