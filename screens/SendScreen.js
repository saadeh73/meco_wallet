// SendScreen.js
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, Modal, FlatList, Image,
  Dimensions, Animated, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  getSolBalance,
  getTokenBalance,
  validateSolanaAddress,
  getCurrentNetworkFee,
  getLatestBlockhash,
  clearBalanceCache,
  heliusRpcRequest
} from '../services/heliusService';
import { logTransaction } from '../services/transactionLogger';
import { Ionicons } from '@expo/vector-icons';
import * as web3 from '@solana/web3.js';
import bs58 from 'bs58';
import * as splToken from '@solana/spl-token';
import * as Clipboard from 'expo-clipboard';

import { CORE_TOKENS } from '../services/jupiterMarketService';

const FEE_COLLECTOR_ADDRESS = 'HgiM3jHagH1F6KsLRSfBPGcpSrf8CE9sEujz1Nb3FTWG';
const SERVICE_FEE_SOL = 0.0005;

function getKeypairFromStore(storePrivateKey) {
  try {
    if (!storePrivateKey) throw new Error('No private key in store');
    let secretKey;
    if (storePrivateKey.startsWith('[')) {
      secretKey = new Uint8Array(JSON.parse(storePrivateKey));
    } else {
      secretKey = bs58.decode(storePrivateKey);
    }
    return web3.Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('Keypair Error:', error);
    throw error;
  }
}

