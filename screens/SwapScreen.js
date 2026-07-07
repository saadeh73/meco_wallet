// screens/SwapScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
  Modal, FlatList, Image, Linking, Animated, Dimensions, Platform, Keyboard
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // ✅ استيراد للهوامش الآمنة
import * as Clipboard from 'expo-clipboard';
import * as SwapAPI from '../services/swapService';
import NetInfo from '@react-native-community/netinfo';
import { CORE_TOKENS, getSolPriceUsd } from '../services/jupiterMarketService';
import { getSolBalance, getTokenBalance } from '../services/heliusService';

const { height, width } = Dimensions.get('window');

// ── ثوابت ──────────────────────────────────────────────────────────────────
const SOL_FEE_RESERVE  = 0.001;  // الحد الأدنى لرسوم الشبكة
const PLATFORM_FEE_SOL = 0.0005; // رسوم المنصة الثابتة — نفس القيمة المطبّقة في Send/Staking/Trading

const ERROR_TYPE = {
  NETWORK: 'network',
  ROUTE:   'route',
  GENERAL: 'general',
  NONE:    null,
};

export default function SwapScreen() {
  const navigation   = useNavigation();
  const route        = useRoute();
  const { t }        = useTranslation();
  const theme        = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';
  const insets       = useSafeAreaInsets(); // مسافات الأمان للهاتف

  // ── Animations ────────────────────────────────────────────────────────────
  const fadeAnim       = useRef(new Animated.Value(0)).current;
  const slideAnim      = useRef(new Animated.Value(20)).current;
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
  const [balancesCached,   setBalancesCached]   = useState(false);
  const [fromModalVisible, setFromModalVisible] = useState(false);
  const [toModalVisible,   setToModalVisible]   = useState(false);
  const [errorMsg,         setErrorMsg]         = useState('');
  const [errorType,        setErrorType]        = useState(ERROR_TYPE.NONE);
  const [isOffline,        setIsOffline]        = useState(false);
  const [solPriceUsd,      setSolPriceUsd]      = useState(0);

  // ── Colours ───────────────────────────────────────────────────────────────
  const colors = {
    background:    isDark ? '#07070F' : '#F4F5F9',
    card:          isDark ? '#111122' : '#FFFFFF',
    card2:         isDark ? '#171730' : '#ECECF4',
    text:          isDark ? '#EEEEFF' : '#1C1C24',
    textSecondary: isDark ? '#7E7EAA' : '#8A8A9E',
    border:        isDark ? '#1E1E38' : '#E8E8F2',
    success:       '#10B981',
    error:         '#EF4444',
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

  // ── سعر SOL لعرض القيمة التقديرية بالدولار لرسوم المنصة ──────────────────
  useEffect(() => {
    getSolPriceUsd().then(p => setSolPriceUsd(p || 0)).catch(() => {});
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
      setBalancesCached(true);
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
      setErrorType(ERROR_TYPE.NETWORK);
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

    const feeUsdText = solPriceUsd > 0 ? ` (≈ $${(PLATFORM_FEE_SOL * solPriceUsd).toFixed(2)})` : '';
    const feeNotice = t('swap_platform_fee_notice', {
      fee: PLATFORM_FEE_SOL,
      feeUsd: feeUsdText,
      defaultValue: `رسوم المنصة: {{fee}} SOL{{feeUsd}} + رسوم شبكة سولانا`,
    });

    Alert.alert(
      t('swap_confirm'),
      `${t('swap_from')}: ${fromAmount} ${fromToken.symbol}\n${t('swap_to')}: ${parseFloat(toAmount).toFixed(6)} ${toToken.symbol}\n${t('swap_rate')}: 1 ${fromToken.symbol} = ${rate?.toFixed(6)} ${toToken.symbol}\n\n${feeNotice}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            setLoading(true);
            setErrorMsg('');
            setErrorType(ERROR_TYPE.NONE);
            try {
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
                        setBalancesCached(false);
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

  const useMaxBalance = () => {
    let balance = balances[fromToken.symbol] || 0;
    if (fromToken.symbol === 'SOL') {
      balance = Math.max(0, balance - SOL_FEE_RESERVE);
    }
    if (balance > 0) setFromAmount(balance.toString());
  };

  const copyMintAddress = async (address) => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert(t('success'), t('copied_to_clipboard'));
  };

  const rotateInterpolate = swapRotateAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // منتقي العملات الأنيق كـ Bottom Sheet سفلية فاخرة
  const renderTokenModal = (visible, onClose, onSelect, selectedToken) => (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_token')}</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.background }]}>
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={CORE_TOKENS.filter(tk => tk.swapAvailable)}
            keyExtractor={item => item.symbol}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.tokenItem, { borderBottomColor: colors.border }]}
                onPress={() => { onSelect(item); onClose(); }}
              >
                <View style={[styles.tokenIconWrapper, { backgroundColor: isDark ? '#171730' : '#ECECF4' }]}>
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
                    <Ionicons name="checkmark-circle" size={18} color={primaryColor} />
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );

  const renderError = () => {
    if (!errorMsg) return null;
    const isNetworkErr = errorType === ERROR_TYPE.NETWORK;
    return (
      <View style={[styles.errCard, { backgroundColor: colors.error + '12', borderColor: colors.error + '30' }]}>
        <Ionicons name={isNetworkErr ? 'cloud-offline-outline' : 'warning-outline'} size={16} color={colors.error} />
        <Text style={[styles.errTxt, { color: colors.error }]}>{errorMsg}</Text>
        {isNetworkErr && (
          <TouchableOpacity onPress={fetchSwapRate} style={[styles.retryBtn, { backgroundColor: colors.error + '20' }]}>
            <Text style={{ color: colors.error, fontSize: 11, fontWeight: '700' }}>{t('browser_reload') || 'تحديث'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 0 : insets.top }]}>
      <Animated.View style={[styles.mainContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        
        {/* شريط الرأس المطور المانع للتداخل */}
        <View style={styles.headerSection}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Text style={[styles.title,    { color: colors.text }]}>{t('swap_title')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('swap_subtitle')}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]} showsVerticalScrollIndicator={false}>

          {/* معلومات الحساب النشط المدمجة كسطر هادئ تحت الهيدر */}
          {activeAccount && (
            <View style={[styles.accountBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.accountIconWrapper, { backgroundColor: primaryColor + '12' }]}>
                <Ionicons name="wallet-outline" size={16} color={primaryColor} />
              </View>
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.accountName, { color: colors.text }]}>{activeAccount.name}</Text>
                <Text style={[styles.accountAddress, { color: colors.textSecondary }]}>
                  {activeAccount.publicKey.slice(0, 6)}...{activeAccount.publicKey.slice(-4)}
                </Text>
              </View>
            </View>
          )}

          {isOffline && (
            <View style={[styles.offlineBanner, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
              <Ionicons name="cloud-offline" size={16} color={colors.warning} />
              <Text style={[styles.offlineText, { color: colors.warning }]}>{t('offline_mode')}</Text>
            </View>
          )}

          {/* ── كبسولة التبادل المسطحة الموحدة (Phantom/Solflare Style) ── */}
          <View style={[styles.unifiedSwapContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            
            {/* جهة الإرسال (From) */}
            <View style={styles.swapInputRow}>
              <View style={styles.swapInputLeft}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t('swap_from')}</Text>
                <TextInput
                  style={[styles.amountInput, { color: colors.text, paddingVertical: 0 }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={fromAmount}
                  onChangeText={setFromAmount}
                  autoCorrect={false}
                />
                <Text style={[styles.balanceHint, { color: colors.textSecondary }]}>
                  {t('swap_balance')}: {balances[fromToken.symbol]?.toFixed(4) || '0.0000'}
                </Text>
              </View>
              <View style={styles.swapInputRight}>
                <TouchableOpacity onPress={useMaxBalance} style={[styles.maxBtn, { backgroundColor: primaryColor + '12' }]}>
                  <Text style={{ color: primaryColor, fontWeight: '700', fontSize: 11 }}>{t('swap_max')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tokenSelectorPill, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setFromModalVisible(true)}
                >
                  <Image source={{ uri: fromToken.image }} style={styles.tokenImage} />
                  <Text style={[styles.tokenSelectorTxt, { color: colors.text }]}>{fromToken.symbol}</Text>
                  <Ionicons name="chevron-down" size={13} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* الفاصل الذكي المتضمن زر التبديل التفاعلي بالمنتصف */}
            <View style={[styles.swapDivider, { backgroundColor: colors.border }]}>
              <TouchableOpacity
                onPress={swapTokens}
                style={[styles.swapButtonCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.8}
              >
                <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
                  <Ionicons name="swap-vertical" size={18} color={primaryColor} />
                </Animated.View>
              </TouchableOpacity>
            </View>

            {/* جهة الاستقبال (To) */}
            <View style={styles.swapInputRow}>
              <View style={styles.swapInputLeft}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{t('swap_to')}</Text>
                <Text style={[styles.amountOutput, { color: colors.text }]} numberOfLines={1}>
                  {toAmount || '0.00'}
                </Text>
              </View>
              <View style={styles.swapInputRight}>
                <TouchableOpacity onPress={() => copyMintAddress(toToken.mint)} style={[styles.copyPill, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Ionicons name="link" size={12} color={primaryColor} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tokenSelectorPill, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => setToModalVisible(true)}
                >
                  <Image source={{ uri: toToken.image }} style={styles.tokenImage} />
                  <Text style={[styles.tokenSelectorTxt, { color: colors.text }]}>{toToken.symbol}</Text>
                  <Ionicons name="chevron-down" size={13} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

          </View>

          {/* مؤشر التحميل المؤقت للأسعار */}
          {quoteLoading && (
            <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <ActivityIndicator size="small" color={primaryColor} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('swap_loading_quote')}</Text>
            </View>
          )}

          {/* تفاصيل وحسابات الصفقة المنسقة */}
          {rate && !quoteLoading && (
            <Animated.View style={[styles.rateCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.rateRow}>
                <View style={styles.rateLabelWrapper}>
                  <Ionicons name="swap-horizontal" size={14} color={colors.textSecondary} />
                  <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{t('swap_rate')}</Text>
                </View>
                <Text style={[styles.rateValue, { color: colors.text }]}>
                  1 {fromToken.symbol} = {rate.toFixed(6)} {toToken.symbol}
                </Text>
              </View>

              {priceImpact > 0 && (
                <View style={styles.rateRow}>
                  <View style={styles.rateLabelWrapper}>
                    <Ionicons name="trending-down" size={14} color={colors.textSecondary} />
                    <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{t('price_impact')}</Text>
                  </View>
                  <Text style={[styles.rateValue, { color: priceImpact > 5 ? colors.error : colors.success }]}>
                    {priceImpact.toFixed(2)}%
                  </Text>
                </View>
              )}

              <View style={styles.rateRow}>
                <View style={styles.rateLabelWrapper}>
                  <Ionicons name="receipt-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{t('platform_fee_label', { defaultValue: 'رسوم المنصة' })}</Text>
                </View>
                <Text style={[styles.rateValue, { color: colors.text }]}>
                  {PLATFORM_FEE_SOL} SOL{solPriceUsd > 0 ? ` (≈ $${(PLATFORM_FEE_SOL * solPriceUsd).toFixed(2)})` : ''}
                </Text>
              </View>

              <View style={[styles.rateRow, { marginBottom: 0, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={styles.rateLabelWrapper}>
                  <Ionicons name="arrow-down-circle" size={14} color={colors.textSecondary} />
                  <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{t('swap_receive')}</Text>
                </View>
                <Text style={[styles.rateValueHighlight, { color: colors.success }]}>
                  {toAmount} {toToken.symbol}
                </Text>
              </View>
            </Animated.View>
          )}

          {renderError()}

          {/* زر التأكيد المسطح بملء العرض */}
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
                <Ionicons name="swap-horizontal" size={18} color="#FFF" />
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
  headerSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  backButton:    { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle:   { flex: 1, alignItems: 'flex-start' },
  title:         { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  subtitle:      { fontSize: 13, marginTop: 2 },

  // Account card
  accountBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, padding: 10, marginBottom: 16, borderWidth: 1, gap: 10
  },
  accountIconWrapper: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  accountName:        { fontSize: 14, fontWeight: '700' },
  accountAddress:     { fontSize: 12, fontWeight: '500' },
  copyBtn:            { padding: 6 },

  // Offline
  offlineBanner: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, marginBottom: 16, gap: 8, borderWidth: 1 },
  offlineText:   { fontSize: 12, fontWeight: '700' },

  // Unified Swap Container (Phantom/Solflare Style)
  unifiedSwapContainer: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  swapInputRow: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swapInputLeft: { flex: 1, alignItems: 'flex-start' },
  swapInputRight: { alignItems: 'flex-end', gap: 6 },
  rowLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  amountInput: { fontSize: 26, fontWeight: '800', padding: 0, height: 36, width: '100%' },
  amountOutput: { fontSize: 26, fontWeight: '800', height: 36, paddingVertical: 0 },
  balanceHint: { fontSize: 11, marginTop: 6, fontWeight: '600' },
  maxBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  tokenSelectorPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, gap: 6 },
  tokenImage: { width: 22, height: 22, borderRadius: 11 },
  tokenSelectorTxt: { fontSize: 13, fontWeight: '700' },
  copyPill: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },

  // Floating Swap Divider
  swapDivider: { height: 1, position: 'relative', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  swapButtonCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, justifyContent: 'center', alignItems: 'center', position: 'absolute' },

  // Loading
  loadingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 16, marginTop: 14, gap: 8, borderWidth: 1 },
  loadingText: { fontSize: 13, fontWeight: '600' },

  // Rate card
  rateCard: { borderRadius: 16, padding: 14, marginTop: 14 },
  rateRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rateLabelWrapper:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rateLabel:          { fontSize: 12, fontWeight: '600' },
  rateValue:          { fontSize: 12, fontWeight: '700' },
  rateValueHighlight: { fontSize: 14, fontWeight: '800' },

  // Error
  errorCard:   { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, marginTop: 14, gap: 8, borderWidth: 1 },
  errorText:   { flex: 1, fontSize: 12, fontWeight: '600' },
  retryButton: { padding: 4 },

  // Execute button
  executeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 16, borderRadius: 16, marginTop: 16, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 4
  },
  executeButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Modal (Bottom Sheet style)
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:  { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 12, maxHeight: height * 0.75 },
  modalHandle:   { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16, backgroundColor: '#E5E5EA' },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:    { fontSize: 18, fontWeight: '800' },
  tokenItem:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  tokenIconWrapper:   { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  tokenIcon:          { width: 24, height: 24, borderRadius: 12 },
  tokenInfo:          { flex: 1 },
  tokenSymbolTxt:     { fontSize: 14, fontWeight: '700' },
  tokenName:          { fontSize: 11, marginTop: 2 },
  tokenBalanceWrapper:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenBalance:       { fontSize: 13, fontWeight: '700' },
});
