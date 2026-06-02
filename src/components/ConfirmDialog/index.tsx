import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmText = '确认删除',
  cancelText = '取消',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        className="bg-vscode-sidebar border border-vscode-border w-[360px] animate-scale-in"
        style={{ borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-vscode-border">
          <h3 className="text-base font-semibold text-vscode-text">{title}</h3>
        </div>

        <div className="p-4">
          <p className="text-sm text-vscode-text leading-relaxed">{message}</p>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-vscode-border">
          <button
            onClick={onCancel}
            className="btn-secondary px-4 py-1.5 text-sm"
            style={{ borderRadius: '6px', transition: 'background-color 0.15s ease' }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="btn-primary px-4 py-1.5 text-sm"
            style={{ 
              borderRadius: '6px', 
              transition: 'background-color 0.15s ease',
              ...(danger ? { color: 'var(--color-danger, #ef4444)' } : {}),
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