export default function SendScreen() {
  const { t } = useTranslation();
  const route = useRoute();
  const navigation = useNavigation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor);
  const isDark = theme === 'dark';
  const isMounted = useRef(true);

  const addressBook = useAppStore(state => state.addressBook);
  const loadAddressBook = useAppStore(state => state.loadAddressBook);
  const saveAddress = useAppStore(state => state.saveAddress);
  const deleteAddress = useAppStore(state => state.deleteAddress);

  const activeAccount = useAppStore(state => {
    const accounts = state.accounts;
    const activeIndex = state.activeAccountIndex;
    return accounts.length > 0 ? accounts[activeIndex] : null;
  });

  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    inputBackground: isDark ? '#2A2A3E' : '#FFFFFF',
    error: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    info: primaryColor,
  };

  const [state, setState] = useState({
    recipient: '',
    amount: '',
    currency: route?.params?.preselectedToken || 'SOL',
    modalVisible: false,
    loading: false,
    loadingTokens: false,
    networkFee: 0.000005,
    recipientExists: null,
    recipientHasTokenAccount: true,
  });

  const [addressBookModalVisible, setAddressBookModalVisible] = useState(false);
  const [saveAddressModalVisible, setSaveAddressModalVisible] = useState(false);
  const [newAddressName, setNewAddressName] = useState('');

  const [balances, setBalances] = useState({ sol: 0, tokens: {}, lastUpdated: 0 });
  const [fadeAnim] = useState(new Animated.Value(0));
  const validationTimeoutRef = useRef(null);
  const tokenFetchInProgress = useRef(false);

  const isRecipientSaved = useMemo(() => {
    return addressBook.some(item => item.address === state.recipient.trim());
  }, [state.recipient, addressBook]);

  useFocusEffect(
    useCallback(() => {
      if (activeAccount?.publicKey) {
        loadInitialBalance();
        updateNetworkFee();
        loadAddressBook();
      }
      return () => {
        if (validationTimeoutRef.current) clearTimeout(validationTimeoutRef.current);
      };
    }, [activeAccount?.publicKey])
  );

  useEffect(() => {
    if (route.params?.scannedAddress) {
      setState(prev => ({ ...prev, recipient: route.params.scannedAddress }));
      navigation.setParams({ scannedAddress: undefined });
    }
    if (route.params?.selectedAddress) {
      setState(prev => ({ ...prev, recipient: route.params.selectedAddress }));
      navigation.setParams({ selectedAddress: undefined });
    }
  }, [route.params?.scannedAddress, route.params?.selectedAddress]);

  const currentToken = useMemo(() => CORE_TOKENS.find(t => t.symbol === state.currency) || CORE_TOKENS[0], [state.currency]);
  const totalFees = useMemo(() => state.networkFee + SERVICE_FEE_SOL, [state.networkFee]);
  const currentBalance = useMemo(() => {
    return state.currency === 'SOL' ? (balances.sol || 0) : (balances.tokens[state.currency] || 0);
  }, [state.currency, balances]);

  const updateNetworkFee = useCallback(async () => {
    try {
      if (!isMounted.current) return;
      const fee = await getCurrentNetworkFee();
      setState(prev => ({ ...prev, networkFee: fee || 0.000005 }));
    } catch (error) {
      console.log('Fee fallback');
    }
  }, []);

  const loadInitialBalance = useCallback(async () => {
    if (!activeAccount?.publicKey) return;
    try {
      const solBalance = await getSolBalance(false, activeAccount.publicKey);
      if (isMounted.current) {
        setBalances(prev => ({ ...prev, sol: solBalance, lastUpdated: Date.now() }));
      }
    } catch (error) {
      console.warn('Failed to load SOL balance');
    }
  }, [activeAccount?.publicKey]);

  const loadAllTokenBalances = useCallback(async () => {
    if (!activeAccount?.publicKey) return;
    if (tokenFetchInProgress.current) return;
    tokenFetchInProgress.current = true;
    setState(prev => ({ ...prev, loadingTokens: true }));

    try {
      const publicKey = activeAccount.publicKey;
      const newTokenBalances = { ...balances.tokens };

      const solBalance = await getSolBalance(false, publicKey);
      const tokensToFetch = CORE_TOKENS.filter(t => t.mint && t.symbol !== 'SOL');
      
      for (const token of tokensToFetch) {
        try {
          const balance = await getTokenBalance(token.mint, false, publicKey);
          newTokenBalances[token.symbol] = balance;
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
          newTokenBalances[token.symbol] = 0;
        }
      }

      if (isMounted.current) {
        setBalances({ sol: solBalance, tokens: newTokenBalances, lastUpdated: Date.now() });
      }
    } catch (error) {
      console.warn('Failed to load token balances');
    } finally {
      tokenFetchInProgress.current = false;
      setState(prev => ({ ...prev, loadingTokens: false }));
    }
  }, [activeAccount?.publicKey, balances.tokens]);

  const refreshCurrentTokenBalance = useCallback(async (tokenSymbol) => {
    if (!activeAccount?.publicKey) return;
    try {
      if (tokenSymbol === 'SOL') {
        const bal = await getSolBalance(false, activeAccount.publicKey);
        setBalances(prev => ({ ...prev, sol: bal }));
      } else {
        const token = CORE_TOKENS.find(t => t.symbol === tokenSymbol);
        if (token?.mint) {
          const bal = await getTokenBalance(token.mint, false, activeAccount.publicKey);
          setBalances(prev => ({ ...prev, tokens: { ...prev.tokens, [tokenSymbol]: bal } }));
        }
      }
    } catch (e) {}
  }, [activeAccount?.publicKey]);

  useEffect(() => {
    if (state.currency) refreshCurrentTokenBalance(state.currency);
  }, [state.currency, refreshCurrentTokenBalance]);

  const validateRecipient = useCallback(async (address, tokenMint) => {
    if (!address || address.length < 32) {
      setState(prev => ({ ...prev, recipientExists: null, recipientHasTokenAccount: true }));
      return;
    }
    try {
      const validation = await validateSolanaAddress(address);
      let hasTokenAcc = true;
      if (validation.isValid && tokenMint) {
        try {
          const mintKey = new web3.PublicKey(tokenMint);
          const ownerKey = new web3.PublicKey(address);
          const ata = await splToken.getAssociatedTokenAddress(mintKey, ownerKey);
          
          const info = await heliusRpcRequest('getAccountInfo', [ata.toBase58()]);
          hasTokenAcc = (info !== null);
        } catch (e) { hasTokenAcc = false; }
      }
      if (isMounted.current) {
        setState(prev => ({ ...prev, recipientExists: validation.isValid, recipientHasTokenAccount: hasTokenAcc }));
      }
    } catch (error) {
      if (isMounted.current) setState(prev => ({ ...prev, recipientExists: null }));
    }
  }, []);

  useEffect(() => {
    if (validationTimeoutRef.current) clearTimeout(validationTimeoutRef.current);
    if (state.recipient.length >= 32) {
      validationTimeoutRef.current = setTimeout(() => validateRecipient(state.recipient, currentToken.mint), 800);
    }
  }, [state.recipient, currentToken.mint]);

  const handleSend = useCallback(async () => {
    const amountNum = parseFloat(state.amount) || 0;
    const recipient = state.recipient.trim();

    if (!recipient) return Alert.alert(t('error'), t('sendScreen.warnings.enterRecipient'));
    if (amountNum <= 0) return Alert.alert(t('error'), t('sendScreen.warnings.enterAmount'));
    if (state.recipientExists === false) return Alert.alert(t('error'), t('sendScreen.alerts.invalidAddress'));
    if (amountNum > currentBalance) return Alert.alert(t('error'), t('sendScreen.alerts.insufficientBalance'));

    const requiredSol = state.currency === 'SOL' ? amountNum + totalFees : totalFees;
    if (balances.sol < requiredSol) {
      return Alert.alert(t('error'), `${t('sendScreen.alerts.insufficientSolForFees')}\nReq: ${requiredSol.toFixed(5)} SOL`);
    }

    setState(prev => ({ ...prev, loading: true }));

    try {
      await executeTransaction(amountNum, recipient, currentToken);
    } catch (error) {
      console.error('Send Error:', error);
      if (!error.handled) {
        Alert.alert(t('error'), error.message || 'Transaction failed');
      }
    } finally {
      if (isMounted.current) setState(prev => ({ ...prev, loading: false }));
    }
  }, [state, currentBalance, balances.sol, totalFees, currentToken, t]);

  const executeTransaction = useCallback(async (amount, recipient, token) => {
    try {
      const privateKeyFromStore = useAppStore.getState().walletPrivateKey;
      if (!privateKeyFromStore) throw new Error('No private key in store');

      const keypair = getKeypairFromStore(privateKeyFromStore);
      const fromPubkey = keypair.publicKey;
      const toPubkey = new web3.PublicKey(recipient);
      const feeCollectorPubkey = new web3.PublicKey(FEE_COLLECTOR_ADDRESS);

      const rpcEndpoint = 'https://mainnet.helius-rpc.com/?api-key=fb28d3cf-7dd1-4667-9167-7941c3aceb66';
      const connection = new web3.Connection(rpcEndpoint, 'confirmed');
      
      const { blockhash } = await getLatestBlockhash();

      const transaction = new web3.Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;

      const serviceLamports = Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL);

      if (token.symbol === 'SOL') {
        const lamportsToSend = Math.floor(amount * web3.LAMPORTS_PER_SOL);
        transaction.add(web3.SystemProgram.transfer({ fromPubkey, toPubkey, lamports: lamportsToSend }));
        transaction.add(web3.SystemProgram.transfer({ fromPubkey, toPubkey: feeCollectorPubkey, lamports: serviceLamports }));
      } else if (token.mint) {
        const mint = new web3.PublicKey(token.mint);
        const mintInfo = await splToken.getMint(connection, mint);
        const realDecimals = mintInfo.decimals;
        const amountBigInt = BigInt(Math.floor(amount * Math.pow(10, realDecimals)));
        
        const fromATA = await splToken.getAssociatedTokenAddress(mint, fromPubkey);
        const toATA = await splToken.getAssociatedTokenAddress(mint, toPubkey);
        
        const toAccountInfo = await heliusRpcRequest('getAccountInfo', [toATA.toBase58()]);
        if (!toAccountInfo) {
          transaction.add(splToken.createAssociatedTokenAccountInstruction(fromPubkey, toATA, toPubkey, mint));
        }
        
        transaction.add(splToken.createTransferInstruction(fromATA, toATA, fromPubkey, amountBigInt));
        transaction.add(web3.SystemProgram.transfer({ fromPubkey, toPubkey: feeCollectorPubkey, lamports: serviceLamports }));
      }

      const signature = await web3.sendAndConfirmTransaction(connection, transaction, [keypair], { commitment: 'confirmed' });

      await logTransaction({
        type: 'send',
        to: recipient,
        amount,
        currency: token.symbol,
        networkFee: state.networkFee,
        serviceFee: SERVICE_FEE_SOL,
        transactionSignature: signature,
        timestamp: new Date().toISOString(),
        status: 'completed'
      });

      await loadInitialBalance();
      clearBalanceCache();

      Alert.alert(
        t('sendScreen.alerts.success'),
        `${t('sendScreen.alerts.sent')} ${amount} ${token.symbol}`,
        [{ text: t('sendScreen.alerts.done'), onPress: () => {
            if (isMounted.current) setState(prev => ({ ...prev, recipient: '', amount: '' }));
        }}]
      );
    } catch (error) {
      console.error('Exec Transaction Failed:', error);
      
      const errorString = error.toString();
      if (errorString.includes('insufficient funds for rent') || errorString.includes('Transaction results in an account (0) with insufficient funds for rent')) {
        Alert.alert(
          t('sendScreen.alerts.error'),
          t('errors.rentError')
        );
        error.handled = true;
      }
      
      throw error;
    }
  }, [state.networkFee, loadInitialBalance, t]);

  const handleMaxAmount = useCallback(() => {
    let maxAmount = 0;
    if (state.currency === 'SOL') {
      const MIN_KEEP_ALIVE = 0.001;
      const available = Math.max(0, currentBalance - totalFees - MIN_KEEP_ALIVE);
      maxAmount = available > 0 ? available : 0;
    } else {
      maxAmount = currentBalance;
    }
    setState(prev => ({ ...prev, amount: maxAmount > 0 ? maxAmount.toFixed(6) : '0' }));
  }, [currentBalance, state.currency, totalFees]);

  const handlePasteAddress = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setState(prev => ({ ...prev, recipient: text.trim() }));
  }, []);

  const handleSaveAddressConfirm = async () => {
    if (!newAddressName.trim()) {
      Alert.alert(t('error'), t('enter_address_name'));
      return;
    }
    await saveAddress(newAddressName.trim(), state.recipient.trim());
    setSaveAddressModalVisible(false);
    setNewAddressName('');
    Alert.alert(t('success'), t('address_saved'));
  };

  const handleSelectSavedAddress = (address) => {
    setState(prev => ({ ...prev, recipient: address }));
    setAddressBookModalVisible(false);
  };

  const handleDeleteSavedAddress = (address) => {
    Alert.alert(
      t('delete'),
      t('confirm_delete_address'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => deleteAddress(address) }
      ]
    );
  };

  useEffect(() => {
    isMounted.current = true;
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    return () => { isMounted.current = false; };
  }, []);

  const handleOpenTokenModal = () => {
    setState(prev => ({ ...prev, modalVisible: true }));
    loadAllTokenBalances();
  };

  const renderTokenItem = useCallback(({ item }) => {
    const isSelected = state.currency === item.symbol;
    const balance = item.symbol === 'SOL' ? balances.sol : balances.tokens[item.symbol] || 0;
    return (
      <TouchableOpacity
        style={[styles.tokenItem, { backgroundColor: colors.card, borderColor: isSelected ? primaryColor : 'transparent' }]}
        onPress={() => setState(prev => ({ ...prev, currency: item.symbol, modalVisible: false, amount: '' }))}
      >
        <View style={styles.tokenItemContent}>
          <Image source={{ uri: item.image }} style={styles.tokenIcon} />
          <View style={styles.tokenDetails}>
            <Text style={[styles.tokenItemName, { color: colors.text }]}>{item.symbol}</Text>
            <Text style={[styles.tokenBalance, { color: colors.textSecondary }]}>{balance.toFixed(4)}</Text>
          </View>
          {isSelected && <Ionicons name="checkmark-circle" size={24} color={primaryColor} />}
        </View>
      </TouchableOpacity>
    );
  }, [state.currency, colors, primaryColor, balances]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
          
          {/* Header */}
          <View style={[styles.headerNew, { backgroundColor: colors.card }]}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backButton, { backgroundColor: colors.background }]}
            >
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t('sendScreen.title')}</Text>
            <TouchableOpacity
              onPress={() => setAddressBookModalVisible(true)}
              style={[styles.addressBookButton, { backgroundColor: colors.background }]}
            >
              <Ionicons name="book-outline" size={22} color={primaryColor} />
            </TouchableOpacity>
          </View>

          {activeAccount && (
            <View style={[styles.activeAccountCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.activeAccountLabel, { color: colors.textSecondary }]}>
                {t('sendScreen.sendingFrom')}
              </Text>
              <Text style={[styles.activeAccountName, { color: colors.text }]}>{activeAccount.name}</Text>
              <Text style={[styles.activeAccountAddress, { color: primaryColor }]}>
                {activeAccount.publicKey.slice(0, 8)}...{activeAccount.publicKey.slice(-8)}
              </Text>
            </View>
          )}

          {/* Balance Card */}
          <View style={[styles.balanceCardNew, { backgroundColor: colors.card }]}>
            <View style={styles.balanceHeaderRow}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('sendScreen.balance.available')}</Text>
              <View style={styles.balanceRightSection}>
                <TouchableOpacity onPress={() => refreshCurrentTokenBalance(state.currency)} style={styles.refreshBtn}>
                  <Ionicons name="refresh-outline" size={18} color={primaryColor} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.balanceAmountRow}>
              <Text style={[styles.balanceAmountMain, { color: colors.text }]}>
                {currentBalance.toFixed(6)}
              </Text>
              <Text style={[styles.balanceCurrency, { color: primaryColor }]}>{state.currency}</Text>
            </View>
          </View>

          {/* Token Selector */}
          <TouchableOpacity style={[styles.tokenSelectorNew, { backgroundColor: colors.card }]} onPress={handleOpenTokenModal}>
            <View style={styles.tokenSelectorContent}>
              <View style={styles.tokenInfo}>
                <Image source={{ uri: currentToken.image }} style={styles.selectedTokenIcon} />
                <View>
                  <Text style={[styles.tokenName, { color: colors.text }]}>{currentToken.symbol}</Text>
                  <Text style={[styles.tokenFullName, { color: colors.textSecondary }]}>{currentToken.name}</Text>
                </View>
              </View>
              <View style={styles.tokenSelectorRight}>
                <Text style={[styles.changeText, { color: primaryColor }]}>{t('change')}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Recipient Input */}
          <View style={styles.inputSection}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>{t('sendScreen.inputs.recipient')}</Text>
            <View style={[styles.inputContainerNew, { backgroundColor: colors.inputBackground, borderColor: state.recipientExists === false ? colors.error : colors.border }]}>
              <View style={[styles.inputIconContainer, { backgroundColor: primaryColor + '15' }]}>
                <Ionicons name="wallet-outline" size={20} color={primaryColor} />
              </View>
              <TextInput
                style={[styles.inputNew, { color: colors.text }]}
                placeholder={t('sendScreen.inputs.recipientPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={state.recipient}
                onChangeText={(text) => setState(prev => ({ ...prev, recipient: text }))}
              />
              <View style={styles.inputActions}>
                <TouchableOpacity onPress={handlePasteAddress} style={styles.iconBtn}>
                  <Ionicons name="clipboard-outline" size={20} color={primaryColor} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('QRScanner')} style={styles.iconBtn}>
                  <Ionicons name="qr-code-outline" size={22} color={primaryColor} />
                </TouchableOpacity>
                {state.recipient.length >= 32 && (
                  <TouchableOpacity onPress={() => setState(prev => ({ ...prev, recipient: '' }))} style={styles.iconBtn}>
                    <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            {/* Quick Save Bar */}
            {state.recipient.length >= 32 && (
              <View style={styles.quickActions}>
                <TouchableOpacity 
                  style={[styles.quickActionBtn, { backgroundColor: isRecipientSaved ? colors.success + '20' : colors.warning + '20' }]}
                  onPress={() => {
                    if (!isRecipientSaved) {
                      setSaveAddressModalVisible(true);
                    } else {
                      Alert.alert(t('info'), t('sendScreen.already_saved'));
                    }
                  }}
                >
                  <Ionicons name={isRecipientSaved ? "bookmark" : "bookmark-outline"} size={18} color={isRecipientSaved ? colors.success : colors.warning} />
                  <Text style={[styles.quickActionText, { color: isRecipientSaved ? colors.success : colors.warning }]}>
                    {isRecipientSaved ? t('sendScreen.saved') : t('save')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Amount Input */}
          <View style={styles.inputSection}>
            <View style={styles.amountHeader}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>{t('sendScreen.inputs.amount')}</Text>
              <TouchableOpacity onPress={handleMaxAmount}>
                <Text style={[styles.maxButton, { color: primaryColor }]}>{t('sendScreen.inputs.maxButton')}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.inputContainerNew, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              <TextInput
                style={[styles.inputNew, { color: colors.text, fontSize: 20, fontWeight: '600' }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={state.amount}
                onChangeText={(text) => setState(prev => ({ ...prev, amount: text.replace(/,/g, '.') }))}
              />
              <Text style={[styles.currencyLabelNew, { color: primaryColor }]}>{state.currency}</Text>
            </View>
          </View>

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendButtonNew, { backgroundColor: primaryColor, opacity: state.loading ? 0.7 : 1 }]}
            onPress={handleSend}
            disabled={state.loading}
          >
            {state.loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={22} color="#FFF" />
                <Text style={styles.sendButtonText}>{t('sendScreen.buttons.send')}</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Token Modal */}
      <Modal visible={state.modalVisible} transparent animationType="slide" onRequestClose={() => setState(prev => ({ ...prev, modalVisible: false }))}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNew, { backgroundColor: colors.background }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('sendScreen.modals.chooseCurrency')}</Text>
              <TouchableOpacity onPress={() => setState(prev => ({ ...prev, modalVisible: false }))} style={[styles.closeBtn, { backgroundColor: colors.card }]}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            {state.loadingTokens ? (
              <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={CORE_TOKENS.filter(t => t.symbol === 'SOL' || t.symbol === 'MECO' || (balances.tokens[t.symbol] || 0) > 0)}
                keyExtractor={(item) => item.symbol}
                renderItem={renderTokenItem}
                contentContainerStyle={styles.tokenList}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Address Book Modal */}
      <Modal visible={addressBookModalVisible} transparent animationType="slide" onRequestClose={() => setAddressBookModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNew, { backgroundColor: colors.background }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Ionicons name="book" size={24} color={primaryColor} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('address_book')}</Text>
              </View>
              <TouchableOpacity onPress={() => setAddressBookModalVisible(false)} style={[styles.closeBtn, { backgroundColor: colors.card }]}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {addressBook.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIconContainer, { backgroundColor: colors.card }]}>
                  <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('no_saved_addresses')}</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {t('save_address_hint')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={addressBook}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.addressList}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.addressItemNew, { backgroundColor: colors.card }]}
                    onPress={() => handleSelectSavedAddress(item.address)}
                  >
                    <View style={[styles.addressAvatar, { backgroundColor: primaryColor + '15' }]}>
                      <Text style={[styles.addressAvatarText, { color: primaryColor }]}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.addressInfo}>
                      <Text style={[styles.addressNameNew, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.addressTextNew, { color: colors.textSecondary }]}>
                        {item.address.slice(0, 12)}...{item.address.slice(-6)}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteSavedAddress(item.address)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Save Address Modal */}
      <Modal visible={saveAddressModalVisible} transparent animationType="fade" onRequestClose={() => setSaveAddressModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayCenter}>
          <View style={[styles.saveDialogContent, { backgroundColor: colors.card }]}>
            <View style={[styles.saveDialogIcon, { backgroundColor: colors.warning + '15' }]}>
              <Ionicons name="bookmark" size={32} color={colors.warning} />
            </View>
            <Text style={[styles.saveDialogTitle, { color: colors.text }]}>{t('save_address')}</Text>
            
            <View style={[styles.addressPreview, { backgroundColor: colors.background }]}>
              <Text style={[styles.addressPreviewText, { color: colors.textSecondary }]}>
                {state.recipient.slice(0, 16)}...{state.recipient.slice(-10)}
              </Text>
            </View>
            
            <TextInput
              style={[styles.saveDialogInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={t('enter_address_name')}
              placeholderTextColor={colors.textSecondary}
              value={newAddressName}
              onChangeText={setNewAddressName}
              autoFocus
            />

            <View style={styles.saveDialogButtons}>
              <TouchableOpacity 
                style={[styles.saveDialogBtn, { borderColor: colors.border }]} 
                onPress={() => {
                  setSaveAddressModalVisible(false);
                  setNewAddressName('');
                }}
              >
                <Text style={{ color: colors.text }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveDialogBtnPrimary, { backgroundColor: primaryColor }]} 
                onPress={handleSaveAddressConfirm}
              >
                <Ionicons name="bookmark" size={18} color="#FFF" />
                <Text style={styles.saveDialogBtnText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </KeyboardAvoidingView>
  );
}

