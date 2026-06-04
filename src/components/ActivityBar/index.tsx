import React, { useState } from 'react';
import { BookOpen, Package, Bot, Settings, Workflow, PenLine, Trash2 } from 'lucide-react';
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
  { id: 'continue', label: '续写' },
  { id: 'recycleBin', label: '回收站' },
  { id: 'settings', label: '设置' },
];

const getActivityIcon = (id: ActivityId) => {
  switch (id) {
    case 'books':
      return <BookOpen size={22} />;
    case 'materials':
      return <Package size={22} />;
    case 'agent':
      return <Bot size={22} />;
    case 'pipeline':
      return <Workflow size={22} />;
    case 'continue':
      return <PenLine size={22} />;
    case 'recycleBin':
      return <Trash2 size={22} />;
    case 'settings':
      return <Settings size={22} />;
    default:
      return null;
  }
};

export const ActivityBar = ({ activeActivity, onActivityClick }: ActivityBarProps) => {
  const [hoveredActivity, setHoveredActivity] = useState<string | null>(null);

  const mainActivities = activities.filter(a => a.id !== 'settings' && a.id !== 'recycleBin');
  const bottomActivities = activities.filter(a => a.id === 'settings' || a.id === 'recycleBin');

  return (
    <div 
      className="w-activitybar h-full flex flex-col items-center py-2 border-r"
      style={{
        backgroundColor: 'var(--color-vscode-activitybar)',
        borderColor: 'var(--color-vscode-border)',
      }}
    >
      <div className="flex-1">
        {mainActivities.map((activity) => {
          const isActive = activeActivity === activity.id;
          const isHovered = hoveredActivity === activity.id;
          return (
            <button
              key={activity.id}
              onClick={() => onActivityClick(activity.id)}
              onMouseEnter={() => setHoveredActivity(activity.id)}
              onMouseLeave={() => setHoveredActivity(null)}
              className="w-12 h-12 flex items-center justify-center mb-1 relative group"
              style={{
                color: isActive ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
                transition: 'color 0.2s ease, background-color 0.15s ease',
              }}
              title={activity.label}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: `translateY(-50%) scaleX(${isActive ? 1 : 0})`,
                  width: '2px',
                  height: '24px',
                  backgroundColor: 'var(--color-vscode-active)',
                  borderRadius: '0 2px 2px 0',
                  transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '6px',
                  borderRadius: '6px',
                  backgroundColor: isActive ? 'var(--color-vscode-active-light)' : isHovered ? 'var(--color-hover-bg)' : 'transparent',
                  transition: 'background-color 0.15s ease',
                }}
              />
              <span style={{ color: 'inherit', position: 'relative', zIndex: 1, transition: 'transform 0.15s ease', transform: isHovered && !isActive ? 'scale(1.08)' : 'scale(1)' }}>
                {getActivityIcon(activity.id)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto">
        {bottomActivities.map((activity) => {
          const isActive = activeActivity === activity.id;
          const isHovered = hoveredActivity === activity.id;
          return (
            <button
              key={activity.id}
              onClick={() => onActivityClick(activity.id)}
              onMouseEnter={() => setHoveredActivity(activity.id)}
              onMouseLeave={() => setHoveredActivity(null)}
              className="w-12 h-12 flex items-center justify-center mb-1 relative group"
              style={{
                color: isActive ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
                transition: 'color 0.2s ease, background-color 0.15s ease',
              }}
              title={activity.label}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: `translateY(-50%) scaleX(${isActive ? 1 : 0})`,
                  width: '2px',
                  height: '24px',
                  backgroundColor: 'var(--color-vscode-active)',
                  borderRadius: '0 2px 2px 0',
                  transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '6px',
                  borderRadius: '6px',
                  backgroundColor: isActive ? 'var(--color-vscode-active-light)' : isHovered ? 'var(--color-hover-bg)' : 'transparent',
                  transition: 'background-color 0.15s ease',
                }}
              />
              <span style={{ color: 'inherit', position: 'relative', zIndex: 1, transition: 'transform 0.15s ease', transform: isHovered && !isActive ? 'scale(1.08)' : 'scale(1)' }}>
                {getActivityIcon(activity.id)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
