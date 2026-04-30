// store.js - الإصلاح النهائي للحفاظ على المحفظة

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keypair } from '@solana/web3.js';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';

// مفاتيح التخزين
const ACCOUNTS_STORAGE_KEY = '@meco_accounts';
const ACTIVE_ACCOUNT_INDEX_KEY = '@meco_active_account_index';

// المفاتيح القديمة للتوافقية
const OLD_PRIVATE_KEY = 'wallet_private_key';
const OLD_PUBLIC_KEY = 'wallet_public_key';
const OLD_MNEMONIC = 'wallet_mnemonic';

export const useAppStore = create((set, get) => ({
  // ====== إعدادات التطبيق ======
  theme: 'dark',
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  
  language: 'ar',
  setLanguage: async (lang) => {
    await AsyncStorage.setItem('app_language', lang);
    set({ language: lang });
  },
  loadLanguage: async () => {
    try {
      const savedLang = await AsyncStorage.getItem('app_language');
      if (savedLang) set({ language: savedLang });
    } catch (error) { console.warn('Failed to load language:', error.message); }
  },

  walletName: 'MECO Wallet',
  setWalletName: (name) => set({ walletName: name }),

  primaryColor: '#6C63FF',
  setPrimaryColor: async (color) => {
    await AsyncStorage.setItem('app_primary_color', color);
    set({ primaryColor: color });
  },
  loadPrimaryColor: async () => {
    try {
      const savedColor = await AsyncStorage.getItem('app_primary_color');
      if (savedColor) set({ primaryColor: savedColor });
    } catch (error) { console.warn('Failed to load primary color:', error.message); }
  },

  // ====== نظام الحسابات ======
  accounts: [],
  activeAccountIndex: 0,
  walletPublicKey: null,
  walletPrivateKey: null,
  currentWallet: null,

  loadAccounts: async () => {
    try {
      const stored = await AsyncStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (stored) {
        const accounts = JSON.parse(stored);
        set({ accounts });
        return accounts;
      }
    } catch (e) { console.warn('Failed to load accounts:', e.message); }
    return [];
  },

  saveAccounts: async (accounts) => {
    try {
      await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (e) { console.warn('Failed to save accounts:', e.message); }
  },

  // ★★★ الإصلاح الرئيسي ★★★
  loadActiveAccount: async () => {
    try {
      let accounts = await get().loadAccounts();

      // إذا لا توجد حسابات، جرب تحميل المحفظة القديمة
      if (accounts.length === 0) {
        const oldPublicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
        if (oldPublicKey) {
          accounts = [{ index: 0, name: 'الحساب الرئيسي', publicKey: oldPublicKey, isLegacy: true }];
          set({ accounts });
          await get().saveAccounts(accounts);
          console.log('✅ [Store] تم استعادة المحفظة القديمة');
        }
      }

      const savedIndex = await AsyncStorage.getItem(ACTIVE_ACCOUNT_INDEX_KEY);
      let activeIndex = savedIndex !== null ? parseInt(savedIndex) : 0;

      if (activeIndex >= accounts.length) {
        activeIndex = 0;
        await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, '0');
      }

      if (accounts.length > 0) {
        await get().setActiveAccount(activeIndex);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Failed to load active account:', e.message);
      return false;
    }
  },

  // ★★★ الإصلاح الرئيسي ★★★
  setActiveAccount: async (index) => {
    const { accounts } = get();
    if (index >= accounts.length) return false;

    try {
      let privateKey;
      let publicKey;

      // للحساب 0، جرب المفتاح القديم أولاً
      if (index === 0) {
        const oldPrivateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
        const oldPublicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
        if (oldPrivateKey && oldPublicKey) {
          privateKey = oldPrivateKey;
          publicKey = oldPublicKey;
          console.log('✅ [Store] استخدام المفتاح القديم للحساب 0');
        }
      }

      // جرب المفتاح المخزن بالحافظ الجديد
      if (!privateKey) {
        const storedPrivateKey = await SecureStore.getItemAsync(`wallet_private_key_${index}`);
        const storedPublicKey = accounts[index]?.publicKey;
        if (storedPrivateKey && storedPublicKey) {
          privateKey = storedPrivateKey;
          publicKey = storedPublicKey;
        }
      }

      // توليد من Mnemonic
      if (!privateKey) {
        const mnemonic = await SecureStore.getItemAsync(OLD_MNEMONIC);
        if (!mnemonic) {
          console.error('❌ [Store] لا يوجد mnemonic');
          return false;
        }
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const path = `m/44'/501'/${index}'/0'`;
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        const keypair = Keypair.fromSeed(derivedSeed);
        privateKey = bs58.encode(keypair.secretKey);
        publicKey = keypair.publicKey.toBase58();
      }

      set({
        activeAccountIndex: index,
        walletPublicKey: publicKey,
        walletPrivateKey: privateKey,
        currentWallet: publicKey,
      });

      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, index.toString());
      await SecureStore.setItemAsync(`wallet_private_key_${index}`, privateKey);
      return true;
    } catch (e) {
      console.warn('Failed to set active account:', e.message);
      return false;
    }
  },

  addAccount: async (name) => {
    const { accounts } = get();
    const newIndex = accounts.length;
    try {
      const mnemonic = await SecureStore.getItemAsync(OLD_MNEMONIC);
      if (!mnemonic) throw new Error('عبارة الاسترداد غير موجودة');

      const seed = await bip39.mnemonicToSeed(mnemonic);
      const path = `m/44'/501'/${newIndex}'/0'`;
      const derivedSeed = derivePath(path, seed.toString('hex')).key;
      const keypair = Keypair.fromSeed(derivedSeed);

      const publicKey = keypair.publicKey.toBase58();
      const privateKey = bs58.encode(keypair.secretKey);

      const newAccount = { index: newIndex, name: name || `الحساب ${newIndex + 1}`, publicKey };
      await SecureStore.setItemAsync(`wallet_private_key_${newIndex}`, privateKey);

      const updatedAccounts = [...accounts, newAccount];
      set({ accounts: updatedAccounts });
      await get().saveAccounts(updatedAccounts);
      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, newIndex.toString());
      await get().setActiveAccount(newIndex);
      return newAccount;
    } catch (e) {
      console.warn('Failed to add account:', e.message);
      throw e;
    }
  },

  switchAccount: async (index) => {
    await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, index.toString());
    return await get().setActiveAccount(index);
  },

  renameAccount: async (index, newName) => {
    const { accounts } = get();
    if (index >= accounts.length) return false;
    const updatedAccounts = accounts.map((acc, i) => i === index ? { ...acc, name: newName.trim() } : acc);
    set({ accounts: updatedAccounts });
    await get().saveAccounts(updatedAccounts);
    return true;
  },

  deleteAccount: async (index) => {
    const { accounts, activeAccountIndex } = get();
    if (accounts.length <= 1) return { success: false, error: 'cannot_delete_last_account' };
    if (index >= accounts.length) return { success: false, error: 'invalid_account' };

    try {
      await SecureStore.deleteItemAsync(`wallet_private_key_${index}`);
      const updatedAccounts = accounts.filter((_, i) => i !== index);
      const reindexedAccounts = updatedAccounts.map((acc, i) => ({ ...acc, index: i }));

      set({ accounts: reindexedAccounts });
      await get().saveAccounts(reindexedAccounts);

      let newActiveIndex = activeAccountIndex;
      if (index === activeAccountIndex) newActiveIndex = index > 0 ? index - 1 : 0;
      else if (index < activeAccountIndex) newActiveIndex = activeAccountIndex - 1;

      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, newActiveIndex.toString());
      await get().setActiveAccount(newActiveIndex);
      return { success: true };
    } catch (e) {
      console.warn('Failed to delete account:', e.message);
      return { success: false, error: e.message };
    }
  },

  loadWallet: async () => {
    try {
      const success = await get().loadActiveAccount();
      if (success) return true;

      const publicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
      const privateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
      if (!publicKey || !privateKey) return false;

      set({ walletPublicKey: publicKey, walletPrivateKey: privateKey, currentWallet: publicKey });

      const accounts = [{ index: 0, name: 'الحساب الرئيسي', publicKey, isLegacy: true }];
      set({ accounts });
      await get().saveAccounts(accounts);
      return true;
    } catch (e) {
      console.warn('Wallet info load error:', e.message);
      return false;
    }
  },

  // ★★★ الإصلاح الرئيسي ★★★ - هذا أهم جزء!
  logout: async () => {
    try {
      // الاحتفاظ بالمفتاح العام والخاص والـ mnemonic
      const publicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
      const privateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
      // لا تحذف mnemonic!

      // حذف بيانات الحسابات المتعددة فقط
      const accounts = await get().loadAccounts();
      for (let i = 0; i < accounts.length; i++) {
        await SecureStore.deleteItemAsync(`wallet_private_key_${i}`);
      }
      await AsyncStorage.removeItem(ACCOUNTS_STORAGE_KEY);
      await AsyncStorage.removeItem(ACTIVE_ACCOUNT_INDEX_KEY);

      // إعادة تعيين الحالة مع الحفاظ على المحفظة
      set({
        accounts: [],
        activeAccountIndex: 0,
        walletPublicKey: publicKey,
        walletPrivateKey: privateKey,
        currentWallet: publicKey,
      });

      console.log('✅ [Store] تم تسجيل الخروج مع الحفاظ على المحفظة');
    } catch (e) {
      console.error('❌ [Store] خطأ في تسجيل الخروج:', e.message);
    }
  },

  resetWallet: async () => {
    try {
      const accounts = await get().loadAccounts();
      for (let i = 0; i < accounts.length; i++) {
        await SecureStore.deleteItemAsync(`wallet_private_key_${i}`);
      }
      await SecureStore.deleteItemAsync(OLD_PRIVATE_KEY);
      await SecureStore.deleteItemAsync(OLD_PUBLIC_KEY);
      await SecureStore.deleteItemAsync(OLD_MNEMONIC);
      await AsyncStorage.removeItem(ACCOUNTS_STORAGE_KEY);
      await AsyncStorage.removeItem(ACTIVE_ACCOUNT_INDEX_KEY);
      set({ accounts: [], activeAccountIndex: 0, walletPublicKey: null, walletPrivateKey: null, currentWallet: null });
    } catch (e) { console.error('❌ [Store] خطأ:', e.message); }
  },
}));

// دوال مساعدة
export async function hasLegacyWallet() {
  try {
    const publicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
    const privateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
    return !!(publicKey && privateKey);
  } catch (e) { return false; }
}

export async function hasMnemonic() {
  try { return !!await SecureStore.getItemAsync(OLD_MNEMONIC); }
  catch (e) { return false; }
}
