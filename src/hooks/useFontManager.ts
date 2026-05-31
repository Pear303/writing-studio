import { useState, useEffect, useCallback } from 'react';
import { PRESET_FONTS, type FontInfo, type CustomFontMeta } from '../types';
import {
  loadFontFromFile,
  saveFontToIndexedDB,
  getAllFontsFromIndexedDB,
  deleteFontFromIndexedDB,
  unloadFont,
  type FontRecord,
} from '../utils/fontLoader';

const FONT_SETTINGS_KEY = 'fontSettings';
const CUSTOM_FONTS_KEY = 'customFontMetaList';

export interface FontSettings {
  chineseFont: string;
  englishFont: string;
  fontSize: string;
  fontApplyScope: 'global' | 'editor';
}

function loadSettings(): FontSettings {
  const saved = localStorage.getItem(FONT_SETTINGS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore parse error
    }
  }
  return {
    chineseFont: 'Microsoft YaHei',
    englishFont: 'Arial',
    fontSize: '16',
    fontApplyScope: 'editor',
  };
}

function saveSettings(settings: FontSettings) {
  localStorage.setItem(FONT_SETTINGS_KEY, JSON.stringify(settings));
}

function loadCustomFontMeta(): CustomFontMeta[] {
  const saved = localStorage.getItem(CUSTOM_FONTS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore parse error
    }
  }
  return [];
}

function saveCustomFontMeta(meta: CustomFontMeta[]) {
  localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(meta));
}

export function useFontManager() {
  const [presetFonts] = useState<Omit<FontInfo, 'isLoaded'>[]>(PRESET_FONTS);
  const [customFonts, setCustomFonts] = useState<CustomFontMeta[]>([]);
  const [settings, setSettings] = useState<FontSettings>(loadSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function initCustomFonts() {
      try {
        const metaList = loadCustomFontMeta();
        const records = await getAllFontsFromIndexedDB();
        for (const record of records) {
          if (!document.fonts.check(`12px "${record.family}"`)) {
            const fontFace = new FontFace(record.family, record.data);
            await fontFace.load();
            document.fonts.add(fontFace);
          }
        }
        setCustomFonts(metaList);
      } catch (err) {
        console.error('Failed to load custom fonts:', err);
      } finally {
        setIsLoading(false);
      }
    }
    initCustomFonts();
  }, []);

  useEffect(() => {
    if (settings.fontApplyScope === 'global') {
      document.documentElement.style.setProperty('--app-font-family', settings.chineseFont);
      document.documentElement.style.removeProperty('--editor-font-family');
    } else {
      document.documentElement.style.removeProperty('--app-font-family');
      document.documentElement.style.setProperty('--editor-font-family', settings.chineseFont);
    }
  }, [settings.fontApplyScope, settings.chineseFont]);

  const updateSettings = useCallback((newSettings: Partial<FontSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const addCustomFont = useCallback(async (file: File): Promise<CustomFontMeta | null> => {
    const validTypes = [
      'font/ttf',
      'font/otf',
      'font/woff',
      'font/woff2',
      'application/x-font-ttf',
      'application/x-font-opentype',
    ];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['ttf', 'otf', 'woff', 'woff2'];
    if (!validTypes.includes(file.type) && !validExts.includes(ext || '')) {
      throw new Error('不支持的文件格式。请上传 TTF、OTF、WOFF 或 WOFF2 格式的字体文件。');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('字体文件过大，请上传小于 10MB 的文件。');
    }
    try {
      const fontInfo = await loadFontFromFile(file);
      const meta: CustomFontMeta = {
        id: Date.now().toString(),
        name: fontInfo.name,
        family: fontInfo.family,
        category: 'chinese',
        addedAt: Date.now(),
      };
      const buffer = await file.arrayBuffer();
      const record: FontRecord = {
        id: meta.id,
        name: meta.name,
        family: meta.family,
        category: meta.category,
        data: buffer,
        addedAt: meta.addedAt,
      };
      await saveFontToIndexedDB(record);
      setCustomFonts((prev) => {
        const updated = [...prev, meta];
        saveCustomFontMeta(updated);
        return updated;
      });
      return meta;
    } catch (err) {
      console.error('Failed to add custom font:', err);
      throw err;
    }
  }, []);

  const removeCustomFont = useCallback(async (id: string) => {
    const meta = customFonts.find((f) => f.id === id);
    if (meta) {
      unloadFont(meta.family);
      await deleteFontFromIndexedDB(id);
      setCustomFonts((prev) => {
        const updated = prev.filter((f) => f.id !== id);
        saveCustomFontMeta(updated);
        return updated;
      });
    }
  }, [customFonts]);

  const getAllFonts = useCallback((): FontInfo[] => {
    const preset: FontInfo[] = presetFonts.map((f) => ({ ...f, isLoaded: true }));
    const custom: FontInfo[] = customFonts.map((f) => ({
      id: f.id,
      name: f.name,
      family: f.family,
      category: f.category,
      isCustom: true,
      isLoaded: document.fonts.check(`12px "${f.family}"`),
    }));
    return [...preset, ...custom];
  }, [presetFonts, customFonts]);

  const getChineseFonts = useCallback((): FontInfo[] => {
    return getAllFonts().filter((f) => f.category === 'chinese');
  }, [getAllFonts]);

  const getEnglishFonts = useCallback((): FontInfo[] => {
    return getAllFonts().filter((f) => f.category === 'english');
  }, [getAllFonts]);

  return {
    isLoading,
    settings,
    updateSettings,
    addCustomFont,
    removeCustomFont,
    getAllFonts,
    getChineseFonts,
    getEnglishFonts,
    customFonts,
  };
}