// Styles
const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  container: { flex: 1, padding: 20 },
  headerNew: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  addressBookButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCardNew: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshBtn: { padding: 6 },
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  balanceAmountMain: { fontSize: 36, fontWeight: '800' },
  balanceCurrency: { fontSize: 18, fontWeight: '600' },
  tokenSelectorNew: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  tokenSelectorContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tokenSelectorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeText: { fontSize: 14, fontWeight: '600' },
  selectedTokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  tokenFullName: { fontSize: 12, marginTop: 2 },
  inputSection: { marginBottom: 16 },
  inputLabel: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  inputContainerNew: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingLeft: 12,
    paddingRight: 8,
    height: 58,
  },
  inputIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  inputNew: { fontSize: 16, flex: 1, height: '100%' },
  inputActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currencyLabelNew: { fontSize: 16, fontWeight: '700', marginLeft: 8 },
  amountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  maxButton: { fontSize: 14, fontWeight: '600' },
  quickActions: { flexDirection: 'row', marginTop: 12, gap: 10 },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
  },
  quickActionText: { fontSize: 13, fontWeight: '600' },
  sendButtonNew: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
    borderRadius: 20,
    gap: 10,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  sendButtonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContentNew: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingTop: 12,
    maxHeight: '75%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  tokenList: { paddingBottom: 20 },
  tokenItem: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
  },
  tokenItemContent: { flexDirection: 'row', alignItems: 'center' },
  tokenIcon: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  tokenDetails: { flex: 1 },
  tokenItemName: { fontSize: 16, fontWeight: '600' },
  tokenBalance: { fontSize: 13, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  addressList: { paddingBottom: 20 },
  addressItemNew: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
  },
  addressAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  addressAvatarText: { fontSize: 20, fontWeight: '700' },
  addressInfo: { flex: 1 },
  addressNameNew: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  addressTextNew: { fontSize: 12 },
  deleteBtn: { padding: 10 },
  saveDialogContent: {
    width: '100%',
    padding: 28,
    borderRadius: 24,
    alignItems: 'center',
  },
  saveDialogIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  saveDialogTitle: { fontSize: 22, fontWeight: '800', marginBottom: 16 },
  addressPreview: { width: '100%', padding: 14, borderRadius: 12, marginBottom: 16 },
  addressPreviewText: {
    fontSize: 12,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  saveDialogInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  saveDialogButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  saveDialogBtn: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  saveDialogBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    gap: 8,
  },
  saveDialogBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  activeAccountCard: { borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center' },
  activeAccountLabel: { fontSize: 12, marginBottom: 4 },
  activeAccountName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  activeAccountAddress: { fontSize: 14, fontWeight: '500' },
  tokenInfo: { flexDirection: 'row', alignItems: 'center' },
  tokenName: { fontSize: 16, fontWeight: '600' },
});
