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

const FEE_COLLECTOR_ADDRESS = 'FosXqkRpbRnvtn7D1995BYv4BFNgsTfXs8WXhVXCjQqZ';
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

  const activeAccount = useAppStore(state => {
    const accounts = state.accounts;
    const activeIndex = state.activeAccountIndex;
    return accounts.length > 0 ? accounts[activeIndex] : null;
  });

  const colors = {
    background: isDark ? '#0A0A0F' : '#FFFFFF',
    card: isDark ? '#1A1A2E' : '#F8FAFD',
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

  const [balances, setBalances] = useState({ sol: 0, tokens: {}, lastUpdated: 0 });
  const [fadeAnim] = useState(new Animated.Value(0));
  const validationTimeoutRef = useRef(null);
  const tokenFetchInProgress = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (activeAccount?.publicKey) {
        loadInitialBalance();
        updateNetworkFee();
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

    if (!recipient) return Alert.alert(t('sendScreen.alerts.error'), t('sendScreen.warnings.enterRecipient'));
    if (amountNum <= 0) return Alert.alert(t('sendScreen.alerts.error'), t('sendScreen.warnings.enterAmount'));
    if (state.recipientExists === false) return Alert.alert(t('sendScreen.alerts.error'), t('sendScreen.alerts.invalidAddress'));
    if (amountNum > currentBalance) return Alert.alert(t('sendScreen.alerts.error'), t('sendScreen.alerts.insufficientBalance'));

    const requiredSol = state.currency === 'SOL' ? amountNum + totalFees : totalFees;
    if (balances.sol < requiredSol) {
      return Alert.alert(t('sendScreen.alerts.error'), `${t('sendScreen.alerts.insufficientSolForFees')}\nReq: ${requiredSol.toFixed(5)} SOL`);
    }

    setState(prev => ({ ...prev, loading: true }));

    try {
      await executeTransaction(amountNum, recipient, currentToken);
    } catch (error) {
      console.error('Send Error:', error);
      if (!error.handled) {
        Alert.alert(t('sendScreen.alerts.error'), error.message || 'Transaction failed');
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
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{t('sendScreen.title')}</Text>
          </View>

          {activeAccount && (
            <View style={[styles.activeAccountCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.activeAccountLabel, { color: colors.textSecondary }]}>
                {t('sendScreen.sendingFrom', 'الإرسال من')}
              </Text>
              <Text style={[styles.activeAccountName, { color: colors.text }]}>{activeAccount.name}</Text>
              <Text style={[styles.activeAccountAddress, { color: primaryColor }]}>
                {activeAccount.publicKey.slice(0, 8)}...{activeAccount.publicKey.slice(-8)}
              </Text>
            </View>
          )}

          <View style={[styles.balanceCard, { backgroundColor: colors.card }]}>
            <View style={styles.balanceHeader}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('sendScreen.balance.available')}</Text>
              <TouchableOpacity onPress={() => refreshCurrentTokenBalance(state.currency)}>
                <Ionicons name="refresh-outline" size={20} color={primaryColor} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.balanceAmount, { color: colors.text }]}>{currentBalance.toFixed(6)} {state.currency}</Text>
          </View>

          <TouchableOpacity style={[styles.tokenSelector, { backgroundColor: colors.card }]} onPress={handleOpenTokenModal}>
            <View style={styles.tokenSelectorContent}>
              <View style={styles.tokenInfo}>
                <Image source={{ uri: currentToken.image }} style={styles.selectedTokenIcon} />
                <Text style={[styles.tokenName, { color: colors.text }]}>{currentToken.symbol}</Text>
              </View>
              <Ionicons name="chevron-down" size={24} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>

          <View style={styles.inputSection}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>{t('sendScreen.inputs.recipient')}</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.inputBackground, borderColor: state.recipientExists === false ? colors.error : colors.border }]}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t('sendScreen.inputs.recipientPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={state.recipient}
                onChangeText={(text) => setState(prev => ({ ...prev, recipient: text }))}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity onPress={handlePasteAddress}>
                  <Ionicons name="clipboard-outline" size={20} color={primaryColor} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('QRScanner')}>
                  <Ionicons name="qr-code-outline" size={22} color={primaryColor} />
                </TouchableOpacity>
                {state.recipient !== '' && (
                  <TouchableOpacity onPress={() => setState(prev => ({ ...prev, recipient: '' }))}>
                    <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={styles.inputSection}>
            <View style={styles.amountHeader}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>{t('sendScreen.inputs.amount')}</Text>
              <TouchableOpacity onPress={handleMaxAmount}><Text style={[styles.maxButton, { color: primaryColor }]}>{t('sendScreen.inputs.maxButton')}</Text></TouchableOpacity>
            </View>
            <View style={[styles.inputContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={state.amount}
                onChangeText={(text) => setState(prev => ({ ...prev, amount: text.replace(/,/g, '.') }))}
              />
              <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>{state.currency}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: primaryColor, opacity: state.loading ? 0.7 : 1 }]}
            onPress={handleSend}
            disabled={state.loading}
          >
            {state.loading ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="paper-plane-outline" size={20} color="#FFF" /><Text style={styles.sendButtonText}>{t('sendScreen.buttons.send')}</Text></>}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      <Modal visible={state.modalVisible} transparent animationType="slide" onRequestClose={() => setState(prev => ({ ...prev, modalVisible: false }))}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('sendScreen.modals.chooseCurrency')}</Text>
              <TouchableOpacity onPress={() => setState(prev => ({ ...prev, modalVisible: false }))}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            {state.loadingTokens ? (
              <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 20 }} />
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, padding: 20 },
  container: { flex: 1 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700' },
  activeAccountCard: { borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center' },
  activeAccountLabel: { fontSize: 12, marginBottom: 4 },
  activeAccountName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  activeAccountAddress: { fontSize: 14, fontWeight: '500' },
  balanceCard: { borderRadius: 16, padding: 20, marginBottom: 16 },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  balanceAmount: { fontSize: 28, fontWeight: '700' },
  tokenSelector: { borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tokenSelectorContent: { flexDirection: 'row', justifyContent: 'space-between', flex: 1, alignItems: 'center' },
  tokenInfo: { flexDirection: 'row', alignItems: 'center' },
  selectedTokenIcon: { width: 32, height: 32, borderRadius: 16, marginRight: 12 },
  tokenIcon: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  tokenName: { fontSize: 16, fontWeight: '600' },
  inputSection: { marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, height: 56 },
  input: { fontSize: 16, height: '100%', flex: 1 },
  amountHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  maxButton: { fontSize: 14, fontWeight: '600' },
  currencyLabel: { fontSize: 16, fontWeight: '500', marginLeft: 8 },
  sendButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 18, borderRadius: 16, gap: 8 },
  sendButtonText: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  tokenList: { paddingBottom: 20 },
  tokenItem: { borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  tokenItemContent: { flexDirection: 'row', alignItems: 'center' },
  tokenDetails: { flex: 1, marginLeft: 12 },
  tokenItemName: { fontSize: 16, fontWeight: '500' },
  tokenBalance: { fontSize: 12, marginTop: 2 },
});
