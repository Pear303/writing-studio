import React, { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export const Toast = ({
  message,
  type = 'info',
  duration = 1500,
  onClose,
}: ToastProps) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(onClose, 250);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getColor = () => {
    switch (type) {
      case 'error':
        return 'var(--color-danger, #ef4444)';
      case 'warning':
        return 'var(--color-toast-warning, #eab308)';
      case 'success':
        return 'var(--color-success, #22c55e)';
      default:
        return 'var(--color-toast-info, #3b82f6)';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '!';
      default:
        return 'i';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[100]" style={{ pointerEvents: 'none' }}>
      <div
        className={isExiting ? 'animate-slide-out' : 'animate-slide-in'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          backgroundColor: 'var(--color-vscode-sidebar, #252526)',
          color: 'var(--color-vscode-text, #cccccc)',
          border: `1px solid var(--color-vscode-border)`,
          borderLeft: `3px solid ${getColor()}`,
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          whiteSpace: 'nowrap',
          fontSize: '13px',
          pointerEvents: 'auto',
        }}
      >
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: getColor(),
          color: '#fff',
          fontSize: '11px',
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {getIcon()}
        </span>
        <span>{message}</span>
      </div>
    </div>
  );
};
