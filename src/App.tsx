import { useState, useRef, useEffect, useLayoutEffect, use, useContext } from 'react';
import { ActivityBar } from './components/ActivityBar';
import { Sidebar } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { StatusBar } from './components/StatusBar';
import { FindReplace } from './components/FindReplace';
import { FormattingSettingsPanel } from './components/FormattingSettingsPanel';
import { PromptPreviewPanel } from './components/PromptPreview';
import { Toast, type ToastType } from './components/Toast';
import { Toolbar } from './components/Toolbar';
import { TabView, type TabItem } from './components/TabView';
import { RightActivityBar, type RightActivityId } from './components/RightActivityBar';
import { VolumeTree } from './components/VolumeTree';
import { OutlineEditor, type OutlineEditorRef } from './components/OutlineEditor';
import { DetailedOutlineEditor } from './components/DetailedOutlineEditor';
import { MaterialEditor } from './components/MaterialEditor';
import { QAPanel } from './components/QAPanel';
import type { RichTextEditorRef } from './components/RichTextEditor';
import type { ActivityId, Book, Chapter, Volume, FormattingSettings, Material, OutlineItemData, WordCountSettings, PipelineStep1Config, PipelineStep2State, PipelineStep4State, PipelineStep5State, OutlineRound, DetailedOutlineRound, ChapterDraftRound } from './types';
import { db, saveChapterVersion, cleanupOldVersions, exportAllData, importAllData, getDefaultLLMConfig, decodeApiKey } from './db';
import { countWords, clearExtraBlankLines, clearExtraSpaces, convertFullWidthToHalfWidth, markdownToOutline } from './utils/helpers';
import { getSearchReplaceCommands } from './extensions/searchReplace';

import { useUser } from './auth/UserContext';
import { novelLLMService } from './llm/NovelLLMService';
import { useAgent } from './hooks/useAgent';
import { usePipeline } from './hooks/usePipeline';
import './App.css';
import { LogOut, FileText, BookOpen, CheckCircle } from 'lucide-react';

type Theme = 'dark' | 'light' | 'eye-care';

// 写作目标接口
interface WritingGoal {
  dailyTarget: number; // 每日字数目标
  chapterTarget: number; // 本章字数目标
  enabled: boolean;
}

// 番茄钟状态
interface PomodoroState {
  isRunning: boolean;
  timeLeft: number; // 剩余秒数
  mode: 'work' | 'break'; // 工作模式或休息模式
  workDuration: number; // 工作时长（分钟）
  breakDuration: number; // 休息时长（分钟）
  completedSessions: number; // 完成的专注次数
}

// 侧边栏宽度配置
const SIDEBAR_MIN_WIDTH = 80;  // 拖动隐藏阈值
const SIDEBAR_DEFAULT_WIDTH = 330;  // 默认宽度
const EDITOR_MIN_WIDTH = 400;    // 编辑器最小宽度

