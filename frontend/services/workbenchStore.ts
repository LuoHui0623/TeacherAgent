/* 工作台布局状态：左侧导航 + 主区切换（无路由库） */
import { create } from 'zustand';

export type ModuleKey =
  | 'knowledge-map'
  | 'bookshelf'
  | 'learning-zone'
  | 'notes'
  | 'profile'
  | 'settings';

interface WorkbenchState {
  activeModule: ModuleKey;
  activeTextbookId: string;
  sidebarCollapsed: boolean;
  setActive: (key: ModuleKey) => void;
  openTextbook: (textbookId: string) => void;
  toggleSidebar: () => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  activeModule: 'learning-zone',
  activeTextbookId: 'calculus',
  sidebarCollapsed: false,
  setActive: (key) => set({ activeModule: key }),
  openTextbook: (textbookId) =>
    set({ activeTextbookId: textbookId, activeModule: 'learning-zone' }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
