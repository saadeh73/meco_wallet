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

export const useAppStore = create((set, get) => ({
  // ====== إعدادات التطبيق ======
  theme: 'dark',
  toggleTheme: () =>
    set((state) => ({
      theme: state.theme === 'light' ? 'dark' : 'light',
    })),

  language: 'ar',
  setLanguage: async (lang) => {
    await AsyncStorage.setItem('app_language', lang);
    set({ language: lang });
  },

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

  primaryColor: '#6C63FF',
  setPrimaryColor: async (color) => {
    await AsyncStorage.setItem('app_primary_color', color);
    set({ primaryColor: color });
  },
  loadPrimaryColor: async () => {
    try {
      const savedColor = await AsyncStorage.getItem('app_primary_color');
      if (savedColor) {
        set({ primaryColor: savedColor });
      }
    } catch (error) {
      console.warn('Failed to load primary color:', error.message);
    }
  },

  // ====== نظام الحسابات المتعددة ======
  accounts: [],
  activeAccountIndex: 0,
  walletPublicKey: null,
  walletPrivateKey: null,
  currentWallet: null,

  // تحميل الحسابات من AsyncStorage
  loadAccounts: async () => {
    try {
      const stored = await AsyncStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (stored) {
        const accounts = JSON.parse(stored);
        set({ accounts });
        return accounts;
      }
    } catch (e) {
      console.warn('Failed to load accounts:', e.message);
    }
    return [];
  },

  // حفظ الحسابات
  saveAccounts: async (accounts) => {
    try {
      await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (e) {
      console.warn('Failed to save accounts:', e.message);
    }
  },

  // تحميل الحساب النشط (مع التحقق من صحة الفهرس)
  loadActiveAccount: async () => {
    try {
      let accounts = await get().loadAccounts();

      // إذا لم تكن هناك حسابات، ننشئ الحساب الأول بناءً على المفتاح القديم (التوافقية)
      if (accounts.length === 0) {
        const publicKey = await SecureStore.getItemAsync('wallet_public_key');
        if (publicKey) {
          accounts = [{ index: 0, name: 'الحساب الرئيسي', publicKey }];
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
      console.warn('Failed to load active account:', e.message);
      return false;
    }
  },

  // 🌟 [الإصلاح السحري]: تعيين الحساب النشط مع الحفاظ على المحفظة الأساسية الأصلية
  setActiveAccount: async (index) => {
    const { accounts } = get();
    if (index >= accounts.length) return false;

    try {
      let privateKey;
      let publicKey;

      // إذا كان يطلب الحساب الأساسي (index 0)، نحاول جلب المفتاح الأصلي أولاً لمنع مسحه
      if (index === 0) {
        const originalPrivateKey = await SecureStore.getItemAsync('wallet_private_key');
        const originalPublicKey = await SecureStore.getItemAsync('wallet_public_key');
        
        if (originalPrivateKey && originalPublicKey) {
          privateKey = originalPrivateKey;
          publicKey = originalPublicKey;
        }
      }

      // إذا لم يكن الحساب 0، أو لم نجد المفتاح الأصلي، نقوم بتوليده من الـ Mnemonic
      if (!privateKey) {
        const mnemonic = await SecureStore.getItemAsync('wallet_mnemonic');
        if (!mnemonic) return false;

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

  // إضافة حساب جديد (مع اشتقاق مفتاح فريد وحفظ الفهرس)
  addAccount: async (name) => {
    const { accounts } = get();
    const newIndex = accounts.length;

    try {
      const mnemonic = await SecureStore.getItemAsync('wallet_mnemonic');
      if (!mnemonic) throw new Error('عبارة الاسترداد غير موجودة');

      const seed = await bip39.mnemonicToSeed(mnemonic);
      const path = `m/44'/501'/${newIndex}'/0'`;
      const derivedSeed = derivePath(path, seed.toString('hex')).key;
      const keypair = Keypair.fromSeed(derivedSeed);

      const publicKey = keypair.publicKey.toBase58();
      const privateKey = bs58.encode(keypair.secretKey);

      const newAccount = {
        index: newIndex,
        name: name || `الحساب ${newIndex + 1}`,
        publicKey,
      };

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

  // تبديل الحساب النشط (مع حفظ الفهرس)
  switchAccount: async (index) => {
    await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, index.toString());
    return await get().setActiveAccount(index);
  },

  // إعادة تسمية حساب
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

  // حذف حساب
  deleteAccount: async (index) => {
    const { accounts, activeAccountIndex } = get();

    if (accounts.length <= 1) {
      return { success: false, error: 'cannot_delete_last_account' };
    }

    if (index >= accounts.length) {
      return { success: false, error: 'invalid_account' };
    }

    try {
      await SecureStore.deleteItemAsync(`wallet_private_key_${index}`);

      const updatedAccounts = accounts.filter((_, i) => i !== index);

      const reindexedAccounts = updatedAccounts.map((acc, i) => ({
        ...acc,
        index: i,
      }));

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
      console.warn('Failed to delete account:', e.message);
      return { success: false, error: e.message };
    }
  },

  // تحميل المحفظة (متوافق مع القديم)
  loadWallet: async () => {
    try {
      const success = await get().loadActiveAccount();
      if (success) return true;

      const publicKey = await SecureStore.getItemAsync('wallet_public_key');
      const privateKey = await SecureStore.getItemAsync('wallet_private_key');

      if (!publicKey || !privateKey) {
        return false;
      }

      set({
        walletPublicKey: publicKey,
        walletPrivateKey: privateKey,
        currentWallet: publicKey,
      });

      return true;
    } catch (e) {
      console.warn('Wallet info load error:', e.message);
      return false;
    }
  },

  // تسجيل الخروج
  logout: async () => {
    const { activeAccountIndex } = get();

    if (activeAccountIndex !== null) {
      await SecureStore.deleteItemAsync(`wallet_private_key_${activeAccountIndex}`);
    }

    await SecureStore.deleteItemAsync('wallet_private_key');
    await SecureStore.deleteItemAsync('wallet_public_key');
    await SecureStore.deleteItemAsync('wallet_mnemonic');
    await SecureStore.deleteItemAsync('wallet_initialized');

    set({
      accounts: [],
      activeAccountIndex: 0,
      walletPublicKey: null,
      walletPrivateKey: null,
      currentWallet: null,
    });

    await AsyncStorage.removeItem(ACCOUNTS_STORAGE_KEY);
    await AsyncStorage.removeItem(ACTIVE_ACCOUNT_INDEX_KEY);
  },
}));