function App() {
  const [activeActivity, setActiveActivity] = useState<ActivityId>('books');
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [currentOutlineVolume, setCurrentOutlineVolume] = useState<Volume | null>(null);
  const [currentOutlineChapter, setCurrentOutlineChapter] = useState<Chapter | null>(null);
  const [currentMaterial, setCurrentMaterial] = useState<Material | null>(null);
  const [pipelinePreview, setPipelinePreview] = useState<{ title: string; content: string; onChange: (content: string) => void } | null>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [lastSearchText, setLastSearchText] = useState('');
  const [showFormattingSettings, setShowFormattingSettings] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const handleCtrlF = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(true);
      }
    };
    document.addEventListener('keydown', handleCtrlF);
    return () => document.removeEventListener('keydown', handleCtrlF);
  }, []);
  
  // 使用 useUser hook 获取用户认证状态
  const { user } = useUser();

  const agent = useAgent();
  const pipeline = usePipeline();

  useEffect(() => {
    if (activeActivity === 'agent' && !agent.state.connected) {
      agent.checkConnection();
    }
  }, [activeActivity]);

  useEffect(() => {
    const applyStartupWindowMode = async () => {
      try {
        const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
        if (!isTauri) return;

        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();
        const mode = localStorage.getItem('startupWindowMode') || 'maximized';

        if (mode === 'fullscreen') {
          await appWindow.setFullscreen(true);
        } else {
          await appWindow.maximize();
        }
      } catch (err) {
        console.warn('[App] 应用启动窗口模式失败:', err);
      }
    };
    applyStartupWindowMode();
  }, []);

  const [formattingSettings, setFormattingSettings] = useState<FormattingSettings>({
    paragraphSpacing: '1em',
    firstLineIndent: '2char',
    clearExtraBlankLines: true,
    clearExtraSpaces: true,
    convertPunctuation: false,
  });

  const [wordCountSettings, setWordCountSettings] = useState<WordCountSettings>(() => {
    const saved = localStorage.getItem('wordCountSettings');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return { includePunctuation: false, englishMode: 'word' };
  });

  // 行间距（编辑器实时预览用）
  const [lineHeight, setLineHeight] = useState('1.5');

  // 刷新目录树
  const [outlineRefreshTrigger, setOutlineRefreshTrigger] = useState(0);
  
  // 新增状态
  const [isFullScreen, setIsFullScreen] = useState(false); // 专注模式
  const [agentSyncing, setAgentSyncing] = useState(false);
  const [writingGoal, setWritingGoal] = useState<WritingGoal>({
    dailyTarget: 3000,
    chapterTarget: 5000,
    enabled: false,
  });
  const [pomodoro, setPomodoro] = useState<PomodoroState>({
    isRunning: false,
    timeLeft: 25 * 60, // 25分钟
    mode: 'work',
    workDuration: 25,
    breakDuration: 5,
    completedSessions: 0,
  });
  const [todayWordCount, setTodayWordCount] = useState(0); // 今日已写字数

  // 标签页状态
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(240);
  const [rightActivity, setRightActivity] = useState<'preview' | 'outline' | 'qa'>('preview');
  const [isRightResizing, setIsRightResizing] = useState(false);
  const [volumesWithChapters, setVolumesWithChapters] = useState<Set<string>>(new Set());

  // 右侧面板拖拽
  const rightDragStartXRef = useRef(0);
  const rightStartWidthRef = useRef(0);
  const rightIsResizingRef = useRef(false);

  const handleRightPanelDragStart = (e: React.MouseEvent) => {
    rightDragStartXRef.current = e.clientX;
    rightStartWidthRef.current = rightPanelWidth;
    rightIsResizingRef.current = true;
    setIsRightResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleRightPanelDrag = (e: MouseEvent) => {
    if (!rightIsResizingRef.current) return;

    const deltaX = rightDragStartXRef.current - e.clientX;
    let newWidth = rightStartWidthRef.current + deltaX;

    newWidth = Math.max(200, Math.min(800, newWidth));
    setRightPanelWidth(newWidth);
  };

  const handleRightPanelDragEnd = () => {
    rightIsResizingRef.current = false;
    setIsRightResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    if (isRightResizing) {
      document.addEventListener('mousemove', handleRightPanelDrag);
      document.addEventListener('mouseup', handleRightPanelDragEnd);
    }
    return () => {
      document.removeEventListener('mousemove', handleRightPanelDrag);
      document.removeEventListener('mouseup', handleRightPanelDragEnd);
    };
  }, [isRightResizing]);

  // 编辑器引用
  const editorRef = useRef<RichTextEditorRef>(null);
  const outlineEditorRef = useRef<OutlineEditorRef>(null);
  const pomodoroTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 显示Toast通知
  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  // 标签页操作函数
  const handleTabChange = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const handleTabClose = (tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
      }
      return newTabs;
    });
  };

  const handleTabAdd = (title: string) => {
    const newTab: TabItem = {
      id: `tab_${Date.now()}`,
      title,
      content: '',
      mode: 'preview',
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleModeChange = (tabId: string, mode: 'source' | 'preview') => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, mode } : t));
  };

  const handleImportFromTab = (content: string, title: string) => {
    if (!currentChapter) {
      showToast('请先选择一个章节', 'warning');
      return;
    }
    const newContent = editorContent + '\n\n' + content;
    setEditorContent(newContent);
    setSaveStatus('unsaved');
    showToast(`已导入: ${title}`, 'success');
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && saveStatus === 'unsaved') {
        autoSave();
      }
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved') {
        autoSave();
        e.preventDefault();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveStatus]);

  // ========== 清理防抖定时器（防止内存泄漏）==========
  useEffect(() => {
    return () => {
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current);
      }
    };
  }, []);

  // ========== 阅读时间估算 ==========
  const getReadingTime = () => {
    const wordsPerMinute = 300; // 平均阅读速度
    const minutes = Math.ceil(wordCount / wordsPerMinute);
    if (minutes < 1) return '不到1分钟';
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分钟` : `${hours}小时`;
  };

  // ========== 写作目标管理 ==========
  useEffect(() => {
    // 加载写作目标设置
    const saved = localStorage.getItem('writingGoal');
    if (saved) {
      try {
        setWritingGoal(JSON.parse(saved));
      } catch (e) {
        console.error('加载写作目标失败:', e);
      }
    }
    
    // 加载今日字数统计
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('writingGoalDate');
    const savedCount = localStorage.getItem('todayWordCount');
    if (savedDate === today && savedCount) {
      setTodayWordCount(parseInt(savedCount, 10));
    } else {
      // 新的一天，重置计数
      setTodayWordCount(0);
      localStorage.setItem('writingGoalDate', today);
    }
  }, []);

  // 更新今日字数并检查目标
  useEffect(() => {
    if (wordCount > 0) {
      const increment = wordCount - (parseInt(localStorage.getItem('lastWordCount') || '0', 10));
      if (increment > 0) {
        const newTodayCount = todayWordCount + increment;
        setTodayWordCount(newTodayCount);
        localStorage.setItem('todayWordCount', newTodayCount.toString());
        localStorage.setItem('lastWordCount', wordCount.toString());
        
        // 检查是否达成目标
        if (writingGoal.enabled && writingGoal.dailyTarget > 0) {
          if (newTodayCount >= writingGoal.dailyTarget && todayWordCount < writingGoal.dailyTarget) {
            showToast(`🎉 恭喜！今日字数目标已达成（${writingGoal.dailyTarget}字）`, 'success');
          }
        }
      }
    }
  }, [wordCount]);

  // ========== 番茄钟计时器 ==========
  useEffect(() => {
    if (pomodoro.isRunning) {
      pomodoroTimerRef.current = setInterval(() => {
        setPomodoro(prev => {
          if (prev.timeLeft <= 1) {
            // 计时结束
            clearInterval(pomodoroTimerRef.current!);
            
            if (prev.mode === 'work') {
              // 工作结束，进入休息
              showToast('专注时间结束！休息一下吧 ☕', 'success');
              return {
                ...prev,
                isRunning: false,
                timeLeft: prev.breakDuration * 60,
                mode: 'break',
                completedSessions: prev.completedSessions + 1,
              };
            } else {
              // 休息结束
              showToast('休息结束！准备开始新的专注 💪', 'info');
              return {
                ...prev,
                isRunning: false,
                timeLeft: prev.workDuration * 60,
                mode: 'work',
              };
            }
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    } else {
      if (pomodoroTimerRef.current) {
        clearInterval(pomodoroTimerRef.current);
      }
    }

    return () => {
      if (pomodoroTimerRef.current) {
        clearInterval(pomodoroTimerRef.current);
      }
    };
  }, [pomodoro.isRunning]);

  // 番茄钟控制函数
  const togglePomodoro = () => {
    setPomodoro(prev => ({ ...prev, isRunning: !prev.isRunning }));
  };

  const resetPomodoro = () => {
    setPomodoro(prev => ({
      ...prev,
      isRunning: false,
      timeLeft: prev.mode === 'work' ? prev.workDuration * 60 : prev.breakDuration * 60,
    }));
  };

  const switchPomodoroMode = () => {
    setPomodoro(prev => ({
      ...prev,
      isRunning: false,
      mode: prev.mode === 'work' ? 'break' : 'work',
      timeLeft: prev.mode === 'work' ? prev.breakDuration * 60 : prev.workDuration * 60,
    }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ========== 专注模式（禅）==========
  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
    if (!isFullScreen) {
      showToast('已进入专注模式，按 F11 退出', 'info');
    }
  };

  // 根据主题获取颜色类并更新CSS变量
  const getThemeClasses = () => {
    let colors;
    switch (theme) {
      case 'light':
        colors = {
          bg: '#ffffff',
          sidebar: '#f5f5f5',
          activitybar: '#e8e8e8',
          border: '#e0e0e0',
          text: '#000000',
          active: '#007acc',
        };
        break;
      case 'eye-care':
        colors = {
          bg: '#f5f5dc',
          sidebar: '#e8e8d0',
          activitybar: '#d8d8c0',
          border: '#d0d0b8',
          text: '#222222',
          active: '#8fbc8f',
        };
        break;
      default: // dark
        colors = {
          bg: '#1e1e1e',
          sidebar: '#252526',
          activitybar: '#333333',
          border: '#454545',
          text: '#e2e2e2',
          active: '#007acc',
        };
    }

    document.documentElement.setAttribute('data-theme', theme);

    return {
      bg: 'bg-vscode-bg',
      sidebar: 'bg-vscode-sidebar',
      text: 'text-vscode-text',
      border: 'border-vscode-border',
      active: 'bg-vscode-active',
    };
  };

  useLayoutEffect(() => {
    getThemeClasses();
  }, [theme]);

  const dragStartXRef = useRef(0);
  const startWidthRef = useRef(0);
  const isResizingRef = useRef(false);
  
  const handleSidebarDragStart = (e: React.MouseEvent) => {
    dragStartXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  
  const handleSidebarDrag = (e: MouseEvent) => {
    if (!isResizingRef.current) return;
    
    const deltaX = e.clientX - dragStartXRef.current;
    let newWidth = startWidthRef.current + deltaX;
    
    const maxAllowedWidth = window.innerWidth - EDITOR_MIN_WIDTH - 48;
    
    newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(newWidth, maxAllowedWidth));
    
    if (newWidth < SIDEBAR_MIN_WIDTH) {
      setIsSidebarVisible(false);
      setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    } else {
      if (!isSidebarVisible) {
        setIsSidebarVisible(true);
      }
      setSidebarWidth(newWidth);
    }
  };

  const handleSidebarDragEnd = () => {
    isResizingRef.current = false;
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleSidebarDrag);
      document.addEventListener('mouseup', handleSidebarDragEnd);
    }
    return () => {
      document.removeEventListener('mousemove', handleSidebarDrag);
      document.removeEventListener('mouseup', handleSidebarDragEnd);
    };
  }, [isResizing]);

  // 自动保存定时器
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const AUTO_SAVE_INTERVAL = 30000; // 30秒

  // 设置自动保存
  useEffect(() => {
    if (currentChapter && saveStatus === 'unsaved') {
      // 清除之前的定时器
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // 设置新的定时器
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave();
      }, AUTO_SAVE_INTERVAL);
    }

    // 清理函数
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [currentChapter, saveStatus, editorContent]);

  // Agent 数据桥接：当前书籍变更时自动导出 + 启动 pending 轮询
  useEffect(() => {
    let mounted = true;

    const initBridge = async () => {
      try {
        const { exportCurrentBookForAgent } = await import('./bridge/exporter');
        const { startWatcher, stopWatcher, checkNow } = await import('./bridge/watcher');

        stopWatcher();

        if (currentBook?.id) {
          await exportCurrentBookForAgent(currentBook.id);
        }

        if (mounted) {
          startWatcher(3000);
        }
      } catch (err) {
        console.warn('[AgentBridge] 初始化失败（Tauri 环境可能未就绪）:', err);
      }
    };

    initBridge();

    return () => {
      mounted = false;
      import('./bridge/watcher').then(({ stopWatcher }) => stopWatcher()).catch(() => {});
    };
  }, [currentBook?.id]);

  // 手动同步当前书籍数据到 Agent
  const handleSyncToAgent = async () => {
    if (!currentBook?.id) {
      showToast('请先选择一本书', 'warning');
      return;
    }
    if (agentSyncing) return;
    setAgentSyncing(true);
    try {
      const { exportCurrentBookForAgent } = await import('./bridge/exporter');
      const { checkNow } = await import('./bridge/watcher');
      await exportCurrentBookForAgent(currentBook.id);
      await checkNow();
      showToast('已同步到 Agent', 'success');
    } catch (err) {
      console.error('[AgentBridge] 同步失败:', err);
      showToast('同步失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setAgentSyncing(false);
    }
  };

  // 快速自动保存（跳过版本快照、验证、清理等冗余操作）
  const autoSave = async () => {
    if (!currentChapter || saveStatus === 'saved') return;
    try {
      await db.chapters.update(currentChapter.id, {
        content: editorContent,
        wordCount: countWords(editorContent, wordCountSettings),
        updatedAt: Date.now(),
      });
      setSaveStatus('saved');
    } catch (e) {
      console.error('[自动保存] 失败:', e);
    }
  };

  // 处理书籍选择
  const handleBookSelect = async (book: Book) => {
    await autoSave();
    setCurrentBook(book);
    setCurrentChapter(null);
    setCurrentOutlineVolume(null);
    setCurrentOutlineChapter(null);
    setEditorContent('');
    setWordCount(0);
    setSaveStatus('saved');
  };

  const handleBookDeselect = async () => {
    await autoSave();
    setCurrentBook(null);
    setCurrentChapter(null);
    setCurrentOutlineVolume(null);
    setCurrentOutlineChapter(null);
    setEditorContent('');
    setWordCount(0);
    setSaveStatus('saved');
  };

  // 处理章节选择
  const handleChapterSelect = async (chapter: Chapter) => {
    await autoSave();
    setCurrentOutlineVolume(null);
    setCurrentOutlineChapter(null);
    setPipelinePreview(null);
    console.log('[章节选择] 选择章节:', chapter.id);
    
    // 从数据库重新读取最新内容，确保数据是最新的
    const latestChapter = await db.chapters.get(chapter.id);
    
    if (!latestChapter) {
      console.error('[章节选择] 章节不存在:', chapter.id);
      return;
    }
    
    console.log('[章节选择] 加载内容长度:', latestChapter.content?.length || 0);
    console.log('[章节选择] 字数:', latestChapter.wordCount);
    
    setCurrentChapter(latestChapter);
    setEditorContent(latestChapter.content || '');
    setWordCount(latestChapter.wordCount || 0);
    setSaveStatus('saved');
  };

  // 处理卷大纲选择（从右侧面板触发）
  const handleVolumeOutlineSelect = async (volume: Volume) => {
    await autoSave();
    setCurrentChapter(null);
    setEditorContent('');
    setWordCount(0);
    setSaveStatus('saved');
    setPipelinePreview(null);
    setCurrentOutlineChapter(null);
    setCurrentOutlineVolume(volume);
  };

  // 处理章节细纲选择（从右侧面板触发）
  const handleChapterOutlineSelect = async (chapter: Chapter) => {
    await autoSave();
    setCurrentChapter(null);
    setEditorContent('');
    setWordCount(0);
    setSaveStatus('saved');
    setPipelinePreview(null);
    setCurrentOutlineVolume(null);
    setCurrentOutlineChapter(chapter);
  };

  // 处理章节细纲保存后的回调
  const handleDetailedOutlineSave = (chapter: Chapter) => {
    setCurrentOutlineChapter(chapter);
    setOutlineRefreshTrigger(prev => prev + 1);
  };

  // 处理卷大纲保存后的回调
  const handleOutlineSave = (volume: Volume) => {
    setCurrentOutlineVolume(volume);
    setOutlineRefreshTrigger(prev => prev + 1);
  };

  // 计算哪些卷包含章节
  useEffect(() => {
    if (!currentBook) {
      setVolumesWithChapters(new Set());
      return;
    }
    const load = async () => {
      const allChapters = await db.chapters.where('bookId').equals(currentBook.id).toArray();
      const volumeIds = new Set<string>();
      allChapters.forEach(c => { if (c.volumeId) volumeIds.add(c.volumeId); });
      setVolumesWithChapters(volumeIds);
    };
    load();
  }, [currentBook?.id, outlineRefreshTrigger]);

  // 大纲提炼
  const handleOutlineExtract = async (volume: Volume) => {
    if (!currentBook) return;

    const chapters = await db.chapters
      .where('volumeId').equals(volume.id)
      .and(c => c.bookId === currentBook.id)
      .toArray()
      .then(arr => arr.sort((a, b) => a.createdAt - b.createdAt));

    if (chapters.length === 0) {
      showToast('该分卷暂无章节', 'warning');
      return;
    }

    const config = await getDefaultLLMConfig();
    if (!config) {
      showToast('请先在 AI 助手面板中设置默认 LLM 模型', 'warning');
      return;
    }
    const apiKey = decodeApiKey(config.apiKey);

    const chapterContents = chapters
      .map(c => `## ${c.title}\n${c.content.replace(/<[^>]*>/g, '')}`)
      .join('\n\n');

    const prompt = `请分析以下小说的章节内容，提炼出一个结构化的章节大纲。每个大纲条目应简洁概括该章节的关键情节点和转折。

${chapterContents}

请用纯文本返回大纲，每行一个条目，用两个空格的缩进表示层级关系。格式示例：
- 第一章：开端 - 主角发现关键线索
- 第二章：调查展开
  - 首个证人出现
  - 发现隐藏线索
- 第三章：高潮

直接返回大纲文本，不要 JSON，不要任何解释。`;

    showToast('正在提炼大纲，请稍候...', 'info');

    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: '你是一个专业的小说编辑和分析师。请根据用户提供的章节内容，提炼出结构化的大纲。用纯文本返回，每行一个条目，两个空格缩进表示层级。以 "- " 开头。不返回 JSON，不添加任何解释。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.5,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status}`);
      }

      const data = await response.json();
      const resultText = data.choices?.[0]?.message?.content || '';

      if (!resultText.trim()) {
        throw new Error('AI 返回了空内容，请重试');
      }

      const outlineItems: OutlineItemData[] = markdownToOutline(resultText);

      if (outlineItems.length === 0) {
        throw new Error('无法从AI返回中解析出大纲条目，请重试');
      }

      let hasExisting = false;
      if (volume.outline) {
        try {
          const existing = JSON.parse(volume.outline);
          hasExisting = Array.isArray(existing) && existing.length > 0;
        } catch { /* ignore */ }
      }

      if (!hasExisting) {
        const outlineJson = JSON.stringify(outlineItems);
        await db.volumes.update(volume.id, { outline: outlineJson });
        const updatedVolume = await db.volumes.get(volume.id);
        if (updatedVolume) {
          setCurrentOutlineVolume(updatedVolume);
        }
      } else {
        if (!currentOutlineVolume || currentOutlineVolume.id !== volume.id) {
          setCurrentOutlineVolume(volume);
        }
        setTimeout(() => {
          outlineEditorRef.current?.importOutline(outlineItems);
        }, 150);
      }

      setOutlineRefreshTrigger(prev => prev + 1);
      showToast('大纲提炼完成', 'success');
    } catch (error) {
      console.error('大纲提炼失败:', error);
      showToast(error instanceof Error ? error.message : '大纲提炼失败', 'error');
    }
  };

  const initPipelineLLM = async () => {
    const defaultConfig = await getDefaultLLMConfig();
    if (!defaultConfig) {
      throw new Error('请先配置 LLM（在 AI 助手中设置）');
    }
    const apiKey = decodeApiKey(defaultConfig.apiKey);
    const prompts = new Map<string, string>();
    const modules = import.meta.glob('./references/*.md', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;
    for (const [path, content] of Object.entries(modules)) {
      if (typeof content === 'string') {
        const fileName = path.split('/').pop() || '';
        prompts.set(fileName, content);
      }
    }
    const templateModules = import.meta.glob('./prompts/templates/**/*.md', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;
    for (const [path, content] of Object.entries(templateModules)) {
      if (typeof content === 'string') {
        const fileName = path.split('/').pop() || '';
        prompts.set(`template:${fileName}`, content);
      }
    }
    novelLLMService.init(prompts, {
      apiKey,
      baseUrl: defaultConfig.apiUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, ''),
      model: defaultConfig.model,
    });
  };

  const handlePipelineGenerateOutline = async (config: PipelineStep1Config): Promise<string> => {
    try {
      await initPipelineLLM();
      const result = await novelLLMService.generatePipelineOutline(config);
      return result;
    } catch (error) {
      console.error('流水线大纲生成失败:', error);
      throw error;
    }
  };

  const handlePipelineOverwriteOutline = async (markdown: string) => {
    if (!currentOutlineVolume) {
      showToast('请先选择一个卷', 'warning');
      return;
    }
    try {
      const outlineItems = markdownToOutline(markdown);
      const outlineJson = JSON.stringify(outlineItems);
      await db.volumes.update(currentOutlineVolume.id, { outline: outlineJson });
      const updated = await db.volumes.get(currentOutlineVolume.id);
      if (updated) {
        setCurrentOutlineVolume(updated);
      }
      setOutlineRefreshTrigger(prev => prev + 1);
      showToast('本卷大纲已覆盖', 'success');
    } catch (error) {
      console.error('覆盖大纲失败:', error);
      showToast('覆盖大纲失败', 'error');
    }
  };

  const handlePipelineRefineOutline = async (step2State: PipelineStep2State, round: OutlineRound): Promise<string> => {
    try {
      await initPipelineLLM();
      const result = await novelLLMService.refinePipelineOutline(step2State, round);
      return result;
    } catch (error) {
      console.error('流水线大纲回炉重造失败:', error);
      throw error;
    }
  };

  const handlePipelineGenerateDetailedOutline = async (outline: string, chapterCount: number): Promise<string> => {
    try {
      await initPipelineLLM();
      const result = await novelLLMService.generatePipelineDetailedOutline(outline, chapterCount);
      return result;
    } catch (error) {
      console.error('流水线细纲生成失败:', error);
      throw error;
    }
  };

  const handlePipelineRefineDetailedOutline = async (step4State: PipelineStep4State, round: DetailedOutlineRound, outline: string): Promise<string> => {
    try {
      await initPipelineLLM();
      const result = await novelLLMService.refinePipelineDetailedOutline(step4State, round, outline);
      return result;
    } catch (error) {
      console.error('流水线细纲回炉重造失败:', error);
      throw error;
    }
  };

  const handlePipelineRefineDetailedOutlineChapter = async (step4State: PipelineStep4State, chapterIndices: number[], round: DetailedOutlineRound, outline: string): Promise<string> => {
    try {
      await initPipelineLLM();
      const result = await novelLLMService.refinePipelineDetailedOutlineChapter(step4State, chapterIndices, round, outline);
      return result;
    } catch (error) {
      console.error('流水线细纲章节回炉重造失败:', error);
      throw error;
    }
  };

  const handlePipelinePreviewInEditor = (title: string, content: string, onChange: (content: string) => void) => {
    if (currentMaterial) {
      setCurrentMaterial(null);
    }
    if (currentOutlineVolume) {
      setCurrentOutlineVolume(null);
    }
    if (currentChapter) {
      if (saveStatus === 'unsaved') {
        autoSave();
      }
      setCurrentChapter(null);
      setEditorContent('');
    }
    setPipelinePreview({ title, content, onChange });
  };

  const handlePipelinePreviewContentChange = (newContent: string) => {
    if (pipelinePreview) {
      pipelinePreview.onChange(newContent);
      setPipelinePreview({ ...pipelinePreview, content: newContent });
    }
  };

  const handlePipelinePreviewClose = () => {
    setPipelinePreview(null);
  };

  const handlePipelineGenerateChapter = async (chapterIndex: number): Promise<string> => {
    try {
      await initPipelineLLM();

      const pipelineSessionId = `${currentBook?.id}_${currentOutlineVolume?.id}`;
      const session = await db.pipelineSessions.get(pipelineSessionId);
      const step4State = session?.step4State;
      const step2State = session?.step2State;
      const step3Config = session?.step3Config;

      if (!step4State || !step4State.chapters[chapterIndex]) {
        throw new Error('未找到章节细纲，请先完成第4步');
      }

      const chapter = step4State.chapters[chapterIndex];
      let previousContent: string | null = null;

      const step5State = session?.step5State;
      if (step5State && chapterIndex > 0) {
        const prevDraft = step5State.chapters.find(ch => ch.index === chapterIndex - 1);
        if (prevDraft?.content) {
          previousContent = prevDraft.content;
        }
      }

      const result = await novelLLMService.generatePipelineChapter(
        chapterIndex,
        chapter.title,
        chapter.content,
        previousContent,
        step2State?.currentOutline || '',
        step3Config || { writingStyle: '', storyLength: '', customRules: '' },
      );
      return result;
    } catch (error) {
      console.error('流水线生成章节失败:', error);
      throw error;
    }
  };

  const handlePipelineRefineChapter = async (step5State: PipelineStep5State, chapterIndex: number, round: ChapterDraftRound): Promise<string> => {
    try {
      await initPipelineLLM();

      const pipelineSessionId = `${currentBook?.id}_${currentOutlineVolume?.id}`;
      const session = await db.pipelineSessions.get(pipelineSessionId);
      const step2State = session?.step2State;
      const step3Config = session?.step3Config;

      const result = await novelLLMService.refinePipelineChapter(
        step5State,
        chapterIndex,
        round,
        step2State?.currentOutline || '',
        step3Config || { writingStyle: '', storyLength: '', customRules: '' },
      );
      return result;
    } catch (error) {
      console.error('流水线章节回炉重造失败:', error);
      throw error;
    }
  };

  const handlePipelineBatchGenerateChapters = async (
    chapters: Array<{ index: number; title: string; outline: string }>,
  ): Promise<Array<{ index: number; title: string; content: string }>> => {
    try {
      await initPipelineLLM();

      const pipelineSessionId = `${currentBook?.id}_${currentOutlineVolume?.id}`;
      const session = await db.pipelineSessions.get(pipelineSessionId);
      const step2State = session?.step2State;
      const step3Config = session?.step3Config;

      const result = await novelLLMService.generatePipelineChaptersBatch(
        chapters,
        step2State?.currentOutline || '',
        step3Config || { writingStyle: '', storyLength: '', customRules: '' },
      );
      return result;
    } catch (error) {
      console.error('流水线批量生成章节失败:', error);
      throw error;
    }
  };

  // 纯文本转简易 HTML（段落+换行），用于录入 Pipeline 生成的章节
  const plainTextToHtml = (text: string): string => {
    // 如果已包含 HTML 标签则跳过转换
    if (/<[a-z][\s\S]*>/i.test(text)) return text;
    return text
      .split(/\n{2,}/)
      .map(para => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
      .join('');
  };

  const handlePipelineAddChapterToVolume = async (title: string, content: string, detailedOutline?: string) => {
    if (!currentBook || !currentOutlineVolume) {
      showToast('请先选择书籍和卷', 'warning');
      return;
    }
    try {
      const { v4: uuidv4 } = await import('uuid');
      const existingChapters = await db.chapters
        .where('volumeId')
        .equals(currentOutlineVolume.id)
        .count();
      const chapterId = uuidv4();
      const contentHtml = plainTextToHtml(content);
      const wordCount = countWords(content, wordCountSettings);
      await db.chapters.add({
        id: chapterId,
        volumeId: currentOutlineVolume.id,
        bookId: currentBook.id,
        title,
        content: contentHtml,
        wordCount,
        detailedOutline: detailedOutline || undefined,
        order: existingChapters,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      showToast(`章节「${title}」已录入本卷`, 'success');
    } catch (error) {
      console.error('录入章节失败:', error);
      showToast('录入章节失败', 'error');
    }
  };

  // 处理编辑器内容变化
  const handleContentChange = (content: string) => {
    setEditorContent(content);
    const newWordCount = countWords(content, wordCountSettings);
    setWordCount(newWordCount);
    setSaveStatus('unsaved');

    // 更新当前章节的字数（内存中）
    if (currentChapter) {
      setCurrentChapter({
        ...currentChapter,
        content,
        wordCount: newWordCount,
      });
      
      console.log('[字数更新] 准备更新数据库，章节ID:', currentChapter.id, '新字数:', newWordCount);
      
      // 使用防抖更新数据库
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current);
      }
      
      refreshDebounceTimerRef.current = setTimeout(async () => {
        console.log('[字数更新] 防抖触发，开始更新数据库');
        
        // 更新数据库中的 wordCount
        try {
          await db.chapters.update(currentChapter.id, {
            wordCount: newWordCount
          });
          console.log('[字数更新] ✅ 数据库更新成功');
          
          // ⭐ 触发增量更新：递增 trigger，通知 BookOutlineTree 从数据库重新加载
          setOutlineRefreshTrigger(prev => prev + 1);
          console.log('[字数更新] 📢 触发大纲树刷新，trigger:', outlineRefreshTrigger + 1);
        } catch (error) {
          console.error('[字数更新] ❌ 数据库更新失败:', error);
        }
        
        refreshDebounceTimerRef.current = null;
      }, 500); // 500ms 后更新数据库
    }
  };

  // 处理章节标题变化
  const handleTitleChange = (title: string) => {
    if (!currentChapter) return;
    
    // 更新当前章节的标题（内存中）
    const updatedChapter = {
      ...currentChapter,
      title,
    };
    setCurrentChapter(updatedChapter);
    setSaveStatus('unsaved');

    // 使用防抖更新数据库
    if (refreshDebounceTimerRef.current) {
      clearTimeout(refreshDebounceTimerRef.current);
    }
    
    refreshDebounceTimerRef.current = setTimeout(async () => {
      try {
        await db.chapters.update(currentChapter.id, {
          title
        });
        console.log('[标题更新] ✅ 数据库更新成功');
        
        // 触发大纲树刷新
        setOutlineRefreshTrigger(prev => prev + 1);
      } catch (error) {
        console.error('[标题更新] ❌ 数据库更新失败:', error);
      }
      
      refreshDebounceTimerRef.current = null;
    }, 500); // 500ms 后更新数据库
  };

  // 保存功能
  const handleSave = async () => {
    if (!currentChapter) {
      console.warn('[保存] 没有选中的章节');
      return;
    }

    console.log('[保存] 开始保存章节:', currentChapter.id);
    console.log('[保存] 内容长度:', editorContent.length);
    setSaveStatus('saving');

    try {
      // 保存章节版本快照
      console.log('[保存] 步骤1: 保存版本快照...');
      const versionId = await saveChapterVersion(currentChapter.id, editorContent, countWords(editorContent, wordCountSettings));
      console.log('[保存] 版本ID:', versionId);

      // 更新章节内容到 IndexedDB
      console.log('[保存] 步骤2: 更新章节内容...');
      const updateResult = await db.chapters.update(currentChapter.id, {
        content: editorContent,
        wordCount: countWords(editorContent, wordCountSettings),
        updatedAt: Date.now(),
      });
      console.log('[保存] 更新结果:', updateResult);

      // 验证数据是否真的写入了
      console.log('[保存] 步骤3: 验证数据...');
      const savedChapter = await db.chapters.get(currentChapter.id);
      console.log('[保存] 保存后的章节内容长度:', savedChapter?.content?.length);
      console.log('[保存] 当前编辑器内容长度:', editorContent.length);
      console.log('[保存] 内容是否一致:', savedChapter?.content === editorContent);

      // 清理旧版本（保留最近10个）
      console.log('[保存] 步骤4: 清理旧版本...');
      await cleanupOldVersions(currentChapter.id, 10);

      // 更新书籍总字数
      if (currentBook) {
        console.log('[保存] 步骤5: 更新书籍总字数...');
        const allChapters = await db.chapters.where('bookId').equals(currentBook.id).toArray();
        const totalWords = allChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
        await db.books.update(currentBook.id, {
          totalWords,
          updatedAt: Date.now(),
        });
        console.log('[保存] 书籍总字数:', totalWords);
      }

      setSaveStatus('saved');
      console.log('[保存] ✅ 保存成功');
    } catch (error) {
      console.error('[保存] ❌ 保存失败:', error);
      showToast('保存失败，请重试', 'error');
      setSaveStatus('unsaved');
    }
  };

  // 撤销功能
  const handleUndo = () => {
    if (editorRef.current?.editor) {
      editorRef.current.editor.chain().focus().undo().run();
    }
  };

  // 重做功能
  const handleRedo = () => {
    if (editorRef.current?.editor) {
      editorRef.current.editor.chain().focus().redo().run();
    }
  };

  const handleFindReplace = () => {
    if (showFindReplace) {
      const cmds = getSearchReplaceCommands(editorRef.current?.editor ?? null);
      cmds?.clearSearch();
    }
    setShowFindReplace(!showFindReplace);
  };

  const handleFind = (searchText: string, caseSensitive?: boolean) => {
    const cmds = getSearchReplaceCommands(editorRef.current?.editor ?? null);
    if (!cmds || !searchText) return;

    setLastSearchText(searchText);
    const count = cmds.searchInDocument(searchText, caseSensitive);
    if (count === 0) {
      showToast(`未找到 "${searchText}"`, 'info');
    } else {
      showToast(`找到 ${count} 个匹配项`, 'success');
    }
  };

  const handleFindNext = () => {
    const cmds = getSearchReplaceCommands(editorRef.current?.editor ?? null);
    cmds?.nextSearchMatch();
  };

  const handleFindPrevious = () => {
    const cmds = getSearchReplaceCommands(editorRef.current?.editor ?? null);
    cmds?.previousSearchMatch();
  };

  const handleReplace = (searchText: string, replaceText: string, caseSensitive?: boolean) => {
    const cmds = getSearchReplaceCommands(editorRef.current?.editor ?? null);
    if (!cmds || !searchText) return;

    const storage = editorRef.current?.editor?.storage.searchReplace;
    if (!storage || storage.matches.length === 0) {
      const count = cmds.searchInDocument(searchText, caseSensitive);
      if (count === 0) {
        showToast(`未找到 "${searchText}"`, 'info');
        return;
      }
    }

    const success = cmds.replaceSearchMatch(replaceText);
    if (success) {
      setSaveStatus('unsaved');
      showToast('替换成功', 'success');
    } else {
      showToast('没有可替换的匹配项', 'info');
    }
  };

  const handleReplaceAll = (searchText: string, replaceText: string, caseSensitive?: boolean) => {
    const cmds = getSearchReplaceCommands(editorRef.current?.editor ?? null);
    if (!cmds || !searchText) return;

    const storage = editorRef.current?.editor?.storage.searchReplace;
    if (!storage || storage.matches.length === 0) {
      const count = cmds.searchInDocument(searchText, caseSensitive);
      if (count === 0) {
        showToast(`未找到 "${searchText}"`, 'info');
        return;
      }
    }

    const matchCount = storage?.matches?.length ?? 0;
    if (!confirm(`确定要替换所有 ${matchCount} 个匹配项吗？`)) {
      return;
    }

    const count = cmds.replaceAllSearchMatches(replaceText);
    if (count > 0) {
      setSaveStatus('unsaved');
      showToast(`已替换 ${count} 个匹配项`, 'success');
    }
  };

  const handleClearSearch = () => {
    const cmds = getSearchReplaceCommands(editorRef.current?.editor ?? null);
    cmds?.clearSearch();
  };

  const handleNavigateToChapter = async (chapterId: string) => {
    if (!currentBook) return;
    const chapter = await db.chapters.get(chapterId);
    if (!chapter) return;
    setCurrentChapter(chapter);
  };

  const handleBookReplaceAll = async (
    searchText: string,
    replaceText: string,
    caseSensitive: boolean,
    chapterIds: string[],
  ): Promise<number> => {
    let totalCount = 0;
    for (const chapterId of chapterIds) {
      const chapter = await db.chapters.get(chapterId);
      if (!chapter) continue;

      const text = chapter.content;
      const searchLower = caseSensitive ? searchText : searchText.toLowerCase();
      const textToSearch = caseSensitive ? text : text.toLowerCase();

      let count = 0;
      let idx = 0;
      while ((idx = textToSearch.indexOf(searchLower, idx)) !== -1) {
        count++;
        idx += 1;
      }

      if (count === 0) continue;

      let newContent: string;
      if (caseSensitive) {
        newContent = text.split(searchText).join(replaceText);
      } else {
        const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        newContent = text.replace(regex, replaceText);
      }

      await db.chapters.update(chapterId, {
        content: newContent,
        wordCount: countWords(newContent),
        updatedAt: Date.now(),
      });

      if (currentChapter?.id === chapterId) {
        setEditorContent(newContent);
      }

      totalCount += count;
    }

    if (totalCount > 0) {
      setSaveStatus('unsaved');
      showToast(`全书已替换 ${totalCount} 处`, 'success');
    }

    return totalCount;
  };

  const handleExport = async (format: 'txt' | 'md' | 'html' = 'txt') => {
    if (!currentBook) {
      showToast('请先选择一本书', 'warning');
      return;
    }

    const allChapters = await db.chapters.where('bookId').equals(currentBook.id).toArray();

    if (allChapters.length === 0) {
      showToast('该书暂无章节，无法导出', 'warning');
      return;
    }

    const sorted = allChapters.sort((a, b) => a.createdAt - b.createdAt);

    let content = '';
    let ext = '';
    let mime = '';

    if (format === 'txt') {
      content = sorted.map(ch =>
        `${ch.title}\n\n${ch.content.replace(/<[^>]*>/g, '')}`
      ).join('\n\n\n---\n\n\n');
      ext = 'txt';
      mime = 'text/plain;charset=utf-8';
    } else if (format === 'md') {
      content = sorted.map(ch =>
        `# ${ch.title}\n\n${ch.content.replace(/<[^>]*>/g, '')}`
      ).join('\n\n---\n\n');
      ext = 'md';
      mime = 'text/markdown;charset=utf-8';
    } else {
      content = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${currentBook.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2em; line-height: 1.8; }
    h1 { border-bottom: 2px solid #333; padding-bottom: .3em; }
    h2 { margin-top: 2em; }
  </style>
</head>
<body>
  <h1>${currentBook.name}</h1>
  ${sorted.map(ch => `<h2>${ch.title}</h2>\n${ch.content}`).join('\n')}
</body>
</html>`;
      ext = 'html';
      mime = 'text/html;charset=utf-8';
    }

    const fileName = `${currentBook.name}.${ext}`;
    const lastDir = localStorage.getItem('lastExportPath') || '';

    try {
      const { save: saveDialog } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile: writeFile } = await import('@tauri-apps/plugin-fs');

      const selectedPath = await saveDialog({
        defaultPath: lastDir ? `${lastDir}\\${fileName}` : fileName,
        filters: [
          {
            name: ext === 'txt' ? '文本文档' : ext === 'md' ? 'Markdown 文档' : 'HTML 文档',
            extensions: [ext],
          },
        ],
      });

      if (selectedPath === null) return;

      await writeFile(selectedPath, content);

      const dir = selectedPath.substring(
        0,
        selectedPath.lastIndexOf('\\') || selectedPath.lastIndexOf('/'),
      );
      localStorage.setItem('lastExportPath', dir);

      showToast(`已导出 — ${format.toUpperCase()}`, 'success');
    } catch {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`已导出 — ${format.toUpperCase()}`, 'success');
    }
  };

  // 完整导出所有数据
  const handleFullExport = async () => {
    try {
      const jsonData = await exportAllData();
      const timestamp = new Date().toISOString().slice(0, 10);
      const fileName = `writing-studio-backup-${timestamp}.json`;

      try {
        const { save: saveDialog } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile: writeFile } = await import('@tauri-apps/plugin-fs');

        const lastDir = localStorage.getItem('lastExportPath') || '';
        const selectedPath = await saveDialog({
          defaultPath: lastDir ? `${lastDir}\\${fileName}` : fileName,
          filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        });

        if (selectedPath === null) return;

        await writeFile(selectedPath, jsonData);

        const dir = selectedPath.substring(
          0,
          selectedPath.lastIndexOf('\\') || selectedPath.lastIndexOf('/'),
        );
        localStorage.setItem('lastExportPath', dir);
        showToast('完整数据导出成功', 'success');
        return;
      } catch {}

      const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('完整数据导出成功', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(`导出失败: ${errorMessage}`, 'error');
    }
  };

  // 导入数据 - 显示选项弹窗
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  
  const handleImportClick = async () => {
    try {
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      
      let fileContent: string;
      
      if (!isTauri) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          fileContent = await file.text();
          try {
            const data = JSON.parse(fileContent);
            setImportPreview(data);
            setShowImportModal(true);
          } catch {
            showToast('无效的JSON文件', 'error');
          }
        };
        input.click();
        return;
      }
      
      const { open } = await import('@tauri-apps/plugin-dialog');
      const filePath = await open({
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!filePath) return;
      
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      fileContent = await readTextFile(filePath as string);
      const data = JSON.parse(fileContent);
      setImportPreview(data);
      setShowImportModal(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(`读取文件失败: ${errorMessage}`, 'error');
    }
  };

  const confirmImport = async (mergeMode: boolean) => {
    if (!importPreview) return;
    
    try {
      const result = await importAllData(JSON.stringify(importPreview), mergeMode);
      setShowImportModal(false);
      setImportPreview(null);
      
      if (mergeMode) {
        showToast(`导入完成: 新增 ${result.added} 条, 更新 ${result.updated} 条`, 'success');
      } else {
        showToast('数据覆盖导入成功', 'success');
      }
      
      // 刷新界面
      window.location.reload();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(`导入失败: ${errorMessage}`, 'error');
    }
  };

  const handleFormatPlainText = (text: string, settings: FormattingSettings): string => {
    let result = text;

    if (settings.clearExtraBlankLines) {
      result = result.replace(/\n{3,}/g, '\n\n');
    }
    if (settings.clearExtraSpaces) {
      result = result.replace(/ {2,}/g, ' ');
    }
    if (settings.convertPunctuation) {
      result = convertFullWidthToHalfWidth(result);
    }

    // paragraphSpacing 和 firstLineIndent 是 CSS 概念，纯文本 textarea 中无法渲染

    return result;
  };

  // 一键排版
  const handleFormat = (settings: FormattingSettings) => {
    console.log('[App] handleFormat 收到的 settings:', JSON.stringify(settings));

    if (pipelinePreview) {
      const formatted = handleFormatPlainText(pipelinePreview.content, settings);
      handlePipelinePreviewContentChange(formatted);
      showToast('排版完成', 'success');
      return;
    }
    
    if (!editorRef.current?.editor) {
      showToast('编辑器未就绪', 'error');
      return;
    }

    const editor = editorRef.current.editor;
    
    const jsonContent = editor.getJSON();
    console.log('[排版] 原始JSON:', JSON.stringify(jsonContent, null, 2));
    
    // 辅助函数：清除段落文本中的前导空白字符，防止与排版缩进叠加
    const trimLeadingWhitespace = (content: any[]): void => {
      for (const child of content) {
        if (child.type === 'text' && child.text) {
          // 清除前导空白：普通空格、&nbsp;(\u00A0)、全角空格(\u3000)等
          child.text = child.text.replace(/^[\s\u00A0\u3000\u2000-\u200A\u202F\u205F]+/, '');
          break; // 只处理第一个文本节点
        }
        // 如果遇到非文本节点（如 hardBreak），跳过继续
      }
    };

    const processNode = (node: any): any => {
      if (node.type === 'paragraph') {
        // 清除段落文本前导空白字符——防止原有空白缩进与排版设置的 text-indent 叠加
        if (node.content && Array.isArray(node.content)) {
          trimLeadingWhitespace(node.content);
        }
        
        const attrs = node.attrs || {};
        const styleParts: string[] = [];
        
        if (settings.paragraphSpacing && settings.paragraphSpacing !== '0px') {
          styleParts.push(`margin-bottom: ${settings.paragraphSpacing}`);
        }
        
        if (settings.firstLineIndent && settings.firstLineIndent !== '0') {
          let indentValue = settings.firstLineIndent;
          if (indentValue.endsWith('char')) {
            const charCount = parseInt(indentValue);
            if (!isNaN(charCount) && charCount > 0) {
              indentValue = `${charCount}em`;
            }
          }
          styleParts.push(`text-indent: ${indentValue}`);
        }
        
        if (styleParts.length > 0) {
          node.attrs = {
            ...attrs,
            style: styleParts.join('; ')
          };
        }
      }
      
      if (node.content) {
        node.content = node.content.map(processNode);
      }
      
      return node;
    };
    
    const newJsonContent = processNode(jsonContent);
    console.log('[排版] 处理后JSON:', JSON.stringify(newJsonContent, null, 2));
    
    editor.commands.setContent(newJsonContent);
    
    const newHtml = editor.getHTML();
    setEditorContent(newHtml);
    setSaveStatus('unsaved');
    
    if (settings.clearExtraBlankLines || settings.clearExtraSpaces || settings.convertPunctuation) {
      let finalHtml = editor.getHTML();
      if (settings.clearExtraBlankLines) {
        finalHtml = clearExtraBlankLines(finalHtml);
      }
      if (settings.clearExtraSpaces) {
        finalHtml = clearExtraSpaces(finalHtml);
      }
      if (settings.convertPunctuation) {
        finalHtml = convertFullWidthToHalfWidth(finalHtml);
      }
      editor.commands.setContent(finalHtml);
      setEditorContent(finalHtml);
    }
    
    showToast('排版完成', 'success');
  };

  // 保存排版设置 - 按书籍ID存储
  const handleSaveFormattingSettings = (settings: FormattingSettings) => {
    setFormattingSettings(settings);
    
    localStorage.setItem('formattingSettings', JSON.stringify(settings));
    
    if (currentBook) {
      const settingsKey = `formattingSettings_${currentBook.id}`;
      localStorage.setItem(settingsKey, JSON.stringify(settings));
    }
  };

  // 加载排版设置 - 根据当前书籍ID加载
  useEffect(() => {
    if (currentBook) {
      const settingsKey = `formattingSettings_${currentBook.id}`;
      const saved = localStorage.getItem(settingsKey);
      if (saved) {
        try {
          setFormattingSettings(JSON.parse(saved));
        } catch (e) {
          console.error('加载排版设置失败:', e);
        }
      } else {
        // 如果没有该书的设置，使用默认设置
        setFormattingSettings({
          paragraphSpacing: '1em',
          firstLineIndent: '2char',
          clearExtraBlankLines: true,
          clearExtraSpaces: true,
          convertPunctuation: false,
        });
      }
    }
  }, [currentBook?.id]);

  // 处理素材选择（左键点击 — 在编辑区域打开素材）
  const handleMaterialSelect = (material: Material) => {
    if (currentOutlineVolume) {
      setCurrentOutlineVolume(null);
    }
    if (currentChapter) {
      if (saveStatus === 'unsaved') {
        autoSave();
      }
      setCurrentChapter(null);
      setEditorContent('');
    }
    setPipelinePreview(null);
    setCurrentMaterial(material);
  };

  // 处理素材编辑器返回
  const handleMaterialBack = () => {
    setCurrentMaterial(null);
  };

  // 处理素材保存后的刷新
  const handleMaterialSaved = (updated: Material) => {
    setCurrentMaterial(updated);
  };

  // 处理素材插入到章节
  const handleInsertMaterial = (material: Material) => {
    if (!currentChapter) {
      showToast('请先选择一个章节', 'warning');
      return;
    }

    // 生成素材引用文本
    const materialText = `\n\n[[${getTypeText(material.type)}：${material.name}]]\n${material.description}\n`;
    
    // 插入到编辑器内容末尾
    const newContent = editorContent + materialText;
    setEditorContent(newContent);
    setSaveStatus('unsaved');
    
    showToast(`已插入素材: ${material.name}`, 'success');
  };

  // 获取类型文本
  const getTypeText = (type: string) => {
    switch (type) {
      case 'character':
        return '人物';
      case 'location':
        return '地点';
      case 'item':
        return '物品';
      case 'plot':
        return '情节';
      default:
        return '素材';
    }
  };

  // 处理活动栏点击
  const handleActivityClick = (activityId: ActivityId) => {
    if (activityId === activeActivity) {
      // 点击已激活的活动项，切换侧边栏显示/隐藏
      setIsSidebarVisible(!isSidebarVisible);
    } else {
      // 点击未激活的活动项，展开侧边栏并切换内容
      setActiveActivity(activityId);
      setIsSidebarVisible(true);
    }
  };

  const handleRightActivityClick = (activityId: RightActivityId) => {
    if (activityId === rightActivity) {
      setIsRightPanelVisible(!isRightPanelVisible);
    } else {
      setRightActivity(activityId);
      setIsRightPanelVisible(true);
    }
  };



  return (
    <div className="h-screen flex flex-col overflow-hidden" data-theme={theme}>
      <Toolbar
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onFindReplace={handleFindReplace}
        onExport={handleExport}
        onFormat={handleFormat}
        onOpenFormattingSettings={() => setShowFormattingSettings(true)}
        wordCount={wordCount}
        editor={editorRef.current?.editor || null}
        theme={theme}
        currentBook={currentBook}
        currentChapter={currentChapter}
        lineHeight={lineHeight}
        paragraphSpacingValue={formattingSettings.paragraphSpacing}
        onLineHeightChange={setLineHeight}
        onParagraphSpacingChange={(value) => {
          setFormattingSettings(prev => ({ ...prev, paragraphSpacing: value }));
        }}
      />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <ActivityBar
            activeActivity={activeActivity}
            onActivityClick={handleActivityClick}
          />

          {!isFullScreen && (
            <>
              <div
                className={isResizing ? 'sidebar-transition-no-animate' : 'sidebar-transition'}
                style={{
                  width: isSidebarVisible ? sidebarWidth : 0,
                  minWidth: isSidebarVisible ? sidebarWidth : 0,
                  maxWidth: isSidebarVisible ? sidebarWidth : 0,
                  overflow: 'hidden',
                }}
              >
                <Sidebar
                  activeActivity={activeActivity}
                  isSidebarVisible={isSidebarVisible}
                  currentBook={currentBook}
                  onBookSelect={handleBookSelect}
                  onBookDeselect={handleBookDeselect}
                  onChapterSelect={handleChapterSelect}
                  onVolumeChange={() => setOutlineRefreshTrigger(prev => prev + 1)}
                  activeChapterId={currentChapter?.id || null}
                  onInsertMaterial={handleInsertMaterial}
                  onMaterialSelect={handleMaterialSelect}
                  formattingSettings={formattingSettings}
                  onSaveFormattingSettings={handleSaveFormattingSettings}
                  wordCountSettings={wordCountSettings}
                  onSaveWordCountSettings={(s: WordCountSettings) => {
                    setWordCountSettings(s);
                    localStorage.setItem('wordCountSettings', JSON.stringify(s));
                  }}
                  theme={theme}
                  onThemeChange={setTheme}
                  outlineRefreshTrigger={outlineRefreshTrigger}
                  width={sidebarWidth}
                  currentOutlineVolume={currentOutlineVolume}
                  onVolumeOutlineSelect={handleVolumeOutlineSelect}
                  onPipelineGenerateOutline={handlePipelineGenerateOutline}
                  onPipelineRefineOutline={handlePipelineRefineOutline}
                  onPipelineOverwriteOutline={handlePipelineOverwriteOutline}
                  onPipelineGenerateDetailedOutline={handlePipelineGenerateDetailedOutline}
                  onPipelineRefineDetailedOutline={handlePipelineRefineDetailedOutline}
                  onPipelineRefineDetailedOutlineChapter={handlePipelineRefineDetailedOutlineChapter}
                  onPipelinePreviewInEditor={handlePipelinePreviewInEditor}
                  onPipelineGenerateChapter={handlePipelineGenerateChapter}
                  onPipelineRefineChapter={handlePipelineRefineChapter}
                  onPipelineBatchGenerateChapters={handlePipelineBatchGenerateChapters}
                  onPipelineAddChapterToVolume={handlePipelineAddChapterToVolume}
                  showToast={showToast}
                  agentState={agent.state}
                  onAgentSendMessage={agent.sendMessage}
                  onAgentStopGeneration={agent.stopGeneration}
                  onAgentClearMessages={agent.clearMessages}
                  onAgentCheckConnection={agent.checkConnection}
                  onAgentUpdateApiUrl={agent.updateApiUrl}
                  onAgentLoadSessions={agent.loadSessions}
                  onAgentCreateSession={agent.createSession}
                  onAgentSwitchSession={agent.switchSession}
                  onAgentDeleteSession={agent.deleteSession}
                  agentApiUrl={agent.apiUrl}
                  vibePipelineState={pipeline.state.pipeline}
                  vibeLoading={pipeline.state.loading}
                  vibeError={pipeline.state.error}
                  onVibeStartPipeline={pipeline.startPipeline}
                  onVibeIntervene={pipeline.intervene}
                  onVibeClearPipeline={pipeline.clearPipeline}
                />
              </div>
              <div
                className="resize-handle"
                onMouseDown={handleSidebarDragStart}
                title={isSidebarVisible ? "拖动调整宽度" : "拖动显示侧边栏"}
                style={{
                  width: isSidebarVisible ? '4px' : '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {!isSidebarVisible && (
                  <div className="w-1 h-8 bg-vscode-border rounded-full" />
                )}
              </div>
            </>
          )}

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-w-[300px] min-h-0 relative">
              {showFindReplace && (
                <FindReplace
                  editor={editorRef.current?.editor ?? null}
                  onClose={() => {
                    handleClearSearch();
                    setShowFindReplace(false);
                  }}
                  onFind={handleFind}
                  onFindNext={handleFindNext}
                  onFindPrevious={handleFindPrevious}
                  onReplace={handleReplace}
                  onReplaceAll={handleReplaceAll}
                  initialSearchText={lastSearchText}
                  currentBookId={currentBook?.id ?? null}
                  onNavigateToChapter={handleNavigateToChapter}
                  onBookReplaceAll={handleBookReplaceAll}
                />
              )}
              {currentMaterial ? (
                <MaterialEditor
                  material={currentMaterial}
                  onBack={handleMaterialBack}
                  onSaved={handleMaterialSaved}
                />
              ) : currentOutlineVolume ? (
                <OutlineEditor
                  ref={outlineEditorRef}
                  volume={currentOutlineVolume}
                  onSave={handleOutlineSave}
                  onBack={() => setCurrentOutlineVolume(null)}
                />
              ) : currentOutlineChapter ? (
                <DetailedOutlineEditor
                  chapter={currentOutlineChapter}
                  onSave={handleDetailedOutlineSave}
                  onBack={() => setCurrentOutlineChapter(null)}
                />
              ) : pipelinePreview ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{
                    padding: '6px 16px',
                    borderBottom: '1px solid var(--color-vscode-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-vscode-text)' }}>
                      {pipelinePreview.title}
                    </span>
                    <button
                      type="button"
                      style={{
                        padding: '2px 10px',
                        fontSize: '11px',
                        border: '1px solid var(--color-vscode-border)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        backgroundColor: 'transparent',
                        color: 'var(--color-vscode-text)',
                      }}
                      onClick={handlePipelinePreviewClose}
                    >
                      关闭
                    </button>
                  </div>
                  <textarea
                    value={pipelinePreview.content}
                    onChange={e => handlePipelinePreviewContentChange(e.target.value)}
                    style={{
                      flex: 1,
                      width: '100%',
                      resize: 'none',
                      backgroundColor: 'transparent',
                      color: 'var(--color-vscode-text)',
                      border: 'none',
                      outline: 'none',
                      padding: '16px',
                      fontSize: '14px',
                      fontFamily: 'var(--editor-font-family, Consolas, Monaco, "Courier New", monospace)',
                      lineHeight: '1.6',
                      boxSizing: 'border-box' as const,
                    }}
                    spellCheck={false}
                  />
                </div>
              ) : (
                <EditorArea
                  content={editorContent}
                  onContentChange={handleContentChange}
                  title={currentChapter?.title || ''}
                  onTitleChange={handleTitleChange}
                  placeholder="开始写作..."
                  editorRef={editorRef}
                  paragraphSpacing={formattingSettings.paragraphSpacing}
                  lineHeight={lineHeight}
                  paragraphIndent={
                    formattingSettings.firstLineIndent === '0' ? '0px' :
                    formattingSettings.firstLineIndent.endsWith('char') ?
                      `${parseInt(formattingSettings.firstLineIndent)}em` :
                      formattingSettings.firstLineIndent
                  }
                  isFullScreen={isFullScreen}
                  wordCount={wordCount}
                  currentChapter={currentChapter}
                  currentBook={currentBook}
                />
              )}
            </div>

            {isRightPanelVisible && (
              <>
                <div 
                  className="border-l border-vscode-border flex"
                  style={{ width: rightPanelWidth, minWidth: 200, maxWidth: 800 }}
                >
                  <div
                    className="w-2 cursor-col-resize hover:bg-vscode-active resize-handle flex items-center justify-center"
                    onMouseDown={handleRightPanelDragStart}
                    title="拖动调整宽度"
                  >
                    <div className="w-1 h-8 bg-vscode-border rounded" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {rightActivity === 'preview' ? (
                      tabs.length > 0 ? (
                        <TabView
                          tabs={tabs}
                          activeTabId={activeTabId}
                          onTabChange={handleTabChange}
                          onTabClose={handleTabClose}
                          onTabAdd={handleTabAdd}
                          onModeChange={handleModeChange}
                          onImport={handleImportFromTab}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-vscode-text opacity-50">
                          <div className="text-center">
                            <FileText size={48} className="mx-auto mb-2 opacity-50" />
                            <p>暂无打开的标签页</p>
                          </div>
                        </div>
                      )
                    ) : rightActivity === 'outline' ? (
                      currentBook ? (
                        <VolumeTree
                          book={currentBook}
                          onVolumeSelect={handleVolumeOutlineSelect}
                          onChapterSelect={handleChapterOutlineSelect}
                          activeVolumeId={currentOutlineVolume?.id || null}
                          activeChapterId={currentOutlineChapter?.id || null}
                          refreshTrigger={outlineRefreshTrigger}
                          volumesWithChapters={volumesWithChapters}
                          onOutlineExtract={handleOutlineExtract}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-vscode-text opacity-50">
                          <div className="text-center">
                            <BookOpen size={48} className="mx-auto mb-2 opacity-50" />
                            <p>请先选择一本书</p>
                          </div>
                        </div>
                      )
                    ) : (
                      <QAPanel
                        bookId={currentBook?.id}
                        currentChapter={currentChapter}
                        onSelectRecord={(record) => {
                          showToast(`质检记录: ${record.id}`, 'info');
                        }}
                      />
                    )}
                  </div>
                </div>
                <RightActivityBar 
                  activeActivity={rightActivity}
                  onActivityClick={handleRightActivityClick}
                  isPanelVisible={isRightPanelVisible}
                />
              </>
            )}
            {!isRightPanelVisible && (
              <RightActivityBar 
                activeActivity={rightActivity}
                onActivityClick={(id) => {
                  setRightActivity(id);
                  setIsRightPanelVisible(true);
                }}
              />
            )}
          </div>
        </div>

      <StatusBar
        wordCount={wordCount}
        totalWords={currentBook?.totalWords ?? 0}
        saveStatus={saveStatus}
        readingTime={getReadingTime()}
        writingGoal={writingGoal}
        todayWordCount={todayWordCount}
        pomodoro={pomodoro}
        onTogglePomodoro={togglePomodoro}
        onResetPomodoro={resetPomodoro}
        onSwitchMode={switchPomodoroMode}
        formatTime={formatTime}
        onShowWritingGoal={() => showToast('写作目标功能开发中', 'info')}
        onToggleFullScreen={toggleFullScreen}
        isFullScreen={isFullScreen}
        theme={theme}
        onThemeChange={setTheme}
        onExport={handleExport}
        onFullExport={handleFullExport}
        onImport={handleImportClick}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onFindReplace={handleFindReplace}
        onFormat={() => setShowFormattingSettings(true)}
        onSyncToAgent={handleSyncToAgent}
        agentSyncing={agentSyncing}
      />

{/* 排版设置面板 */}
      {showFormattingSettings && (
        <FormattingSettingsPanel
          settings={formattingSettings}
          onClose={() => setShowFormattingSettings(false)}
          onSave={handleSaveFormattingSettings}
          onFormat={handleFormat}
        />
      )}

      {/* 导入选项弹窗 */}
      {showImportModal && importPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-vscode-sidebar border border-vscode-border p-6 min-w-[400px] max-w-[500px]">
            <h3 className="text-lg font-semibold text-vscode-text mb-4">导入数据</h3>
            <div className="text-sm text-vscode-text opacity-70 mb-6">
              <p>检测到备份文件，包含：</p>
              <ul className="mt-2 space-y-1">
                <li>书籍: {importPreview.books?.length || 0} 个</li>
                <li>卷: {importPreview.volumes?.length || 0} 个</li>
                <li>章节: {importPreview.chapters?.length || 0} 个</li>
                <li>素材: {importPreview.materials?.length || 0} 个</li>
                <li>用户: {importPreview.users?.length || 0} 个</li>
              </ul>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => confirmImport(true)}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                合并导入
              </button>
              <button
                onClick={() => confirmImport(false)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
              >
                覆盖导入
              </button>
              <button
                onClick={() => { setShowImportModal(false); setImportPreview(null); }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 通知 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default App;
