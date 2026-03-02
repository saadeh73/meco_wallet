import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
  Modal, FlatList, Image, Linking
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as SwapAPI from '../services/swapService';

// ✅ قائمة العملات (MECO معطلة مؤقتاً لحين توفر السيولة)
const SUPPORTED_TOKENS = [
  {
    symbol: 'SOL',
    name: 'Solana',
    mint: SwapAPI.TOKEN_MINTS.SOL,
    decimals: 9,
    icon: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: SwapAPI.TOKEN_MINTS.USDC,
    decimals: 6,
    icon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    mint: SwapAPI.TOKEN_MINTS.USDT,
    decimals: 6,
    icon: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  },
  /*
  {
    symbol: 'MECO',
    name: 'MonyCoin',
    mint: SwapAPI.TOKEN_MINTS.MECO,
    decimals: 9,
    icon: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco-logo.png',
  },
  */
];

export default function SwapScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  // الافتراضي: من SOL إلى USDC
  const [fromToken, setFromToken] = useState(SUPPORTED_TOKENS[0]); 
  const [toToken, setToToken] = useState(SUPPORTED_TOKENS[1]); 
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

  useEffect(() => { loadBalances(); }, []);

  const loadBalances = async () => {
    try {
      const newBalances = {};
      for (const token of SUPPORTED_TOKENS) {
        try {
          const result = await SwapAPI.checkBalance(token.symbol, 0);
          newBalances[token.symbol] = result.balance;
        } catch (e) {
          newBalances[token.symbol] = 0;
        }
      }
      setBalances(newBalances);
    } catch (error) {
      console.error('Error loading balances:', error);
    }
  };

  useEffect(() => {
    const fetchRate = async () => {
      if (!fromAmount || parseFloat(fromAmount) <= 0) {
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
        setError(err.message || t('swap_error'));
        setToAmount('');
        setRate(null);
      } finally {
        setQuoteLoading(false);
      }
    };
    const timer = setTimeout(fetchRate, 500);
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
              const result = await SwapAPI.executeSwap(fromToken.symbol, toToken.symbol, parseFloat(fromAmount));
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
              setError(err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const swapTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const useMaxBalance = () => {
    const balance = balances[fromToken.symbol] || 0;
    if (balance > 0) setFromAmount(balance.toString());
  };

  const copyMintAddress = (mint) => {
    Clipboard.setStringAsync(mint);
    Alert.alert(t('copied'), 'تم نسخ عنوان العقد');
  };

  const renderTokenModal = (visible, onClose, onSelect, selectedToken) => (
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
            data={SUPPORTED_TOKENS}
            keyExtractor={item => item.symbol}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.tokenItem, { borderBottomColor: colors.border }]}
                onPress={() => { onSelect(item); onClose(); }}
              >
                <Image source={{ uri: item.icon }} style={styles.tokenIcon} />
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text }]}>{t('swap_title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('swap_subtitle')}</Text>

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
              <Image source={{ uri: fromToken.icon }} style={styles.selectorIcon} />
              <Text style={[styles.selectorText, { color: colors.text }]}>{fromToken.symbol}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.balanceText, { color: colors.textSecondary }]}>
            {t('swap_balance')}: {balances[fromToken.symbol]?.toFixed(4) || '0'} {fromToken.symbol}
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
              <Image source={{ uri: toToken.icon }} style={styles.selectorIcon} />
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

        {error ? (
          <View style={[styles.errorCard, { backgroundColor: colors.error + '15' }]}>
            <Ionicons name="warning" size={20} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.swapExecuteButton,
            { backgroundColor: primaryColor, opacity: (loading || quoteLoading || !fromAmount) ? 0.6 : 1 }
          ]}
          onPress={handleSwap}
          disabled={loading || quoteLoading || !fromAmount}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="swap-horizontal" size={20} color="#FFF" />
              <Text style={styles.swapExecuteButtonText}>{t('swap_confirm')}</Text>
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
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 25 },
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
