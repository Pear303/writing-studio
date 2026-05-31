import React, { useState } from 'react';
import { Type, Palette, ChevronDown, ChevronUp } from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface WritingSettingsProps {
  editor: Editor | null;
}

// 此组件已废弃，功能已移至Toolbar组件
export const WritingSettings = (): null => {
  return null;
};
