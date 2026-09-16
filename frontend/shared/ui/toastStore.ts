import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  leaving?: boolean;
}

interface ToastState {
  items: ToastItem[];
  push: (item: Omit<ToastItem, 'id'>) => number;
  dismiss: (id: number) => void;
}

let toastId = 0;
const toastExitDuration = 180;

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (item) => {
    const id = ++toastId;
    set((state) => ({ items: [...state.items, { ...item, id }] }));
    window.setTimeout(() => {
      useToastStore.getState().dismiss(id);
    }, 4200);
    return id;
  },
  dismiss: (id) => {
    const item = get().items.find((current) => current.id === id);
    if (!item || item.leaving) return;

    set((state) => ({
      items: state.items.map((current) =>
        current.id === id ? { ...current, leaving: true } : current,
      ),
    }));
    window.setTimeout(() => {
      set((state) => ({
        items: state.items.filter((current) => current.id !== id),
      }));
    }, toastExitDuration);
  },
}));

export function toast(
  title: string,
  options: { description?: string; variant?: ToastVariant } = {},
): number {
  return useToastStore.getState().push({
    title,
    description: options.description,
    variant: options.variant ?? 'info',
  });
}
