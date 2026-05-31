import React, { useEffect } from 'react';

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
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
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

  return (
    <div className="fixed top-2 right-2 z-[100]" style={{ pointerEvents: 'none' }}>
      <div
        className="px-2.5 py-1 text-xs"
        style={{
          backgroundColor: 'var(--color-vscode-sidebar, #252526)',
          color: 'var(--color-vscode-text, #cccccc)',
          borderLeft: `3px solid ${getColor()}`,
          borderTop: '1px solid var(--color-vscode-border)',
          borderRight: '1px solid var(--color-vscode-border)',
          borderBottom: '1px solid var(--color-vscode-border)',
          borderRadius: '2px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          whiteSpace: 'nowrap',
        }}
      >
        {message}
      </div>
    </div>
  );
};
