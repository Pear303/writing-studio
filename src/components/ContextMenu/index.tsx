import React, { useEffect, useRef } from 'react';

export type MenuItem = {
  icon?: React.ReactNode;
  danger?: boolean;
} & (
  | { type?: 'item'; label: string; onClick: () => void }
  | { type: 'divider'; label?: never; onClick?: never }
);

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export const ContextMenu = ({ x, y, items, onClose }: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 40);

  return (
    <div
      ref={menuRef}
      className="fixed bg-vscode-sidebar border border-vscode-border py-1 z-50 min-w-[160px] animate-dropdown-in"
      style={{ borderRadius: '6px', left: adjustedX, top: adjustedY, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
    >
      {items.map((item, index) =>
        item.type === 'divider' ? (
          <div key={index} className="border-t border-vscode-border my-1" />
        ) : (
          <button
            key={index}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`w-full px-3 py-1.5 text-sm text-left flex items-center gap-2 ${
              item.danger
                ? 'hover:bg-red-500/10'
                : 'text-vscode-text hover:bg-vscode-active/10'
            }`}
            style={{
              color: item.danger ? 'var(--color-danger, #ef4444)' : undefined,
              transition: 'background-color 0.1s ease',
            }}
          >
            {item.icon && <span className="w-4 h-4 shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
};
