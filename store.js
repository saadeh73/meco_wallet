// store.js - النسخة المحدثة بميزة دفتر العناوين (Address Book)

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keypair } from '@solana/web3.js';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import i18next from 'i18next';

const ACCOUNTS_STORAGE_KEY     = '@meco_accounts';
const ACTIVE_ACCOUNT_INDEX_KEY = '@meco_active_account_index';
const ADDRESS_BOOK_KEY         = '@meco_address_book';

const OLD_PRIVATE_KEY = 'wallet_private_key';
const OLD_PUBLIC_KEY  = 'wallet_public_key';
const OLD_MNEMONIC    = 'wallet_mnemonic';

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
    } catch (_) {}
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
    } catch (_) {}
  },

  accounts:           [],
  activeAccountIndex: 0,
  walletPublicKey:    null,
  walletPrivateKey:   null,
  currentWallet:      null,

  // ── Address Book ────────────────────────────────────────────────────────────
  addressBook: [],

  loadAddressBook: async () => {
    try {
      const stored = await AsyncStorage.getItem(ADDRESS_BOOK_KEY);
      if (stored) set({ addressBook: JSON.parse(stored) });
    } catch (e) {
      console.warn('Failed to load address book:', e.message);
    }
  },

  saveAddressBook: async (addressBook) => {
    try {
      await AsyncStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(addressBook));
      set({ addressBook });
    } catch (e) {
      console.warn('Failed to save address book:', e.message);
    }
  },

  saveAddress: async (name, address) => {
    const { addressBook, saveAddressBook } = get();
    const existingIndex = addressBook.findIndex(item => item.address === address);
    let newBook = [...addressBook];
    if (existingIndex >= 0) {
      newBook[existingIndex].name = name;
    } else {
      newBook.push({ name, address, id: Date.now().toString() });
    }
    await saveAddressBook(newBook);
    return true;
  },

  deleteAddress: async (address) => {
    const { addressBook, saveAddressBook } = get();
    await saveAddressBook(addressBook.filter(item => item.address !== address));
    return true;
  },

  // ── Accounts ─────────────────────────────────────────────────────────────────
  loadAccounts: async () => {
    try {
      const stored = await AsyncStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (stored) {
        const accounts = JSON.parse(stored);
        set({ accounts });
        return accounts;
      }
    } catch (_) {}
    return [];
  },

  saveAccounts: async (accounts) => {
    try {
      await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (_) {}
  },

  loadActiveAccount: async () => {
    try {
      let accounts = await get().loadAccounts();
      if (accounts.length === 0) {
        const oldPublicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
        if (oldPublicKey) {
          const mainAccountName = i18next.t('main_account', 'الحساب الرئيسي');
          accounts = [{ index: 0, name: mainAccountName, publicKey: oldPublicKey, isLegacy: true }];
          set({ accounts });
          await get().saveAccounts(accounts);
        }
      }
      const savedIndex = await AsyncStorage.getItem(ACTIVE_ACCOUNT_INDEX_KEY);
      let activeIndex  = savedIndex !== null ? parseInt(savedIndex) : 0;
      if (activeIndex >= accounts.length) {
        activeIndex = 0;
        await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, '0');
      }
      if (accounts.length > 0) {
        await get().setActiveAccount(activeIndex);
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  },

  setActiveAccount: async (index) => {
    const { accounts } = get();
    if (index >= accounts.length) return false;

    try {
      let privateKey, publicKey;

      const storedPrivateKey = await SecureStore.getItemAsync(`wallet_private_key_${index}`);
      if (storedPrivateKey && accounts[index]?.publicKey) {
        privateKey = storedPrivateKey;
        publicKey  = accounts[index].publicKey;
      }

      if (!privateKey && index === 0) {
        const oldPrivateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
        const oldPublicKey  = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
        if (oldPrivateKey && oldPublicKey) {
          privateKey = oldPrivateKey;
          publicKey  = oldPublicKey;
          await SecureStore.setItemAsync('wallet_private_key_0', oldPrivateKey);
        }
      }

      if (!privateKey) {
        const mnemonic = await SecureStore.getItemAsync(OLD_MNEMONIC);
        if (!mnemonic) return false;

        const seed = await bip39.mnemonicToSeed(mnemonic);
        const path = `m/44'/501'/${index}'/0'`;
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        const keypair     = Keypair.fromSeed(derivedSeed);
        const newPublicKey  = keypair.publicKey.toBase58();
        const newPrivateKey = bs58.encode(keypair.secretKey);

        if (index === 0) {
          const oldPublicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
          if (oldPublicKey && oldPublicKey !== newPublicKey) {
            const oldKeypair = Keypair.fromSeed(seed.slice(0, 32));
            privateKey = bs58.encode(oldKeypair.secretKey);
            publicKey  = oldKeypair.publicKey.toBase58();
            await SecureStore.setItemAsync(OLD_PUBLIC_KEY,  publicKey);
            await SecureStore.setItemAsync(OLD_PRIVATE_KEY, privateKey);
          } else {
            privateKey = newPrivateKey;
            publicKey  = newPublicKey;
            if (!oldPublicKey) {
              await SecureStore.setItemAsync(OLD_PUBLIC_KEY,  publicKey);
              await SecureStore.setItemAsync(OLD_PRIVATE_KEY, privateKey);
            }
          }
        } else {
          privateKey = newPrivateKey;
          publicKey  = newPublicKey;
        }

        await SecureStore.setItemAsync(`wallet_private_key_${index}`, privateKey);
      }

      set({
        activeAccountIndex: index,
        walletPublicKey:    publicKey,
        walletPrivateKey:   privateKey,
        currentWallet:      publicKey,
      });
      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, index.toString());
      return true;
    } catch (_) {
      return false;
    }
  },

  addAccount: async (name) => {
    const { accounts } = get();
    const newIndex = accounts.length;
    try {
      const mnemonic = await SecureStore.getItemAsync(OLD_MNEMONIC);
      if (!mnemonic) throw new Error(i18next.t('recovery_phrase_missing', 'عبارة الاسترداد غير موجودة'));

      const preStoredPrivateKey = await SecureStore.getItemAsync(`wallet_private_key_${newIndex}`);
      let publicKey, privateKey;

      if (preStoredPrivateKey) {
        const keypair = Keypair.fromSecretKey(bs58.decode(preStoredPrivateKey));
        publicKey  = keypair.publicKey.toBase58();
        privateKey = preStoredPrivateKey;
      } else {
        const seed    = await bip39.mnemonicToSeed(mnemonic);
        const keypair = Keypair.fromSeed(derivePath(`m/44'/501'/${newIndex}'/0'`, seed.toString('hex')).key);
        publicKey  = keypair.publicKey.toBase58();
        privateKey = bs58.encode(keypair.secretKey);
        await SecureStore.setItemAsync(`wallet_private_key_${newIndex}`, privateKey);
      }

      const defaultAccountName = `${i18next.t('account', 'الحساب')} ${newIndex + 1}`;
      const newAccount = { index: newIndex, name: name || defaultAccountName, publicKey };

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

  restoreDiscoveredAccounts: async (discoveredAccounts) => {
    try {
      set({ accounts: discoveredAccounts, activeAccountIndex: 0 });
      await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(discoveredAccounts));
      await AsyncStorage.setItem(ACTIVE_ACCOUNT_INDEX_KEY, '0');
      if (discoveredAccounts.length > 0) {
        await get().setActiveAccount(0);
      }
    } catch (e) {
      console.error('Error restoring accounts:', e);
    }
  },

  addAccountFromPrivateKey: async (name, privateKeyString) => {
    const { accounts } = get();
    const newIndex = accounts.length;
    try {
      let secretKey;
      if (privateKeyString.startsWith('[')) {
        secretKey = new Uint8Array(JSON.parse(privateKeyString));
      } else {
        secretKey = bs58.decode(privateKeyString);
      }

      const keypair   = Keypair.fromSecretKey(secretKey);
      const publicKey = keypair.publicKey.toBase58();
      const privateKey= bs58.encode(secretKey);

      const exists = accounts.find(acc => acc.publicKey === publicKey);
      if (exists) throw new Error(i18next.t('account_already_exists', 'هذا الحساب موجود بالفعل'));

      const defaultImportedName = `${i18next.t('imported_account', 'حساب مستورد')} ${newIndex + 1}`;
      const newAccount = { index: newIndex, name: name || defaultImportedName, publicKey };

      await SecureStore.setItemAsync(`wallet_private_key_${newIndex}`, privateKey);

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

  getPrivateKeyForAccount: async (index) => {
    try {
      const storedPrivateKey = await SecureStore.getItemAsync(`wallet_private_key_${index}`);
      if (storedPrivateKey) return storedPrivateKey;

      if (index === 0) {
        const oldPrivateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
        if (oldPrivateKey) {
          await SecureStore.setItemAsync('wallet_private_key_0', oldPrivateKey);
          return oldPrivateKey;
        }
      }

      const mnemonic = await SecureStore.getItemAsync(OLD_MNEMONIC);
      if (mnemonic) {
        const seed = await bip39.mnemonicToSeed(mnemonic);
        if (index === 0) {
          const oldPublicKey = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
          const newKeypair   = Keypair.fromSeed(derivePath(`m/44'/501'/0'/0'`, seed.toString('hex')).key);
          if (oldPublicKey && oldPublicKey !== newKeypair.publicKey.toBase58()) {
            const oldKeypair = Keypair.fromSeed(seed.slice(0, 32));
            const privateKey = bs58.encode(oldKeypair.secretKey);
            await SecureStore.setItemAsync('wallet_private_key_0', privateKey);
            return privateKey;
          }
        }
        const derivedSeed = derivePath(`m/44'/501'/${index}'/0'`, seed.toString('hex')).key;
        const keypair     = Keypair.fromSeed(derivedSeed);
        const privateKey  = bs58.encode(keypair.secretKey);
        await SecureStore.setItemAsync(`wallet_private_key_${index}`, privateKey);
        return privateKey;
      }
      return null;
    } catch (e) {
      console.error('❌ [getPrivateKeyForAccount]:', e);
      return null;
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
      // ✅ حذف المفتاح المحدد
      await SecureStore.deleteItemAsync(`wallet_private_key_${index}`);

      // ✅ إزاحة مفاتيح جميع الحسابات التي تلي المحذوف
      // مثال: حذف index=1 من [0,1,2,3]
      // key_2 → key_1, key_3 → key_2, حذف key_3
      for (let i = index + 1; i < accounts.length; i++) {
        const key = await SecureStore.getItemAsync(`wallet_private_key_${i}`);
        if (key) {
          await SecureStore.setItemAsync(`wallet_private_key_${i - 1}`, key);
        }
        await SecureStore.deleteItemAsync(`wallet_private_key_${i}`);
      }

      const updatedAccounts    = accounts.filter((_, i) => i !== index);
      const reindexedAccounts  = updatedAccounts.map((acc, i) => ({ ...acc, index: i }));

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

      const publicKey  = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
      const privateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
      if (!publicKey || !privateKey) return false;

      set({ walletPublicKey: publicKey, walletPrivateKey: privateKey, currentWallet: publicKey });
      const mainAccountName = i18next.t('main_account', 'الحساب الرئيسي');
      const accounts = [{ index: 0, name: mainAccountName, publicKey, isLegacy: true }];
      set({ accounts });
      await get().saveAccounts(accounts);
      return true;
    } catch (_) {
      return false;
    }
  },

  logout: async () => {
    const { accounts } = get();

    // ✅ حذف مفاتيح جميع الحسابات وليس فقط الحساب النشط
    for (let i = 0; i < accounts.length; i++) {
      await SecureStore.deleteItemAsync(`wallet_private_key_${i}`);
    }

    // حذف المفاتيح القديمة (legacy)
    await SecureStore.deleteItemAsync(OLD_PRIVATE_KEY);
    await SecureStore.deleteItemAsync(OLD_PUBLIC_KEY);
    await SecureStore.deleteItemAsync(OLD_MNEMONIC);
    await SecureStore.deleteItemAsync('wallet_initialized');

    set({
      accounts:           [],
      activeAccountIndex: 0,
      walletPublicKey:    null,
      walletPrivateKey:   null,
      currentWallet:      null,
    });

    await AsyncStorage.removeItem(ACCOUNTS_STORAGE_KEY);
    await AsyncStorage.removeItem(ACTIVE_ACCOUNT_INDEX_KEY);
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
    } catch (_) {}
  },
}));

export async function hasLegacyWallet() {
  try {
    const publicKey  = await SecureStore.getItemAsync(OLD_PUBLIC_KEY);
    const privateKey = await SecureStore.getItemAsync(OLD_PRIVATE_KEY);
    return !!(publicKey && privateKey);
  } catch (_) {
    return false;
  }
}

export async function hasMnemonic() {
  try {
    return !!(await SecureStore.getItemAsync(OLD_MNEMONIC));
  } catch (_) {
    return false;
  }
}
