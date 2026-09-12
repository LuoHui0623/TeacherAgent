import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastState {
  items: ToastItem[];
  push: (item: Omit<ToastItem, 'id'>) => number;
  dismiss: (id: number) => void;
}

let toastId = 0;

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (item) => {
    const id = ++toastId;
    set((state) => ({ items: [...state.items, { ...item, id }] }));
    window.setTimeout(() => {
      useToastStore.getState().dismiss(id);
    }, 4200);
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
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
