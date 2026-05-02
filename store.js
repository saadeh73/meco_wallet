// store.js - النسخة النهائية الموحدة للأمان والاستقرار

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keypair } from '@solana/web3.js';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';

const ACCOUNTS_STORAGE_KEY = '@meco_accounts';
const ACTIVE_ACCOUNT_INDEX_KEY = '@meco_active_account_index';

const OLD_PRIVATE_KEY = 'wallet_private_key';
const OLD_PUBLIC_KEY = 'wallet_public_key';
const OLD_MNEMONIC = 'wallet_mnemonic';

export const useAppStore = create((set, get) => ({
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
    } catch (error) {}
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
    } catch (error) {}
  },

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
    } catch (e) {}
    return [];
  },

  saveAccounts: async (accounts) => {
    try {
      await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (e) {}
  },

  loadActiveAccount: async () => {
    try {
      let accounts = await get().loadAccounts();
      if (accounts.length === 0) {
        const oldPublicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
        if (oldPublicKey) {
          accounts = [{ index: 0, name: 'الحساب الرئيسي', publicKey: oldPublicKey, isLegacy: true }];
          set({ accounts });
          await get().saveAccounts(accounts);
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
      return false;
    }
  },

  setActiveAccount: async (index) => {
    const { accounts } = get();
    if (index >= accounts.length) return false;

    try {
      let privateKey, publicKey;

      // 1. البحث في SecureStore
      const storedPrivateKey = await SecureStore.getItemAsync(`wallet_private_key_${index}`);
      if (storedPrivateKey && accounts[index]?.publicKey) {
        privateKey = storedPrivateKey;
        publicKey = accounts[index].publicKey;
      }

      // 2. استخدام المفتاح القديم (للحساب 0 فقط)
      if (!privateKey && index === 0) {
        const oldPrivateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
        const oldPublicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
        if (oldPrivateKey && oldPublicKey) {
          privateKey = oldPrivateKey;
          publicKey = oldPublicKey;
        }
      }

      // 3. الاشتقاق من العبارة إذا لم نجد شيئاً
      if (!privateKey) {
        const mnemonic = await SecureStore.getItemAsync(OLD_MNEMONIC);
        if (!mnemonic) return false;

        const seed = await bip39.mnemonicToSeed(mnemonic);
        const path = `m/44'/501'/${index}'/0'`;
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        const keypair = Keypair.fromSeed(derivedSeed);
        privateKey = bs58.encode(keypair.secretKey);
        publicKey = keypair.publicKey.toBase58();
        await SecureStore.setItemAsync(`wallet_private_key_${index}`, privateKey);
      }

      set({
        activeAccountIndex: index,
        walletPublicKey: publicKey,
        walletPrivateKey: privateKey,
        currentWallet: publicKey,
      });

      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, index.toString());
      return true;
    } catch (e) {
      return false;
    }
  },

  addAccount: async (name) => {
    const { accounts } = get();
    const newIndex = accounts.length;
    try {
      const mnemonic = await SecureStore.getItemAsync(OLD_MNEMONIC);
      if (!mnemonic) throw new Error('عبارة الاسترداد غير موجودة');

      // استخدم المفتاح المُخزّن مسبقاً من ImportWalletScreen إن وجد
      const preStoredPrivateKey = await SecureStore.getItemAsync(`wallet_private_key_${newIndex}`);

      let publicKey, privateKey;

      if (preStoredPrivateKey) {
        // استخدم المفتاح المُخزّن مباشرة
        const keypair = Keypair.fromSecretKey(bs58.decode(preStoredPrivateKey));
        publicKey = keypair.publicKey.toBase58();
        privateKey = preStoredPrivateKey;
      } else {
        // اشتقاق جديد إذا لم يكن مخزّناً
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const keypair = Keypair.fromSeed(derivePath(`m/44'/501'/${newIndex}'/0'`, seed.toString('hex')).key);
        publicKey = keypair.publicKey.toBase58();
        privateKey = bs58.encode(keypair.secretKey);
        await SecureStore.setItemAsync(`wallet_private_key_${newIndex}`, privateKey);
      }

      const newAccount = { index: newIndex, name: name || `الحساب ${newIndex + 1}`, publicKey };
      const updatedAccounts = [...accounts, newAccount];
      set({ accounts: updatedAccounts });
      await get().saveAccounts(updatedAccounts);
      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, newIndex.toString());
      await get().setActiveAccount(newIndex);
      return newAccount;
    } catch (e) {
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
    const updatedAccounts = accounts.map((acc, i) =>
      i === index ? { ...acc, name: newName.trim() } : acc
    );
    set({ accounts: updatedAccounts });
    await get().saveAccounts(updatedAccounts);
    return true;
  },

  deleteAccount: async (index) => {
    const { accounts, activeAccountIndex } = get();
    if (accounts.length <= 1) return { success: false, error: 'cannot_delete_last_account' };
    if (index >= accounts.length) return { success: false, error: 'invalid_account' };

    try {
      // حذف المفتاح الخاص
      await SecureStore.deleteItemAsync(`wallet_private_key_${index}`);

      const updatedAccounts = accounts.filter((_, i) => i !== index);
      const reindexedAccounts = updatedAccounts.map((acc, i) => ({ ...acc, index: i }));

      set({ accounts: reindexedAccounts });
      await get().saveAccounts(reindexedAccounts);

      let newActiveIndex = activeAccountIndex;
      if (index === activeAccountIndex) {
        newActiveIndex = index > 0 ? index - 1 : 0;
      } else if (index < activeAccountIndex) {
        newActiveIndex = activeAccountIndex - 1;
      }

      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, newActiveIndex.toString());
      await get().setActiveAccount(newActiveIndex);
      return { success: true };
    } catch (e) {
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
      return false;
    }
  },

  logout: async () => {
    try {
      set({
        accounts: [],
        activeAccountIndex: 0,
        walletPublicKey: null,
        walletPrivateKey: null,
        currentWallet: null,
      });
    } catch (e) {}
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
      set({
        accounts: [],
        activeAccountIndex: 0,
        walletPublicKey: null,
        walletPrivateKey: null,
        currentWallet: null,
      });
    } catch (e) {}
  },
}));

export async function hasLegacyWallet() {
  try {
    const publicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
    const privateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
    return !!(publicKey && privateKey);
  } catch (e) {
    return false;
  }
}

export async function hasMnemonic() {
  try {
    return !!(await SecureStore.getItemAsync(OLD_MNEMONIC));
  } catch (e) {
    return false;
  }
}
