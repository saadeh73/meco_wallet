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
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // ✅ استيراد للتحكم بالهوامش الآمنة
import {
  getSolBalance, getTokenBalance, validateSolanaAddress,
  getCurrentNetworkFee, getLatestBlockhash, clearBalanceCache, heliusRpcRequest
} from '../services/heliusService';
import heliusService from '../services/heliusService'; 
import { Ionicons } from '@expo/vector-icons';
import * as web3 from '@solana/web3.js';
import bs58 from 'bs58';
import * as splToken from '@solana/spl-token';
import * as Clipboard from 'expo-clipboard';
import { CORE_TOKENS, getSolPriceUsd } from '../services/jupiterMarketService';

const FEE_COLLECTOR_ADDRESS = 'BkaJsFAJKPQZgreBFLrY2pPUi44fTJzXhmeBc8LeuF5W';
const SERVICE_FEE_SOL       = 0.0005;

function getKeypairFromStore(storePrivateKey) {
  try {
    if (!storePrivateKey) throw new Error('No private key in store');
    const secretKey = storePrivateKey.startsWith('[')
      ? new Uint8Array(JSON.parse(storePrivateKey))
      : bs58.decode(storePrivateKey);
    return web3.Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('Keypair Error:', error);
    throw error;
  }
}

export default function SendScreen() {
  const { t }        = useTranslation();
  const route        = useRoute();
  const navigation   = useNavigation();
  const theme        = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';
  const isMounted    = useRef(true);
  const insets       = useSafeAreaInsets(); // جلب مسافات الأمان للهاتف

  const addressBook    = useAppStore(state => state.addressBook);
  const loadAddressBook= useAppStore(state => state.loadAddressBook);
  const saveAddress    = useAppStore(state => state.saveAddress);
  const deleteAddress  = useAppStore(state => state.deleteAddress);

  const activeAccount = useAppStore(state => {
    const accounts    = state.accounts;
    const activeIndex = state.activeAccountIndex;
    return accounts.length > 0 ? accounts[activeIndex] : null;
  });

  const colors = {
    background:      isDark ? '#07070F' : '#F4F5F9',
    card:            isDark ? '#111122' : '#FFFFFF',
    text:            isDark ? '#EEEEFF' : '#1C1C24',
    textSecondary:   isDark ? '#7E7EAA' : '#8A8A9E',
    border:          isDark ? '#1E1E38' : '#E8E8F2',
    inputBackground: isDark ? '#171730' : '#ECECF4',
    error:           '#EF4444',
    success:         '#10B981',
    warning:         '#F59E0B',
    info:            primaryColor,
  };

  const [state, setState] = useState({
    recipient:                route?.params?.preselectedToken ? '' : '',
    amount:                   '',
    currency:                 route?.params?.preselectedToken || 'SOL',
    modalVisible:             false,
    loading:                  false,
    loadingTokens:            false,
    networkFee:               0.000005,
    solPriceUsd:               0,
    recipientExists:          null,
    recipientHasTokenAccount: true,
  });

  const [addressBookModalVisible, setAddressBookModalVisible] = useState(false);
  const [saveAddressModalVisible, setSaveAddressModalVisible] = useState(false);
  const [newAddressName,          setNewAddressName]          = useState('');
  const [balances, setBalances]   = useState({ sol: 0, tokens: {}, lastUpdated: 0 });
  const [fadeAnim]                = useState(new Animated.Value(0));
  const validationTimeoutRef      = useRef(null);
  const tokenFetchInProgress      = useRef(false);

  const isRecipientSaved = useMemo(() => {
    return addressBook.some(item => item.address === state.recipient.trim());
  }, [state.recipient, addressBook]);

  useFocusEffect(
    useCallback(() => {
      if (activeAccount?.publicKey) {
        loadInitialBalance();
        updateNetworkFee();
        updateSolPrice();
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

  const currentToken = useMemo(
    () => CORE_TOKENS.find(tk => tk.symbol === state.currency) || CORE_TOKENS[0],
    [state.currency]
  );
  const totalFees = useMemo(() => state.networkFee + SERVICE_FEE_SOL, [state.networkFee]);
  const currentBalance = useMemo(() => {
    return state.currency === 'SOL' ? (balances.sol || 0) : (balances.tokens[state.currency] || 0);
  }, [state.currency, balances]);

  const updateNetworkFee = useCallback(async () => {
    try {
      if (!isMounted.current) return;
      const fee = await getCurrentNetworkFee();
      setState(prev => ({ ...prev, networkFee: fee || 0.000005 }));
    } catch (_) {}
  }, []);

  const updateSolPrice = useCallback(async () => {
    try {
      const price = await getSolPriceUsd();
      if (isMounted.current) setState(prev => ({ ...prev, solPriceUsd: price || 0 }));
    } catch (_) {}
  }, []);

  const loadInitialBalance = useCallback(async () => {
    if (!activeAccount?.publicKey) return;
    try {
      const solBalance = await getSolBalance(false, activeAccount.publicKey);
      if (isMounted.current) setBalances(prev => ({ ...prev, sol: solBalance, lastUpdated: Date.now() }));
    } catch (_) {}
  }, [activeAccount?.publicKey]);

  const loadAllTokenBalances = useCallback(async () => {
    if (!activeAccount?.publicKey || tokenFetchInProgress.current) return;
    tokenFetchInProgress.current = true;
    setState(prev => ({ ...prev, loadingTokens: true }));
    try {
      const publicKey       = activeAccount.publicKey;
      const newTokenBalances= { ...balances.tokens };
      const solBalance      = await getSolBalance(false, publicKey);

      const tokensToFetch = CORE_TOKENS.filter(tk => tk.mint && tk.symbol !== 'SOL');
      for (const token of tokensToFetch) {
        try {
          newTokenBalances[token.symbol] = await getTokenBalance(token.mint, false, publicKey);
          await new Promise(r => setTimeout(r, 100));
        } catch (_) {
          newTokenBalances[token.symbol] = 0;
        }
      }
      if (isMounted.current) setBalances({ sol: solBalance, tokens: newTokenBalances, lastUpdated: Date.now() });
    } catch (_) {} finally {
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
        const token = CORE_TOKENS.find(tk => tk.symbol === tokenSymbol);
        if (token?.mint) {
          const bal = await getTokenBalance(token.mint, false, activeAccount.publicKey);
          setBalances(prev => ({ ...prev, tokens: { ...prev.tokens, [tokenSymbol]: bal } }));
        }
      }
    } catch (_) {}
  }, [activeAccount?.publicKey]);

  useEffect(() => {
    if (state.currency) refreshCurrentTokenBalance(state.currency);
  }, [state.currency]);

  const validateRecipient = useCallback(async (address, tokenMint) => {
    if (!address || address.length < 32) {
      setState(prev => ({ ...prev, recipientExists: null, recipientHasTokenAccount: true }));
      return;
    }
    try {
      const validation = await validateSolanaAddress(address);
      let hasTokenAcc  = true;
      if (validation.isValid && tokenMint) {
        try {
          const mintKey  = new web3.PublicKey(tokenMint);
          const ownerKey = new web3.PublicKey(address);
          const ata      = await splToken.getAssociatedTokenAddress(mintKey, ownerKey);
          const info     = await heliusRpcRequest('getAccountInfo', [ata.toBase58()]);
          hasTokenAcc    = (info !== null);
        } catch (_) { hasTokenAcc = false; }
      }
      if (isMounted.current) {
        setState(prev => ({ ...prev, recipientExists: validation.isValid, recipientHasTokenAccount: hasTokenAcc }));
      }
    } catch (_) {
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

    if (!recipient)           return Alert.alert(t('error'), t('sendScreen.warnings.enterRecipient'));
    if (amountNum <= 0)       return Alert.alert(t('error'), t('sendScreen.warnings.enterAmount'));

    if (recipient === activeAccount?.publicKey) {
      return Alert.alert(t('error'), t('sendScreen.alerts.selfTransfer'));
    }

    if (state.recipientExists === false) {
      return Alert.alert(t('error'), t('sendScreen.alerts.invalidAddress'));
    }

    if (state.recipient.length >= 32 && state.recipientExists === null) {
      return Alert.alert(t('error'), t('sendScreen.warnings.verifyAddress'));
    }

    if (amountNum > currentBalance) {
      return Alert.alert(t('error'), t('sendScreen.alerts.insufficientBalance'));
    }

    const requiredSol = state.currency === 'SOL' ? amountNum + totalFees : totalFees;
    if (balances.sol < requiredSol) {
      return Alert.alert(
        t('error'),
        t('sendScreen.alerts.insufficientSolForFees', {
          needed:  requiredSol.toFixed(5),
          balance: balances.sol.toFixed(5),
        })
      );
    }

    const feeUsdText = state.solPriceUsd > 0 ? ` (≈ $${(totalFees * state.solPriceUsd).toFixed(2)})` : '';
    const recipientShort = `${recipient.slice(0, 6)}...${recipient.slice(-4)}`;

    Alert.alert(
      t('sendScreen.confirm_title', { defaultValue: 'تأكيد عملية الإرسال' }),
      t('sendScreen.confirm_message', {
        amount:      amountNum,
        symbol:      currentToken.symbol,
        recipient:   recipientShort,
        totalFee:    totalFees.toFixed(5),
        feeUsd:      feeUsdText,
        platformFee: SERVICE_FEE_SOL,
        defaultValue: `سيتم إرسال {{amount}} {{symbol}} إلى {{recipient}}\n\nإجمالي الرسوم: {{totalFee}} SOL{{feeUsd}}\n(رسوم شبكة سولانا + رسوم منصة ثابتة قدرها {{platformFee}} SOL)`,
      }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            setState(prev => ({ ...prev, loading: true }));
            try {
              await executeTransaction(amountNum, recipient, currentToken);
            } catch (error) {
              if (!error.handled) Alert.alert(t('error'), error.message || t('sendScreen.alerts.sendFailed'));
            } finally {
              if (isMounted.current) setState(prev => ({ ...prev, loading: false }));
            }
          },
        },
      ]
    );
  }, [state, currentBalance, balances.sol, totalFees, currentToken, t, activeAccount]);

  const executeTransaction = useCallback(async (amount, recipient, token) => {
    try {
      const privateKeyFromStore = useAppStore.getState().walletPrivateKey;
      if (!privateKeyFromStore) throw new Error('No private key in store');

      const keypair           = getKeypairFromStore(privateKeyFromStore);
      const fromPubkey        = keypair.publicKey;
      const toPubkey          = new web3.PublicKey(recipient);
      const feeCollectorPubkey= new web3.PublicKey(FEE_COLLECTOR_ADDRESS);

      const connection     = await heliusService.getConnection();
      const { blockhash }  = await getLatestBlockhash();

      const transaction    = new web3.Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer        = fromPubkey;

      const serviceLamports = Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL);

      if (token.symbol === 'SOL') {
        const lamportsToSend = Math.floor(amount * web3.LAMPORTS_PER_SOL);
        transaction.add(web3.SystemProgram.transfer({ fromPubkey, toPubkey, lamports: lamportsToSend }));
        transaction.add(web3.SystemProgram.transfer({ fromPubkey, toPubkey: feeCollectorPubkey, lamports: serviceLamports }));
      } else if (token.mint) {
        const mint        = new web3.PublicKey(token.mint);
        const mintInfo    = await splToken.getMint(connection, mint);
        const amountBigInt= BigInt(Math.floor(amount * Math.pow(10, mintInfo.decimals)));
        const fromATA     = await splToken.getAssociatedTokenAddress(mint, fromPubkey);
        const toATA       = await splToken.getAssociatedTokenAddress(mint, toPubkey);
        const toAccountInfo = await heliusRpcRequest('getAccountInfo', [toATA.toBase58()]);
        if (!toAccountInfo) {
          transaction.add(splToken.createAssociatedTokenAccountInstruction(fromPubkey, toATA, toPubkey, mint));
        }
        transaction.add(splToken.createTransferInstruction(fromATA, toATA, fromPubkey, amountBigInt));
        transaction.add(web3.SystemProgram.transfer({ fromPubkey, toPubkey: feeCollectorPubkey, lamports: serviceLamports }));
      }

      const signature = await web3.sendAndConfirmTransaction(connection, transaction, [keypair], { commitment: 'confirmed' });

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
      const errorString = error.toString();
      if (errorString.includes('insufficient funds for rent') ||
          errorString.includes('Transaction results in an account (0) with insufficient funds for rent')) {
        Alert.alert(t('sendScreen.alerts.error'), t('errors.rentError'));
        error.handled = true;
      }
      throw error;
    }
  }, [state.networkFee, loadInitialBalance, t]);

  const handleMaxAmount = useCallback(() => {
    let maxAmount = 0;
    if (state.currency === 'SOL') {
      const MIN_KEEP_ALIVE = 0.001;
      maxAmount = Math.max(0, currentBalance - totalFees - MIN_KEEP_ALIVE);
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
    if (!newAddressName.trim()) { Alert.alert(t('error'), t('enter_address_name')); return; }
    await saveAddress(newAddressName.trim(), state.recipient.trim());
    setSaveAddressModalVisible(false);
    setNewAddressName('');
    Alert.alert(t('success'), t('sendScreen.address_saved'));
  };

  const handleSelectSavedAddress = (address) => {
    setState(prev => ({ ...prev, recipient: address }));
    setAddressBookModalVisible(false);
  };

  const handleDeleteSavedAddress = (address) => {
    Alert.alert(t('delete'), t('confirm_delete_address'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => deleteAddress(address) },
    ]);
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
    const balance    = item.symbol === 'SOL' ? balances.sol : balances.tokens[item.symbol] || 0;
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
          {isSelected && <Ionicons name="checkmark-circle" size={20} color={primaryColor} />}
        </View>
      </TouchableOpacity>
    );
  }, [state.currency, colors, primaryColor, balances]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      
      {/* ── شريط الرأس المطور والمتناسق ── */}
      <View style={[styles.headerNew, { backgroundColor: colors.card, paddingTop: Platform.OS === 'ios' ? 0 : insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}>
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('sendScreen.title')}</Text>
          {activeAccount && (
            <Text style={[styles.headerSubText, { color: colors.textSecondary }]}>
              {activeAccount.name} ({activeAccount.publicKey.slice(0, 4)}...{activeAccount.publicKey.slice(-4)})
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={() => setAddressBookModalVisible(true)} style={[styles.addressBookButton, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}>
          <Ionicons name="book-outline" size={18} color={primaryColor} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}>
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

          {/* ── حقل إدخال الرصيد والمبلغ المدمج (Phantom/Solflare Style) ── */}
          <View style={[styles.inputSection, { marginBottom: 20 }]}>
            <View style={styles.amountHeader}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>{t('sendScreen.inputs.amount')}</Text>
              <TouchableOpacity onPress={handleMaxAmount}>
                <Text style={[styles.maxButton, { color: primaryColor }]}>{t('sendScreen.inputs.maxButton')}</Text>
              </TouchableOpacity>
            </View>
            
            <View style={[styles.inputContainerNew, { backgroundColor: colors.card, borderColor: colors.border, height: 64 }]}>
              <TextInput
                style={[styles.inputNew, { color: colors.text, fontSize: 24, fontWeight: '800', paddingVertical: 0 }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={state.amount}
                onChangeText={text => setState(prev => ({ ...prev, amount: text.replace(/,/g, '.') }))}
                autoCorrect={false}
              />
              
              {/* منتقي العملات التفاعلي مدمج بداخل مربع النص يميناً */}
              <TouchableOpacity style={[styles.tokenSelectorPill, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={handleOpenTokenModal}>
                <Image source={{ uri: currentToken.image }} style={styles.selectedTokenIcon} />
                <Text style={[styles.tokenSymbolText, { color: colors.text }]}>{state.currency}</Text>
                <Ionicons name="chevron-down" size={13} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            {/* الرصيد المتاح يظهر بدقة تحت حقل المبلغ مباشرة */}
            <Text style={[styles.balanceHintText, { color: colors.textSecondary }]}>
              {t('sendScreen.balance.available')}: {currentBalance.toFixed(6)} {state.currency}
            </Text>
            <Text style={[styles.balanceHintText, { color: colors.textSecondary }]}>
              {t('sendScreen.total_fees_label', { defaultValue: 'إجمالي الرسوم' })}: {totalFees.toFixed(5)} SOL
              {state.solPriceUsd > 0 ? ` (≈ $${(totalFees * state.solPriceUsd).toFixed(2)})` : ''}
            </Text>
          </View>

          {/* ── حقل إدخال العنوان والمستلم ── */}
          <View style={styles.inputSection}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>{t('sendScreen.inputs.recipient')}</Text>
            <View style={[styles.inputContainerNew, { backgroundColor: colors.card, borderColor: state.recipientExists === false ? colors.error : colors.border }]}>
              <TextInput
                style={[styles.inputNew, { color: colors.text, fontSize: 14, paddingVertical: 0 }]}
                placeholder={t('sendScreen.inputs.recipientPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={state.recipient}
                onChangeText={text => setState(prev => ({ ...prev, recipient: text }))}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.inputActions}>
                <TouchableOpacity onPress={handlePasteAddress} style={styles.iconBtn}>
                  <Ionicons name="clipboard-outline" size={18} color={primaryColor} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('QRScanner')} style={styles.iconBtn}>
                  <Ionicons name="qr-code-outline" size={18} color={primaryColor} />
                </TouchableOpacity>
                {state.recipient.length > 0 && (
                  <TouchableOpacity onPress={() => setState(prev => ({ ...prev, recipient: '' }))} style={styles.iconBtn}>
                    <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {state.recipient.length >= 32 && (
              <View style={styles.quickActions}>
                <TouchableOpacity
                  style={[styles.quickActionBtn, { backgroundColor: isRecipientSaved ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)' }]}
                  onPress={() => {
                    if (!isRecipientSaved) setSaveAddressModalVisible(true);
                    else Alert.alert(t('info'), t('sendScreen.already_saved'));
                  }}
                >
                  <Ionicons name={isRecipientSaved ? 'bookmark' : 'bookmark-outline'} size={14} color={isRecipientSaved ? colors.success : colors.warning} />
                  <Text style={[styles.quickActionText, { color: isRecipientSaved ? colors.success : colors.warning }]}>
                    {isRecipientSaved ? t('sendScreen.saved') : t('save')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── زر الإرسال المطور بملء العرض ── */}
          <TouchableOpacity
            style={[styles.sendButtonNew, { backgroundColor: primaryColor, opacity: state.loading ? 0.7 : 1 }]}
            onPress={handleSend}
            disabled={state.loading}
          >
            {state.loading
              ? <ActivityIndicator color="#FFF" />
              : <>
                  <Ionicons name="paper-plane" size={18} color="#FFF" />
                  <Text style={styles.sendButtonText}>{t('sendScreen.buttons.send')}</Text>
                </>
            }
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* منتقي العملات (Bottom Sheet) */}
      <Modal visible={state.modalVisible} transparent animationType="slide" onRequestClose={() => setState(prev => ({ ...prev, modalVisible: false }))}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNew, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('sendScreen.modals.chooseCurrency')}</Text>
              <TouchableOpacity onPress={() => setState(prev => ({ ...prev, modalVisible: false }))} style={[styles.closeBtn, { backgroundColor: colors.background }]}>
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            {state.loadingTokens
              ? <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 40 }} />
              : <FlatList
                  data={CORE_TOKENS.filter(tk => tk.symbol === 'SOL' || tk.symbol === 'MECO' || (balances.tokens[tk.symbol] || 0) > 0)}
                  keyExtractor={item => item.symbol}
                  renderItem={renderTokenItem}
                  contentContainerStyle={styles.tokenList}
                />
            }
          </View>
        </View>
      </Modal>

      {/* دفتر العناوين الأنيق والمنظم (Bottom Sheet) */}
      <Modal visible={addressBookModalVisible} transparent animationType="slide" onRequestClose={() => setAddressBookModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNew, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, maxHeight: '80%' }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Ionicons name="book" size={20} color={primaryColor} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('address_book')}</Text>
              </View>
              <TouchableOpacity onPress={() => setAddressBookModalVisible(false)} style={[styles.closeBtn, { backgroundColor: colors.background }]}>
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            {addressBook.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIconContainer, { backgroundColor: colors.background }]}>
                  <Ionicons name="book-outline" size={44} color={colors.textSecondary} />
                </View>
                <Text style={[styles.emptyTitle,    { color: colors.text }]}>{t('no_saved_addresses')}</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{t('save_address_hint')}</Text>
              </View>
            ) : (
              <FlatList
                data={addressBook}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.addressList}
                renderItem={({ item }) => (
                  <TouchableOpacity style={[styles.addressItemNew, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]} onPress={() => handleSelectSavedAddress(item.address)}>
                    <View style={[styles.addressAvatar, { backgroundColor: primaryColor + '15' }]}>
                      <Text style={[styles.addressAvatarText, { color: primaryColor }]}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.addressInfo}>
                      <Text style={[styles.addressNameNew, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.addressTextNew, { color: colors.textSecondary }]}>{item.address.slice(0, 10)}...{item.address.slice(-6)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteSavedAddress(item.address)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* حوار حفظ العنوان */}
      <Modal visible={saveAddressModalVisible} transparent animationType="fade" onRequestClose={() => setSaveAddressModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayCenter}>
          <View style={[styles.saveDialogContent, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={[styles.saveDialogIcon, { backgroundColor: colors.warning + '12' }]}>
              <Ionicons name="bookmark" size={28} color={colors.warning} />
            </View>
            <Text style={[styles.saveDialogTitle, { color: colors.text }]}>{t('save_address')}</Text>
            <View style={[styles.addressPreview, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}>
              <Text style={[styles.addressPreviewText, { color: colors.textSecondary }]}>
                {state.recipient.slice(0, 14)}...{state.recipient.slice(-8)}
              </Text>
            </View>
            <TextInput
              style={[styles.saveDialogInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, paddingVertical: 0, height: 46 }]}
              placeholder={t('enter_address_name')}
              placeholderTextColor={colors.textSecondary}
              value={newAddressName}
              onChangeText={setNewAddressName}
              autoFocus
              autoCorrect={false}
            />
            <View style={styles.saveDialogButtons}>
              <TouchableOpacity style={[styles.saveDialogBtn, { borderColor: colors.border }]} onPress={() => { setSaveAddressModalVisible(false); setNewAddressName(''); }}>
                <Text style={{ color: colors.text }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveDialogBtnPrimary, { backgroundColor: primaryColor }]} onPress={handleSaveAddressConfirm}>
                <Ionicons name="bookmark" size={16} color="#FFF" />
                <Text style={styles.saveDialogBtnText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent:       { flexGrow: 1 },
  container:           { flex: 1, padding: 20 },
  headerNew:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  backButton:          { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitleContainer:{ flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  headerTitle:         { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  headerSubText:       { fontSize: 11, marginTop: 2, textAlign: 'center' },
  addressBookButton:   { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  inputSection:        { marginBottom: 16 },
  inputLabel:          { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  inputContainerNew:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingLeft: 12, paddingRight: 8, height: 48 },
  inputNew:            { fontSize: 15, flex: 1, height: '100%' },
  inputActions:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn:             { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  amountHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  maxButton:           { fontSize: 12, fontWeight: '700' },
  quickActions:        { flexDirection: 'row', marginTop: 10, gap: 8 },
  quickActionBtn:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, gap: 5 },
  quickActionText:     { fontSize: 12, fontWeight: '700' },
  sendButtonNew:       { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 18, gap: 10, marginTop: 10 },
  sendButtonText:      { color: '#FFF', fontSize: 16, fontWeight: '700' },
  modalOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalOverlayCenter:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContentNew:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 12, maxHeight: '75%' },
  modalHandle:         { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalHeaderLeft:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closeBtn:            { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  modalTitle:          { fontSize: 18, fontWeight: '800' },
  tokenList:           { paddingBottom: 16 },
  tokenItem:           { borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1.5 },
  tokenItemContent:    { flexDirection: 'row', alignItems: 'center' },
  tokenIcon:           { width: 32, height: 32, borderRadius: 16 },
  tokenDetails:        { flex: 1, paddingHorizontal: 10 },
  tokenItemName:       { fontSize: 14, fontWeight: '700' },
  tokenBalance:        { fontSize: 12, marginTop: 2 },
  emptyState:          { alignItems: 'center', paddingVertical: 30 },
  emptyIconContainer:  { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyTitle:          { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  emptySubtitle:       { fontSize: 12, textAlign: 'center' },
  addressList:         { paddingBottom: 16 },
  addressItemNew:      { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1 },
  addressAvatar:       { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  addressAvatarText:   { fontSize: 18, fontWeight: '800' },
  addressInfo:         { flex: 1 },
  addressNameNew:      { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  addressTextNew:      { fontSize: 11 },
  deleteBtn:           { padding: 8 },
  saveDialogContent:   { width: '100%', padding: 20, borderRadius: 20, alignItems: 'center' },
  saveDialogIcon:      { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  saveDialogTitle:     { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  addressPreview:      { width: '100%', padding: 10, borderRadius: 10, marginBottom: 12 },
  addressPreviewText:  { fontSize: 11, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  saveDialogInput:     { width: '100%', borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 16, textAlign: 'center' },
  saveDialogButtons:   { flexDirection: 'row', gap: 10, width: '100%' },
  saveDialogBtn:       { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  saveDialogBtnPrimary:{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, gap: 6 },
  saveDialogBtnText:   { color: '#FFF', fontSize: 14, fontWeight: '700' },
  tokenSelectorPill:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, gap: 6 },
  selectedTokenIcon:   { width: 24, height: 24, borderRadius: 12 },
  tokenSymbolText:     { fontSize: 13, fontWeight: '700' },
  balanceHintText:     { fontSize: 11, marginTop: 6, fontWeight: '600', paddingLeft: 4 },
});
