import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
  Modal, FlatList, Image, Linking
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as SwapAPI from '../services/swapService'; 
import NetInfo from '@react-native-community/netinfo';
import { CORE_TOKENS } from '../services/jupiterMarketService';
// ✅ جلب دوال الرصيد المباشرة
import { getSolBalance, getTokenBalance } from '../services/heliusService';

export default function SwapScreen({ route }) {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const activeAccount = useAppStore(state => {
    const accounts = state.accounts;
    const activeIndex = state.activeAccountIndex;
    return accounts.length > 0 ? accounts[activeIndex] : null;
  });

  const initialTokenSymbol = route.params?.fromToken || 'SOL';
  const initialFromToken = CORE_TOKENS.find(t => t.symbol === initialTokenSymbol) || CORE_TOKENS[0];
  const initialToToken = CORE_TOKENS.find(t => t.symbol === 'USDC') || CORE_TOKENS[3];

  const [fromToken, setFromToken] = useState(initialFromToken);
  const [toToken, setToToken] = useState(initialToToken);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [rate, setRate] = useState(null);
  const [priceImpact, setPriceImpact] = useState(0);

  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [balances, setBalances] = useState({});
  const [fromModalVisible, setFromModalVisible] = useState(false);
  const [toModalVisible, setToModalVisible] = useState(false);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);

  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
  };

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeAccount?.publicKey) {
        loadBalances();
      }
    }, [activeAccount?.publicKey])
  );

  // ✅ الدالة المصححة لجلب الأرصدة الحقيقية مباشرة من البلوكشين
  const loadBalances = async () => {
    if (!activeAccount?.publicKey) return;
    try {
      const pubKey = activeAccount.publicKey;
      const newBalances = {};

      // جلب رصيد الـ SOL أولاً
      try {
        const solBal = await getSolBalance(true, pubKey);
        newBalances['SOL'] = solBal || 0;
      } catch (e) {
        newBalances['SOL'] = 0;
      }

      // جلب أرصدة باقي التوكنز
      for (const token of CORE_TOKENS) {
        if (!token.swapAvailable || token.symbol === 'SOL') continue;
        try {
          const tokenBal = await getTokenBalance(token.mint, true, pubKey);
          newBalances[token.symbol] = tokenBal || 0;
        } catch (e) {
          newBalances[token.symbol] = 0;
        }
      }
      
      setBalances(newBalances);
    } catch (error) {
      console.error('Error loading balances in SwapScreen:', error);
    }
  };

  const fetchSwapRate = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setToAmount('');
      setRate(null);
      return;
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      setError(t('network_error'));
      setToAmount('');
      setRate(null);
      return;
    }

    setQuoteLoading(true);
    setError('');
    try {
      const result = await SwapAPI.getSwapRate(fromToken.symbol, toToken.symbol, parseFloat(fromAmount));
      setToAmount(result.outputAmount.toFixed(6));
      setRate(result.rate);
      setPriceImpact(result.priceImpact);
    } catch (err) {
      let errorMsg = err.message || t('swap_error');
      if (errorMsg.includes('Network') || errorMsg.includes('Timeout')) {
        errorMsg = t('network_error');
      } else if (errorMsg.includes('مسار') || errorMsg.includes('Route')) {
        errorMsg = t('swap_no_route');
      }
      setError(errorMsg);
      setToAmount('');
      setRate(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchSwapRate, 800);
    return () => clearTimeout(timer);
  }, [fromAmount, fromToken, toToken, t]);

  const handleSwap = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      Alert.alert(t('error'), t('swap_enter_amount'));
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
    const slippageBps = isMecoInvolved ? 300 : 100;

    Alert.alert(
      t('swap_confirm'),
      `${t('swap_from')}: ${fromAmount} ${fromToken.symbol}\n${t('swap_to')}: ${toAmount} ${toToken.symbol}\n${t('swap_rate')}: 1 ${fromToken.symbol} = ${rate?.toFixed(6)} ${toToken.symbol}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            setLoading(true);
            setError('');
            try {
              const privateKey = useAppStore.getState().walletPrivateKey;
              const result = await SwapAPI.executeSwap(
                fromToken.symbol,
                toToken.symbol,
                parseFloat(fromAmount),
                slippageBps,
                3,
                activeAccount.publicKey,
                privateKey
              );

              if (result.success) {
                Alert.alert(
                  t('swap_completed'),
                  `${fromAmount} ${fromToken.symbol} → ${result.outputAmount.toFixed(6)} ${toToken.symbol}`,
                  [
                    { text: t('view_on_solscan'), onPress: () => Linking.openURL(result.explorerUrl) },
                    { text: t('ok'), onPress: () => { loadBalances(); setFromAmount(''); setToAmount(''); } }
                  ]
                );
              } else {
                Alert.alert(t('error'), result.error);
              }
            } catch (err) {
              Alert.alert(t('error'), err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const swapTokens = () => {
    if (fromToken.mint === toToken.mint) {
      Alert.alert(t('error'), t('swap_same_token'));
      return;
    }
    
    const tempFrom = fromToken;
    const tempTo = toToken;
    
    setFromAmount('');
    setToAmount('');
    setRate(null);
    setPriceImpact(0);
    
    setFromToken(tempTo);
    setToToken(tempFrom);
  };

  const useMaxBalance = () => {
    const balance = balances[fromToken.symbol] || 0;
    if (balance > 0) setFromAmount(balance.toString());
  };

  const copyMintAddress = (mint) => {
    if (!mint) return;
    Clipboard.setStringAsync(mint);
    Alert.alert(t('copied'), t('copied_to_clipboard'));
  };

  const renderTokenModal = (visible, onClose, onSelect, selectedToken) => {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_token')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={CORE_TOKENS.filter(t => t.swapAvailable)}
              keyExtractor={item => item.symbol}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.tokenItem, { borderBottomColor: colors.border }]}
                  onPress={() => { onSelect(item); onClose(); }}
                >
                  <Image source={{ uri: item.image }} style={styles.tokenIcon} />
                  <View style={styles.tokenInfo}>
                    <Text style={[styles.tokenSymbol, { color: colors.text }]}>{item.symbol}</Text>
                    <Text style={[styles.tokenName, { color: colors.textSecondary }]}>{item.name}</Text>
                  </View>
                  {item.symbol === selectedToken.symbol && (
                    <Ionicons name="checkmark-circle" size={24} color={primaryColor} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    );
  };

  const renderError = () => {
    if (!error) return null;
    const isNetworkError = error.includes(t('network_error'));
    return (
      <View style={[styles.errorCard, { backgroundColor: colors.error + '15' }]}>
        <Ionicons name="warning" size={20} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        {isNetworkError && (
          <TouchableOpacity onPress={fetchSwapRate} style={styles.retryButton}>
            <Ionicons name="refresh" size={18} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text }]}>{t('swap_title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('swap_subtitle')}</Text>

        {activeAccount && (
          <View style={[styles.activeAccountCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.activeAccountLabel, { color: colors.textSecondary }]}>
              {t('swapping_from')}
            </Text>
            <Text style={[styles.activeAccountName, { color: colors.text }]}>{activeAccount.name}</Text>
            <Text style={[styles.activeAccountAddress, { color: primaryColor }]}>
              {activeAccount.publicKey.slice(0, 8)}...{activeAccount.publicKey.slice(-8)}
            </Text>
          </View>
        )}

        {isOffline && (
          <View style={[styles.offlineBanner, { backgroundColor: colors.warning + '20' }]}>
            <Ionicons name="cloud-offline" size={16} color={colors.warning} />
            <Text style={[styles.offlineText, { color: colors.warning }]}>
              {t('offline_mode')}
            </Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{t('swap_from')}</Text>
            <TouchableOpacity onPress={useMaxBalance}>
              <Text style={[styles.maxButton, { color: primaryColor }]}>{t('swap_max')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={fromAmount}
              onChangeText={setFromAmount}
            />
            <TouchableOpacity
              style={[styles.tokenSelector, { borderColor: colors.border }]}
              onPress={() => setFromModalVisible(true)}
            >
              <Image source={{ uri: fromToken.image }} style={styles.selectorIcon} />
              <Text style={[styles.selectorText, { color: colors.text }]}>{fromToken.symbol}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.balanceText, { color: colors.textSecondary }]}>
            {t('swap_balance')}: {balances[fromToken.symbol]?.toFixed(4) || '0.0000'} {fromToken.symbol}
          </Text>
        </View>

        <TouchableOpacity onPress={swapTokens} style={styles.swapButton}>
          <View style={[styles.swapButtonCircle, { backgroundColor: colors.card }]}>
            <Ionicons name="swap-vertical" size={24} color={primaryColor} />
          </View>
        </TouchableOpacity>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{t('swap_to')}</Text>
            <TouchableOpacity onPress={() => copyMintAddress(toToken.mint)}>
              <Ionicons name="copy-outline" size={18} color={primaryColor} />
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={toAmount}
              editable={false}
            />
            <TouchableOpacity
              style={[styles.tokenSelector, { borderColor: colors.border }]}
              onPress={() => setToModalVisible(true)}
            >
              <Image source={{ uri: toToken.image }} style={styles.selectorIcon} />
              <Text style={[styles.selectorText, { color: colors.text }]}>{toToken.symbol}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {quoteLoading && (
          <View style={[styles.loadingQuote, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="small" color={primaryColor} />
            <Text style={[styles.loadingQuoteText, { color: colors.textSecondary }]}>{t('swap_loading_quote')}</Text>
          </View>
        )}

        {rate && !quoteLoading && (
          <View style={[styles.rateCard, { backgroundColor: colors.card }]}>
            <View style={styles.rateRow}>
              <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{t('swap_rate')}</Text>
              <Text style={[styles.rateValue, { color: colors.text }]}>
                1 {fromToken.symbol} = {rate.toFixed(6)} {toToken.symbol}
              </Text>
            </View>
            {priceImpact > 0 && (
              <View style={styles.rateRow}>
                <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>Price Impact</Text>
                <Text style={[styles.rateValue, { color: priceImpact > 5 ? colors.error : colors.success }]}>
                  {priceImpact.toFixed(2)}%
                </Text>
              </View>
            )}
            <View style={styles.rateRow}>
              <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>{t('swap_receive')}</Text>
              <Text style={[styles.rateValue, { color: colors.success, fontWeight: '600' }]}>
                {toAmount} {toToken.symbol}
              </Text>
            </View>
          </View>
        )}

        {renderError()}

        <TouchableOpacity
          style={[
            styles.swapExecuteButton,
            { backgroundColor: primaryColor, opacity: (loading || quoteLoading || !fromAmount || isOffline) ? 0.6 : 1 }
          ]}
          onPress={handleSwap}
          disabled={loading || quoteLoading || !fromAmount || isOffline}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="swap-horizontal" size={20} color="#FFF" />
              <Text style={styles.swapExecuteButtonText}>
                {isOffline ? t('offline_mode') : t('swap_confirm')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {renderTokenModal(fromModalVisible, () => setFromModalVisible(false), setFromToken, fromToken)}
      {renderTokenModal(toModalVisible, () => setToModalVisible(false), setToToken, toToken)}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  backButton: { marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 5, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 15 },
  activeAccountCard: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 15,
    alignItems: 'center',
  },
  activeAccountLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  activeAccountName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  activeAccountAddress: {
    fontSize: 13,
    fontWeight: '500',
  },
  card: { borderRadius: 20, padding: 16, marginBottom: 10, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  cardLabel: { fontSize: 14, fontWeight: '500' },
  maxButton: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, fontSize: 24, padding: 0, height: 50 },
  tokenSelector: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 30, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  selectorIcon: { width: 24, height: 24, borderRadius: 12 },
  selectorText: { fontSize: 16, fontWeight: '600' },
  balanceText: { fontSize: 12, marginTop: 8, textAlign: 'right' },
  swapButton: { alignSelf: 'center', marginVertical: 5, zIndex: 10 },
  swapButtonCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', elevation: 3 },
  loadingQuote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, marginTop: 10, gap: 8 },
  loadingQuoteText: { fontSize: 14 },
  rateCard: { borderRadius: 16, padding: 16, marginTop: 15, marginBottom: 10 },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  rateLabel: { fontSize: 14 },
  rateValue: { fontSize: 14, fontWeight: '500' },
  errorCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginVertical: 10, gap: 8 },
  errorText: { flex: 1, fontSize: 14 },
  retryButton: { padding: 4 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 15, gap: 8 },
  offlineText: { fontSize: 14, fontWeight: '500' },
  swapExecuteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 16, marginTop: 15, marginBottom: 10, gap: 8 },
  swapExecuteButtonText: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  tokenItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  tokenIcon: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  tokenInfo: { flex: 1 },
  tokenSymbol: { fontSize: 16, fontWeight: '600' },
  tokenName: { fontSize: 12, marginTop: 2 },
});
