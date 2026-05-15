import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
  Modal, FlatList, Image, Linking, Animated, Dimensions, Platform
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as SwapAPI from '../services/swapService';
import NetInfo from '@react-native-community/netinfo';
import { CORE_TOKENS } from '../services/jupiterMarketService';
import { getSolBalance, getTokenBalance } from '../services/heliusService';

const { height } = Dimensions.get('window');

// ── ثوابت ──────────────────────────────────────────────────────────────────
const SOL_FEE_RESERVE = 0.001; // الحد الأدنى لرسوم الشبكة

// نوع الخطأ — بدلاً من مقارنة النص المترجم
const ERROR_TYPE = {
  NETWORK: 'network',
  ROUTE:   'route',
  GENERAL: 'general',
  NONE:    null,
};

export default function SwapScreen({ route }) {
  const navigation   = useNavigation();
  const { t }        = useTranslation();
  const theme        = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';

  // ── Animations ────────────────────────────────────────────────────────────
  const fadeAnim       = useRef(new Animated.Value(0)).current;
  const slideAnim      = useRef(new Animated.Value(30)).current;
  const swapRotateAnim = useRef(new Animated.Value(0)).current;

  // ── Active account ────────────────────────────────────────────────────────
  const activeAccount = useAppStore(state => {
    const accounts    = state.accounts;
    const activeIndex = state.activeAccountIndex;
    return accounts.length > 0 ? accounts[activeIndex] : null;
  });

  // ── Initial tokens ────────────────────────────────────────────────────────
  const initialSymbol    = route.params?.fromToken || 'SOL';
  const initialFromToken = CORE_TOKENS.find(tk => tk.symbol === initialSymbol) || CORE_TOKENS[0];
  const initialToToken   = CORE_TOKENS.find(tk => tk.symbol === 'USDC')        || CORE_TOKENS[3];

  // ── State ─────────────────────────────────────────────────────────────────
  const [fromToken,        setFromToken]        = useState(initialFromToken);
  const [toToken,          setToToken]          = useState(initialToToken);
  const [fromAmount,       setFromAmount]       = useState('');
  const [toAmount,         setToAmount]         = useState('');
  const [rate,             setRate]             = useState(null);
  const [priceImpact,      setPriceImpact]      = useState(0);
  const [loading,          setLoading]          = useState(false);
  const [quoteLoading,     setQuoteLoading]     = useState(false);
  const [balances,         setBalances]         = useState({});
  const [balancesCached,   setBalancesCached]   = useState(false); // ✅ cache بسيط
  const [fromModalVisible, setFromModalVisible] = useState(false);
  const [toModalVisible,   setToModalVisible]   = useState(false);
  const [errorMsg,         setErrorMsg]         = useState('');
  const [errorType,        setErrorType]        = useState(ERROR_TYPE.NONE); // ✅ flag منفصل
  const [isOffline,        setIsOffline]        = useState(false);

  // ── Colours ───────────────────────────────────────────────────────────────
  const colors = {
    background:    isDark ? '#0A0A0F' : '#F2F3F7',
    card:          isDark ? '#1A1A2E' : '#FFFFFF',
    text:          isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#8E8E93',
    border:        isDark ? '#2A2A3E' : '#E5E5EA',
    success:       '#4CAF50',
    error:         '#FF3B30',
    warning:       '#F59E0B',
  };

  // ── Entry animation ───────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8,   useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Network listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => setIsOffline(!state.isConnected));
    return () => unsub();
  }, []);

  // ── Load balances on focus (مع cache) ────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (activeAccount?.publicKey && !balancesCached) {
        loadBalances();
      }
    }, [activeAccount?.publicKey, balancesCached])
  );

  const loadBalances = async () => {
    if (!activeAccount?.publicKey) return;
    try {
      const pubKey      = activeAccount.publicKey;
      const newBalances = {};

      try {
        const solBal = await getSolBalance(true, pubKey);
        newBalances['SOL'] = solBal || 0;
      } catch (_) {
        newBalances['SOL'] = 0;
      }

      for (const token of CORE_TOKENS) {
        if (!token.swapAvailable || token.symbol === 'SOL') continue;
        try {
          const tokenBal = await getTokenBalance(token.mint, true, pubKey);
          newBalances[token.symbol] = tokenBal || 0;
        } catch (_) {
          newBalances[token.symbol] = 0;
        }
      }

      setBalances(newBalances);
      setBalancesCached(true); // ✅ لا تُعاد الاستدعاء عند كل focus
    } catch (err) {
      console.error('Error loading balances:', err);
    }
  };

  // ── Fetch quote ───────────────────────────────────────────────────────────
  const fetchSwapRate = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setToAmount('');
      setRate(null);
      setErrorMsg('');
      setErrorType(ERROR_TYPE.NONE);
      return;
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      setErrorMsg(t('network_error'));
      setErrorType(ERROR_TYPE.NETWORK); // ✅ flag واضح
      setToAmount('');
      setRate(null);
      return;
    }

    setQuoteLoading(true);
    setErrorMsg('');
    setErrorType(ERROR_TYPE.NONE);

    try {
      const result = await SwapAPI.getSwapRate(
        fromToken.symbol,
        toToken.symbol,
        parseFloat(fromAmount),
      );
      setToAmount(result.outputAmount.toFixed(6));
      setRate(result.rate);
      setPriceImpact(result.priceImpact);
    } catch (err) {
      const msg = err.message || '';
      // ✅ تحديد نوع الخطأ من رسالة الـ API وليس من النص المترجم
      if (msg.includes('Network') || msg.includes('Timeout') || msg.includes('fetch')) {
        setErrorMsg(t('network_error'));
        setErrorType(ERROR_TYPE.NETWORK);
      } else if (msg.includes('مسار') || msg.includes('Route') || msg.includes('route')) {
        setErrorMsg(t('swap_no_route'));
        setErrorType(ERROR_TYPE.ROUTE);
      } else {
        setErrorMsg(t('swap_error'));
        setErrorType(ERROR_TYPE.GENERAL);
      }
      setToAmount('');
      setRate(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  // debounce 600ms
  useEffect(() => {
    const timer = setTimeout(fetchSwapRate, 600);
    return () => clearTimeout(timer);
  }, [fromAmount, fromToken, toToken]);

  // ── Execute swap ──────────────────────────────────────────────────────────
  const handleSwap = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      Alert.alert(t('error'), t('swap_enter_amount'));
      return;
    }

    // ✅ التحقق من toAmount قبل عرض الـ Alert
    if (!toAmount || parseFloat(toAmount) <= 0) {
      Alert.alert(t('error'), t('swap_error'));
      return;
    }

    const fromBalance = balances[fromToken.symbol] || 0;
    if (parseFloat(fromAmount) > fromBalance) {
      Alert.alert(t('error'), t('swap_insufficient_balance'));
      return;
    }

    if (!activeAccount) {
      Alert.alert(t('error'), t('no_active_account'));
      return;
    }

    const isMecoInvolved = fromToken.symbol === 'MECO' || toToken.symbol === 'MECO';
    const slippageBps    = isMecoInvolved ? 300 : 100;

    Alert.alert(
      t('swap_confirm'),
      `${t('swap_from')}: ${fromAmount} ${fromToken.symbol}\n${t('swap_to')}: ${parseFloat(toAmount).toFixed(6)} ${toToken.symbol}\n${t('swap_rate')}: 1 ${fromToken.symbol} = ${rate?.toFixed(6)} ${toToken.symbol}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            setLoading(true);
            setErrorMsg('');
            setErrorType(ERROR_TYPE.NONE);
            try {
              // ✅ getState() صحيح هنا — ليس hook
              const privateKey = useAppStore.getState().walletPrivateKey;
              const result = await SwapAPI.executeSwap(
                fromToken.symbol,
                toToken.symbol,
                parseFloat(fromAmount),
                slippageBps,
                3,
                activeAccount.publicKey,
                privateKey,
              );

              if (result.success) {
                Alert.alert(
                  t('swap_completed'),
                  `${fromAmount} ${fromToken.symbol} → ${result.outputAmount.toFixed(6)} ${toToken.symbol}`,
                  [
                    { text: t('view_on_solscan'), onPress: () => Linking.openURL(result.explorerUrl) },
                    {
                      text: t('ok'),
                      onPress: () => {
                        setBalancesCached(false); // ✅ تحديث الأرصدة بعد swap ناجح
                        loadBalances();
                        setFromAmount('');
                        setToAmount('');
                        setRate(null);
                        setPriceImpact(0);
                      },
                    },
                  ],
                );
              } else {
                Alert.alert(t('error'), result.error);
              }
            } catch (err) {
              Alert.alert(t('error'), err.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  // ── Swap tokens ───────────────────────────────────────────────────────────
  const swapTokens = () => {
    if (fromToken.mint === toToken.mint) {
      Alert.alert(t('error'), t('swap_same_token'));
      return;
    }

    Animated.sequence([
      Animated.timing(swapRotateAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(swapRotateAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    const prev = fromToken;
    setFromToken(toToken);
    setToToken(prev);
    setFromAmount('');
    setToAmount('');
    setRate(null);
    setPriceImpact(0);
    setErrorMsg('');
    setErrorType(ERROR_TYPE.NONE);
  };

  // ── Max balance ───────────────────────────────────────────────────────────
  const useMaxBalance = () => {
    let balance = balances[fromToken.symbol] || 0;
    // ✅ طرح رسوم الشبكة إذا كانت العملة SOL
    if (fromToken.symbol === 'SOL') {
      balance = Math.max(0, balance - SOL_FEE_RESERVE);
    }
    if (balance > 0) setFromAmount(balance.toString());
  };

  // ── Copy address ──────────────────────────────────────────────────────────
  const copyMintAddress = async (address) => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert(t('success'), t('copied_to_clipboard'));
  };

  // ── Rotate interpolation ──────────────────────────────────────────────────
  const rotateInterpolate = swapRotateAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // ── Token selector modal ──────────────────────────────────────────────────
  const renderTokenModal = (visible, onClose, onSelect, selectedToken) => (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_token')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            // ✅ إصلاح تعارض اسم t — تغيير parameter إلى tk
            data={CORE_TOKENS.filter(tk => tk.swapAvailable)}
            keyExtractor={item => item.symbol}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.tokenItem, { borderBottomColor: colors.border }]}
                onPress={() => { onSelect(item); onClose(); }}
              >
                <View style={[styles.tokenIconWrapper, { backgroundColor: primaryColor + '15' }]}>
                  <Image source={{ uri: item.image }} style={styles.tokenIcon} />
                </View>
                <View style={styles.tokenInfo}>
                  <Text style={[styles.tokenSymbolTxt, { color: colors.text }]}>{item.symbol}</Text>
                  <Text style={[styles.tokenName,      { color: colors.textSecondary }]}>{item.name}</Text>
                </View>
                <View style={styles.tokenBalanceWrapper}>
                  <Text style={[styles.tokenBalance, { color: colors.text }]}>
                    {balances[item.symbol]?.toFixed(4) || '0.0000'}
                  </Text>
                  {item.symbol === selectedToken.symbol && (
                    <Ionicons name="checkmark-circle" size={22} color={primaryColor} />
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );

  // ── Error card ────────────────────────────────────────────────────────────
  const renderError = () => {
    if (!errorMsg) return null;
    // ✅ استخدام errorType flag بدلاً من مقارنة النص المترجم
    const isNetworkErr = errorType === ERROR_TYPE.NETWORK;
    return (
      <View style={[styles.errorCard, { backgroundColor: colors.error + '15' }]}>
        <Ionicons name="warning" size={20} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.error }]}>{errorMsg}</Text>
        {isNetworkErr && (
          <TouchableOpacity onPress={fetchSwapRate} style={styles.retryButton}>
            <Ionicons name="refresh" size={20} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.mainContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.headerSection}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.headerTitle}>
              <Text style={[styles.title,    { color: colors.text }]}>{t('swap_title')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('swap_subtitle')}</Text>
            </View>
          </View>

          {/* Active Account Card */}
          {activeAccount && (
            <Animated.View style={[styles.accountCard, { backgroundColor: colors.card, opacity: fadeAnim }]}>
              <View style={[styles.accountIconWrapper, { backgroundColor: primaryColor + '20' }]}>
                <Ionicons name="wallet" size={20} color={primaryColor} />
              </View>
              <View style={styles.accountInfo}>
                <Text style={[styles.accountName,    { color: colors.text }]}>{activeAccount.name}</Text>
                <Text style={[styles.accountAddress, { color: primaryColor }]}>
                  {activeAccount.publicKey.slice(0, 6)}...{activeAccount.publicKey.slice(-4)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => copyMintAddress(activeAccount.publicKey)} style={styles.copyBtn}>
                <Ionicons name="copy-outline" size={18} color={primaryColor} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Offline Banner */}
          {isOffline && (
            <View style={[styles.offlineBanner, { backgroundColor: colors.warning + '20' }]}>
              <Ionicons name="cloud-offline" size={18} color={colors.warning} />
              <Text style={[styles.offlineText, { color: colors.warning }]}>{t('offline_mode')}</Text>
            </View>
          )}

          {/* From Card */}
          <View style={[styles.tokenCard, { backgroundColor: colors.card }]}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{t('swap_from')}</Text>
              <TouchableOpacity onPress={useMaxBalance} style={[styles.maxButton, { backgroundColor: primaryColor + '15' }]}>
                <Text style={[styles.maxButtonText, { color: primaryColor }]}>{t('swap_max')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tokenRow}>
              <TextInput
                style={[styles.amountInput, { color: colors.text }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={fromAmount}
                onChangeText={setFromAmount}
              />
              <TouchableOpacity
                style={[styles.tokenSelector, { backgroundColor: isDark ? '#2A2A3E' : '#F2F2F7' }]}
                onPress={() => setFromModalVisible(true)}
              >
                <Image source={{ uri: fromToken.image }} style={styles.tokenImage} />
                <Text style={[styles.tokenSymbolTxt, { color: colors.text }]}>{fromToken.symbol}</Text>
                <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.balanceRow}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('swap_balance')}:</Text>
              <Text style={[styles.balanceValue, { color: colors.text }]}>
                {balances[fromToken.symbol]?.toFixed(4) || '0.0000'} {fromToken.symbol}
              </Text>
            </View>
          </View>

          {/* Swap Direction Button */}
          <View style={styles.swapButtonWrapper}>
            <TouchableOpacity
              onPress={swapTokens}
              style={[styles.swapButton, { backgroundColor: colors.card }]}
              activeOpacity={0.8}
            >
              <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
                <Ionicons name="swap-vertical" size={24} color={primaryColor} />
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* To Card */}
          <View style={[styles.tokenCard, { backgroundColor: colors.card }]}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{t('swap_to')}</Text>
              <TouchableOpacity onPress={() => copyMintAddress(toToken.mint)} style={styles.copySmallBtn}>
                <Ionicons name="link" size={16} color={primaryColor} />
              </TouchableOpacity>
            </View>

            <View style={styles.tokenRow}>
              <Text style={[styles.amountOutput, { color: colors.text }]}>
                {toAmount || '0.00'}
              </Text>
              <TouchableOpacity
                style={[styles.tokenSelector, { backgroundColor: isDark ? '#2A2A3E' : '#F2F2F7' }]}
                onPress={() => setToModalVisible(true)}
              >
                <Image source={{ uri: toToken.image }} style={styles.tokenImage} />
                <Text style={[styles.tokenSymbolTxt, { color: colors.text }]}>{toToken.symbol}</Text>
                <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quote Loading */}
          {quoteLoading && (
            <View style={[styles.loadingCard, { backgroundColor: colors.card }]}>
              <ActivityIndicator size="small" color={primaryColor} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('swap_loading_quote')}</Text>
            </View>
          )}

          {/* Rate Info */}
          {rate && !quoteLoading && (
            <Animated.View style={[styles.rateCard, { backgroundColor: colors.card }]}>
              <View style={styles.rateRow}>
                <View style={styles.rateLabelWrapper}>
                  <Ionicons name="swap-horizontal" size={16} color={colors.textSecondary} />
                  <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{t('swap_rate')}</Text>
                </View>
                <Text style={[styles.rateValue, { color: colors.text }]}>
                  1 {fromToken.symbol} = {rate.toFixed(6)} {toToken.symbol}
                </Text>
              </View>

              {priceImpact > 0 && (
                <View style={styles.rateRow}>
                  <View style={styles.rateLabelWrapper}>
                    <Ionicons name="trending-down" size={16} color={colors.textSecondary} />
                    {/* ✅ إزالة fallback الثابت — المفتاح موجود في i18n */}
                    <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{t('price_impact')}</Text>
                  </View>
                  <Text style={[styles.rateValue, { color: priceImpact > 5 ? colors.error : colors.success }]}>
                    {priceImpact.toFixed(2)}%
                  </Text>
                </View>
              )}

              <View style={styles.rateRow}>
                <View style={styles.rateLabelWrapper}>
                  <Ionicons name="arrow-down-circle" size={16} color={colors.textSecondary} />
                  <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{t('swap_receive')}</Text>
                </View>
                <Text style={[styles.rateValueHighlight, { color: colors.success }]}>
                  {toAmount} {toToken.symbol}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Error */}
          {renderError()}

          {/* Execute Button */}
          <TouchableOpacity
            style={[
              styles.executeButton,
              {
                backgroundColor: primaryColor,
                opacity: (loading || quoteLoading || !fromAmount || isOffline) ? 0.6 : 1,
              },
            ]}
            onPress={handleSwap}
            disabled={loading || quoteLoading || !fromAmount || isOffline}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="swap-horizontal" size={22} color="#FFF" />
                <Text style={styles.executeButtonText}>
                  {isOffline ? t('offline_mode') : t('swap_confirm')}
                </Text>
              </>
            )}
          </TouchableOpacity>

        </ScrollView>
      </Animated.View>

      {renderTokenModal(fromModalVisible, () => setFromModalVisible(false), setFromToken, fromToken)}
      {renderTokenModal(toModalVisible,   () => setToModalVisible(false),   setToToken,   toToken)}
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container:     { flex: 1 },
  mainContent:   { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  // Header
  headerSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backButton:    { padding: 8, marginRight: 12 },
  headerTitle:   { flex: 1 },
  title:         { fontSize: 24, fontWeight: '800' },
  subtitle:      { fontSize: 13, marginTop: 2 },

  // Account card
  accountCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  accountIconWrapper: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  accountInfo:        { flex: 1 },
  accountName:        { fontSize: 15, fontWeight: '600' },
  accountAddress:     { fontSize: 12, fontWeight: '500', marginTop: 2 },
  copyBtn:            { padding: 8 },

  // Offline
  offlineBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 16, gap: 8 },
  offlineText:   { fontSize: 14, fontWeight: '600' },

  // Token card
  tokenCard: {
    borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  cardTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardLabel:     { fontSize: 14, fontWeight: '500' },
  maxButton:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  maxButtonText: { fontSize: 13, fontWeight: '700' },
  tokenRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amountInput:   { flex: 1, fontSize: 28, fontWeight: '700', padding: 0 },
  amountOutput:  { flex: 1, fontSize: 28, fontWeight: '700' },
  tokenSelector: { flexDirection: 'row', alignItems: 'center', borderRadius: 30, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  tokenImage:    { width: 28, height: 28, borderRadius: 14 },
  tokenSymbolTxt:{ fontSize: 16, fontWeight: '700' }, // ✅ اسم مختلف عن parameter
  balanceRow:    { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 6 },
  balanceLabel:  { fontSize: 12 },
  balanceValue:  { fontSize: 12, fontWeight: '600' },
  copySmallBtn:  { padding: 4 },

  // Swap direction button
  swapButtonWrapper: { alignItems: 'center', marginVertical: -10, zIndex: 10 },
  swapButton: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },

  // Loading
  loadingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 16, marginTop: 16, gap: 10 },
  loadingText: { fontSize: 14 },

  // Rate card
  rateCard: {
    borderRadius: 18, padding: 16, marginTop: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  rateRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rateLabelWrapper:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateLabel:          { fontSize: 14 },
  rateValue:          { fontSize: 14, fontWeight: '600' },
  rateValueHighlight: { fontSize: 16, fontWeight: '800' },

  // Error
  errorCard:   { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginTop: 16, gap: 10 },
  errorText:   { flex: 1, fontSize: 14, fontWeight: '500' },
  retryButton: { padding: 4 },

  // Execute button
  executeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 18, borderRadius: 18, marginTop: 20, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  executeButtonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },

  // Modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:  { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: height * 0.7 },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:    { fontSize: 20, fontWeight: '800' },
  tokenItem:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  tokenIconWrapper:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  tokenIcon:          { width: 28, height: 28, borderRadius: 14 },
  tokenInfo:          { flex: 1 },
  tokenName:          { fontSize: 12, marginTop: 2 },
  tokenBalanceWrapper:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  tokenBalance:       { fontSize: 14, fontWeight: '600' },
});
