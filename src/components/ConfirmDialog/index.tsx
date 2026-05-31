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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="bg-vscode-sidebar border border-vscode-border w-[360px]"
        style={{ borderRadius: 0, boxShadow: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-vscode-border">
          <h3 className="text-lg font-semibold text-vscode-text">{title}</h3>
        </div>

        <div className="p-4">
          <p className="text-vscode-text">{message}</p>
        </div>

        <div className="flex justify-end space-x-3 px-4 py-3 border-t border-vscode-border">
          <button
            onClick={onCancel}
            className="btn-secondary px-4 py-2"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="btn-primary px-4 py-2"
            style={danger ? { color: 'var(--color-danger, #ef4444)' } : undefined}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
