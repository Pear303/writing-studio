const DB_NAME = 'fonts-db';
const DB_VERSION = 1;
const STORE_NAME = 'custom-fonts';

export interface FontRecord {
  id: string;
  name: string;
  family: string;
  category: 'chinese' | 'english';
  data: ArrayBuffer;
  addedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveFontToIndexedDB(font: FontRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(font);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    db.close();
  });
}

export async function getAllFontsFromIndexedDB(): Promise<FontRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    db.close();
  });
}

export async function deleteFontFromIndexedDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    db.close();
  });
}

export async function loadFontFromFile(file: File): Promise<FontInfo> {
  const buffer = await file.arrayBuffer();
  const family = `custom-font-${Date.now()}`;
  const fontFace = new FontFace(family, buffer);
  await fontFace.load();
  document.fonts.add(fontFace);
  return {
    name: file.name.replace(/\.[^.]+$/, ''),
    family,
    category: 'chinese',
    isCustom: true,
    isLoaded: true,
  };
}

export function isFontLoaded(family: string): boolean {
  return document.fonts.check(`12px "${family}"`);
}

export function unloadFont(family: string): void {
  document.fonts.forEach((font) => {
    if (font.family === family) {
      document.fonts.delete(font);
    }
  });
}

export function getLoadedFonts(): FontFace[] {
  const fonts: FontFace[] = [];
  document.fonts.forEach((font) => {
    fonts.push(font);
  });
  return fonts;
}

export interface FontInfo {
  name: string;
  family: string;
  category: 'chinese' | 'english';
  isCustom: boolean;
  isLoaded: boolean;
}