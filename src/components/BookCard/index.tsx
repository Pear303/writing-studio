import React from 'react';
import { BookOpen, Calendar, FileText } from 'lucide-react';
import type { Book } from '../../types';
import { formatTimestamp } from '../../utils/helpers';

interface BookCardProps {
  book: Book;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const BookCard = ({ book, onClick, onContextMenu }: BookCardProps) => {
  const getStatusColor = () => {
    switch (book.status) {
      case 'ongoing':
        return 'bg-[#007acc]';
      case 'finished':
        return 'bg-[#22c55e]';
      case 'abandoned':
        return 'bg-[#6b7280]';
      default:
        return 'bg-[#6b7280]';
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
      className="card card-hover p-4 cursor-pointer"
    >
      {/* 封面占位 - 调整宽高比 = 3:4 */}
      <div className="w-full aspect-[3/4] mb-3 flex items-left justify-left" style={{
        background: 'linear-gradient(135deg, var(--color-vscode-border, #454545) 0%, var(--color-vscode-sidebar, #252526) 100%)'
      }}>
        {book.cover ? (
          <img src={book.cover} alt={book.name} className="w-full h-full object-cover" />
        ) : (
          <BookOpen size={48} className="text-vscode-text opacity-50" />
        )}
      </div>

      {/* 书名 */}
      <h3 className="text-vscode-text font-semibold text-lg mb-2 leading-snug line-clamp-2">
        {book.name}
      </h3>

      {/* 简介 */}
      <p className="text-sm text-vscode-text opacity-70 mb-3 line-clamp-2 h-10 leading-relaxed">
        {book.description || '暂无简介'}
      </p>

      {/* 统计信息 */}
      <div className="flex items-center justify-between text-xs text-vscode-text opacity-60 mb-2">
        <div className="flex items-center space-x-1">
          <FileText size={12} />
          <span>{book.totalWords.toLocaleString()} 字</span>
        </div>
        <div className={`px-2 py-0.5 ${getStatusColor()} text-white text-xs`}>
          {getStatusText()}
        </div>
      </div>

      {/* 最后更新时间 */}
      <div className="flex items-center text-xs text-vscode-text opacity-60">
        <Calendar size={12} className="mr-1" />
        <span>{formatTimestamp(book.updatedAt)}</span>
      </div>
    </div>
  );
};

/*
父组件 (BookCardList)
  ↓ 循环遍历 books 数组
  ↓ 对每个 book 调用 <BookCard />
  ↓
BookCard 组件
  ↓ 接收 props (book, onClick, onContextMenu)
  ↓ 返回 JSX 对象
  ↓
React 引擎
  ↓ 将 JSX 转换为真实 DOM
  ↓
浏览器页面
  ↓ 显示书籍卡片
*/