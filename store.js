import { create } from 'zustand';

export const useAppStore = create(set => ({
  language: 'ar',
  theme: 'dark',

  setLanguage: (lang) => set({ language: lang }),
  toggleTheme: () => set(state => ({
    theme: state.theme === 'dark' ? 'light' : 'dark'
  })),
}));
