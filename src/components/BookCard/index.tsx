import React, { useState } from 'react';
import { BookOpen, Calendar, FileText } from 'lucide-react';
import type { Book } from '../../types';
import { formatTimestamp } from '../../utils/helpers';

interface BookCardProps {
  book: Book;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const BookCard = ({ book, onClick, onContextMenu }: BookCardProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const getStatusColor = () => {
    switch (book.status) {
      case 'ongoing':
        return '#007acc';
      case 'finished':
        return '#22c55e';
      case 'abandoned':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (book.status) {
      case 'ongoing':
        return '连载中';
      case 'finished':
        return '已完结';
      case 'abandoned':
        return '已弃坑';
      default:
        return '未知';
    }
  };

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        padding: '12px',
        cursor: 'pointer',
        backgroundColor: isHovered ? 'var(--color-vscode-sidebar)' : 'transparent',
        border: '1px solid',
        borderColor: isHovered ? 'var(--color-vscode-border)' : 'transparent',
        borderRadius: '8px',
        transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
        gap: '14px',
      }}
    >
      <div
        style={{
          width: '72px',
          minWidth: '72px',
          aspectRatio: '3/4',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, var(--color-vscode-border, #454545) 0%, var(--color-vscode-sidebar, #252526) 100%)',
          borderRadius: '6px',
        }}
      >
        {book.cover ? (
          <img src={book.cover} alt={book.name} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease', transform: isHovered ? 'scale(1.03)' : 'scale(1)' }} />
        ) : (
          <BookOpen size={28} className="text-vscode-text opacity-50" />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h3 style={{ color: 'var(--color-vscode-text)', fontWeight: 600, fontSize: '15px', marginBottom: '4px', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {book.name}
        </h3>

        <p style={{ fontSize: '12px', color: 'var(--color-vscode-text)', opacity: 0.65, marginBottom: '8px', lineHeight: '1.5', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {book.description || '暂无简介'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.55 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <FileText size={11} />
            <span>{book.totalWords.toLocaleString()} 字</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Calendar size={11} />
            <span>{formatTimestamp(book.updatedAt)}</span>
          </div>
          <div style={{
            padding: '1px 8px',
            backgroundColor: getStatusColor(),
            color: '#fff',
            fontSize: '10px',
            borderRadius: '10px',
            lineHeight: '1.4',
            alignSelf: 'flex-start',
          }}>
            {getStatusText()}
          </div>
        </div>
      </div>
    </div>
  );
};