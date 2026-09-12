import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ColorScheme = 'jade' | 'blue' | 'violet' | 'amber';
export type FontFamily = 'system' | 'humanist' | 'serif' | 'mono';
export type FontSize = 'small' | 'medium' | 'large';

interface PreferencesState {
  colorScheme: ColorScheme;
  fontFamily: FontFamily;
  fontSize: FontSize;
  setColorScheme: (value: ColorScheme) => void;
  setFontFamily: (value: FontFamily) => void;
  setFontSize: (value: FontSize) => void;
}

const FONT_SIZE_VALUES: Record<FontSize, string> = {
  small: '14px',
  medium: '15px',
  large: '17px',
};

export function applyPreferences(state: Pick<
  PreferencesState,
  'colorScheme' | 'fontFamily' | 'fontSize'
>) {
  const root = document.documentElement;
  root.dataset.colorScheme = state.colorScheme;
  root.dataset.fontFamily = state.fontFamily;
  root.dataset.fontSize = state.fontSize;
  root.style.setProperty('--app-font-size', FONT_SIZE_VALUES[state.fontSize]);
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      colorScheme: 'jade',
      fontFamily: 'system',
      fontSize: 'medium',
      setColorScheme: (value) =>
        set((state) => {
          const next = { ...state, colorScheme: value };
          applyPreferences(next);
          return next;
        }),
      setFontFamily: (value) =>
        set((state) => {
          const next = { ...state, fontFamily: value };
          applyPreferences(next);
          return next;
        }),
      setFontSize: (value) =>
        set((state) => {
          const next = { ...state, fontSize: value };
          applyPreferences(next);
          return next;
        }),
    }),
    {
      name: 'teacheragent-preferences',
      onRehydrateStorage: () => (state) => {
        if (state) applyPreferences(state);
      },
    },
  ),
);
