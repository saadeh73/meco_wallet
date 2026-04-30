import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import * as bip39 from '@scure/bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';

// مفاتيح التخزين
const ACCOUNTS_STORAGE_KEY = '@meco_accounts';
const ACTIVE_ACCOUNT_INDEX_KEY = '@meco_active_account_index';
const ARCHIVED_ACCOUNTS_KEY = '@meco_archived_accounts';

export const useAppStore = create((set, get) => ({
  theme: 'dark',
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

  language: 'ar',
  setLanguage: async (lang) => {
    await AsyncStorage.setItem('app_language', lang);
    set({ language: lang });
  },
  loadLanguage: async () => {
    try {
      const savedLang = await AsyncStorage.getItem('app_language');
      if (savedLang) set({ language: savedLang });
    } catch (e) {}
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
    } catch (e) {}
  },

  accounts: [],
  archivedAccounts: [],
  activeAccountIndex: 0,
  walletPublicKey: null,
  walletPrivateKey: null,

  // تحميل الحسابات
  loadAccounts: async () => {
    try {
      const storedArchived = await AsyncStorage.getItem(ARCHIVED_ACCOUNTS_KEY);
      if (storedArchived) set({ archivedAccounts: JSON.parse(storedArchived) });

      const stored = await AsyncStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (stored) {
        const accounts = JSON.parse(stored);
        set({ accounts });
        return accounts;
      }
    } catch (e) { }
    return [];
  },

  saveAccounts: async (accounts) => {
    try {
      await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (e) {}
  },

  // 🌟 [الجديد]: محرك اكتشاف الحسابات التي تمتلك رصيداً
  discoverActiveAccounts: async (mnemonic) => {
    console.log("🔍 بدء عملية استكشاف الحسابات الآلية...");
    try {
      const seed = await bip39.mnemonicToSeed(mnemonic);
      const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=fb28d3cf-7dd1-4667-9167-7941c3aceb66', 'confirmed');
      
      let discoveredAccounts = [];
      const MAX_SEARCH_DEPTH = 5; // يبحث في أول 5 حسابات

      for (let i = 0; i < MAX_SEARCH_DEPTH; i++) {
        const path = `m/44'/501'/${i}'/0'`;
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        const keypair = Keypair.fromSeed(derivedSeed);
        
        const publicKeyStr = keypair.publicKey.toBase58();
        const privateKeyStr = bs58.encode(keypair.secretKey);
        
        // المحفظة 0 تضاف إجبارياً كপ্রধানية
        if (i === 0) {
          discoveredAccounts.push({ index: i, name: 'الحساب الرئيسي', publicKey: publicKeyStr });
          await SecureStore.setItemAsync(`wallet_private_key_${i}`, privateKeyStr);
          continue;
        }

        // فحص رصيد المحافظ الأخرى
        try {
          const balance = await connection.getBalance(keypair.publicKey);
          if (balance > 0) {
            console.log(`✅ تم اكتشاف أموال في الحساب رقم ${i}`);
            discoveredAccounts.push({ index: i, name: `الحساب المسترجع ${i}`, publicKey: publicKeyStr });
            await SecureStore.setItemAsync(`wallet_private_key_${i}`, privateKeyStr);
          }
        } catch (err) {
          console.warn(`فشل فحص رصيد الحساب ${i}`);
        }
      }

      // إعادة ترقيم الفهارس (Indexes) لترتيب المصفوفة برمجياً
      const formattedAccounts = discoveredAccounts.map((acc, idx) => ({ ...acc, index: idx }));
      
      set({ accounts: formattedAccounts });
      await get().saveAccounts(formattedAccounts);
      await get().setActiveAccount(0);

      return formattedAccounts;
    } catch (error) {
      console.error("❌ فشل عملية الاستكشاف:", error);
      return [];
    }
  },

  loadActiveAccount: async () => {
    try {
      let accounts = await get().loadAccounts();

      if (accounts.length === 0) {
        const mnemonic = await SecureStore.getItemAsync('wallet_mnemonic');
        if (mnemonic) {
          // إذا وجد الميمونيك ولكن لا توجد حسابات (حدث تسجيل خروج أو مسح)، نقوم بعملية استكشاف شاملة!
          accounts = await get().discoverActiveAccounts(mnemonic);
        } else {
          // محاولة استرجاع عبر PrivateKey للمحافظ القديمة
          const publicKey = await SecureStore.getItemAsync('wallet_public_key');
          if (publicKey) {
            accounts = [{ index: 0, name: 'الحساب الرئيسي', publicKey }];
            set({ accounts });
            await get().saveAccounts(accounts);
          }
        }
      }

      const savedIndex = await AsyncStorage.getItem(ACTIVE_ACCOUNT_INDEX_KEY);
      let activeIndex = savedIndex !== null ? parseInt(savedIndex) : 0;

      if (activeIndex >= accounts.length) activeIndex = 0;

      if (accounts.length > 0) {
        await get().setActiveAccount(activeIndex);
        return true;
      }
      return false;
    } catch (e) { return false; }
  },

  setActiveAccount: async (index) => {
    const { accounts } = get();
    if (index >= accounts.length) return false;

    try {
      let privateKey;
      let publicKey;

      if (index === 0) {
        const originalPrivateKey = await SecureStore.getItemAsync('wallet_private_key');
        const originalPublicKey = await SecureStore.getItemAsync('wallet_public_key');
        if (originalPrivateKey && originalPublicKey) {
          privateKey = originalPrivateKey;
          publicKey = originalPublicKey;
        }
      }

      if (!privateKey) {
        const mnemonic = await SecureStore.getItemAsync('wallet_mnemonic');
        if (!mnemonic) return false;

        const seed = await bip39.mnemonicToSeed(mnemonic);
        // هنا نشتق بناءً على رقم الـ index
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
      });

      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, index.toString());
      await SecureStore.setItemAsync(`wallet_private_key_${index}`, privateKey);

      return true;
    } catch (e) { return false; }
  },

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

      const newAccount = { index: newIndex, name: name || `الحساب ${newIndex + 1}`, publicKey };
      await SecureStore.setItemAsync(`wallet_private_key_${newIndex}`, privateKey);

      const updatedAccounts = [...accounts, newAccount];
      set({ accounts: updatedAccounts });
      await get().saveAccounts(updatedAccounts);

      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, newIndex.toString());
      await get().setActiveAccount(newIndex);

      return newAccount;
    } catch (e) { throw e; }
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
    const { accounts, archivedAccounts, activeAccountIndex } = get();
    if (accounts.length <= 1) return { success: false, error: 'cannot_delete_last_account' };
    if (index >= accounts.length) return { success: false, error: 'invalid_account' };

    try {
      const accountToArchive = accounts[index];
      const privateKey = await SecureStore.getItemAsync(`wallet_private_key_${index}`);
      const archiveId = `archived_key_${Date.now()}`;
      
      if (privateKey) await SecureStore.setItemAsync(archiveId, privateKey);

      const archivedAcc = { ...accountToArchive, archiveId: archiveId, deletedAt: new Date().toISOString() };
      const newArchived = [...archivedAccounts, archivedAcc];
      set({ archivedAccounts: newArchived });
      await AsyncStorage.setItem(ARCHIVED_ACCOUNTS_KEY, JSON.stringify(newArchived));

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
    } catch (e) { return { success: false, error: e.message }; }
  },

  restoreAccount: async (archiveId) => {
    const { accounts, archivedAccounts } = get();
    try {
      const accToRestore = archivedAccounts.find(a => a.archiveId === archiveId);
      if (!accToRestore) return { success: false, error: 'Account not found in archive' };

      const newIndex = accounts.length;
      const privateKey = await SecureStore.getItemAsync(archiveId);
      if (privateKey) await SecureStore.setItemAsync(`wallet_private_key_${newIndex}`, privateKey);

      const restoredAcc = { index: newIndex, name: accToRestore.name, publicKey: accToRestore.publicKey };
      const updatedAccounts = [...accounts, restoredAcc];
      set({ accounts: updatedAccounts });
      await get().saveAccounts(updatedAccounts);

      const newArchived = archivedAccounts.filter(a => a.archiveId !== archiveId);
      set({ archivedAccounts: newArchived });
      await AsyncStorage.setItem(ARCHIVED_ACCOUNTS_KEY, JSON.stringify(newArchived));
      
      await SecureStore.deleteItemAsync(archiveId);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  },

  permanentlyDeleteAccount: async (archiveId) => {
    const { archivedAccounts } = get();
    try {
      await SecureStore.deleteItemAsync(archiveId);
      const newArchived = archivedAccounts.filter(a => a.archiveId !== archiveId);
      set({ archivedAccounts: newArchived });
      await AsyncStorage.setItem(ARCHIVED_ACCOUNTS_KEY, JSON.stringify(newArchived));
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  },

  loadWallet: async () => {
    try {
      const success = await get().loadActiveAccount();
      if (success) return true;

      const publicKey = await SecureStore.getItemAsync('wallet_public_key');
      const privateKey = await SecureStore.getItemAsync('wallet_private_key');

      if (!publicKey || !privateKey) return false;

      set({ walletPublicKey: publicKey, walletPrivateKey: privateKey });
      return true;
    } catch (e) { return false; }
  },

  logout: async () => {
    const { activeAccountIndex, archivedAccounts } = get();

    if (activeAccountIndex !== null) {
      await SecureStore.deleteItemAsync(`wallet_private_key_${activeAccountIndex}`);
    }

    for (const acc of archivedAccounts) {
      if (acc.archiveId) await SecureStore.deleteItemAsync(acc.archiveId);
    }

    await SecureStore.deleteItemAsync('wallet_private_key');
    await SecureStore.deleteItemAsync('wallet_public_key');
    await SecureStore.deleteItemAsync('wallet_mnemonic');
    await SecureStore.deleteItemAsync('wallet_initialized');

    set({
      accounts: [],
      archivedAccounts: [],
      activeAccountIndex: 0,
      walletPublicKey: null,
      walletPrivateKey: null,
    });

    await AsyncStorage.removeItem(ACCOUNTS_STORAGE_KEY);
    await AsyncStorage.removeItem(ACTIVE_ACCOUNT_INDEX_KEY);
    await AsyncStorage.removeItem(ARCHIVED_ACCOUNTS_KEY);
  },
}));
