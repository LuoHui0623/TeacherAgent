/* 工作台布局状态：左侧导航 + 主区切换（无路由库） */
import { create } from 'zustand';

export type ModuleKey =
  | 'workbench'
  | 'knowledge-map'
  | 'bookshelf'
  | 'learning-zone'
  | 'content-pipeline'
  | 'notes'
  | 'settings';

interface WorkbenchState {
  activeModule: ModuleKey;
  activeTextbookId: string;
  sidebarCollapsed: boolean;
  immersiveMode: boolean;
  setActive: (key: ModuleKey) => void;
  setImmersiveMode: (enabled: boolean) => void;
  toggleImmersiveMode: () => void;
  openTextbook: (textbookId: string) => void;
  toggleSidebar: () => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  activeModule: 'learning-zone',
  activeTextbookId: '94134faf-b49c-4a50-bd46-2c9c92654bc4',
  sidebarCollapsed: true,
  immersiveMode: true,
  setActive: (key) =>
    set({
      activeModule: key,
      immersiveMode: key === 'learning-zone',
      sidebarCollapsed: key === 'learning-zone',
    }),
  setImmersiveMode: (enabled) =>
    set({ immersiveMode: enabled, sidebarCollapsed: enabled }),
  toggleImmersiveMode: () =>
    set((state) => ({
      immersiveMode: !state.immersiveMode,
      sidebarCollapsed: !state.immersiveMode,
    })),
  openTextbook: (textbookId) =>
    set({
      activeTextbookId: textbookId,
      activeModule: 'learning-zone',
      immersiveMode: true,
      sidebarCollapsed: true,
    }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
