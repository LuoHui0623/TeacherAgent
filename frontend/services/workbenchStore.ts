/* 工作台布局状态：左侧导航 + 主区切换（无路由库） */
import { create } from 'zustand';

export type ModuleKey =
  | 'knowledge-map'
  | 'bookshelf'
  | 'learning-zone'
  | 'notes'
  | 'profile';

interface WorkbenchState {
  activeModule: ModuleKey;
  setActive: (key: ModuleKey) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  activeModule: 'learning-zone',
  setActive: (key) => set({ activeModule: key }),
}));
