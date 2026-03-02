import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useAppStore = create((set, get) => ({
  // ====== إعداداتك الأصلية ======
  theme: 'dark', // تم تغيير القيمة من 'light' إلى 'dark'
  toggleTheme: () =>
    set((state) => ({
      theme: state.theme === 'light' ? 'dark' : 'light',
    })),

  // ✅ تعديل اللغة مع الحفظ التلقائي
  language: 'ar', // القيمة الافتراضية
  setLanguage: async (lang) => {
    await AsyncStorage.setItem('app_language', lang);
    set({ language: lang });
  },

  // ✅ دالة جديدة لتحميل اللغة المحفوظة
  loadLanguage: async () => {
    try {
      const savedLang = await AsyncStorage.getItem('app_language');
      if (savedLang) {
        set({ language: savedLang });
      }
    } catch (error) {
      console.warn('Failed to load language:', error.message);
    }
  },

  walletName: 'MECO Wallet',
  setWalletName: (name) => set({ walletName: name }),

  // ✅ تم تغيير اللون الافتراضي من الأخضر (#00b97f) إلى الأزرق (#6C63FF)
  primaryColor: '#6C63FF',
  setPrimaryColor: (color) => set({ primaryColor: color }),

  // ====== بيانات المحفظة ======
  walletPublicKey: null,
  walletPrivateKey: null,
  currentWallet: null, // ✅ تم الإضافة

  loadWallet: async () => {
    try {
      const publicKey = await SecureStore.getItemAsync('wallet_public_key');
      const privateKey = await SecureStore.getItemAsync('wallet_private_key');

      if (!publicKey || !privateKey) {
        return false;
      }

      set({
        walletPublicKey: publicKey,
        walletPrivateKey: privateKey,
        currentWallet: publicKey, // ✅ تم الإضافة
      });

      return true;
    } catch (e) {
      console.warn('Wallet info load error:', e.message);
      return false;
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('wallet_private_key');
    await SecureStore.deleteItemAsync('wallet_public_key');
    await SecureStore.deleteItemAsync('wallet_mnemonic');
    await SecureStore.deleteItemAsync('wallet_initialized');

    set({
      walletPublicKey: null,
      walletPrivateKey: null,
      currentWallet: null, // ✅ تم الإضافة
    });
  },
}));
