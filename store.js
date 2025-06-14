import { create } from 'zustand';

export const useAppStore = create((set) => ({
  theme: 'light',
  toggleTheme: () =>
    set((state) => ({
      theme: state.theme === 'light' ? 'dark' : 'light',
    })),

  language: 'ar',
  setLanguage: (lang) => set({ language: lang }),

  logout: () => {
    set({
      theme: 'light',
      language: 'ar',
    });
  },
}));
