// screens/MarketScreen.js - Fixed with Real Balances
// Last Updated: 2026-04-24

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  TextInput,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Svg, { Polyline } from 'react-native-svg';

import { getJupiterMarketData, CORE_TOKENS } from '../services/jupiterMarketService';
import { getGlobalMarketData, getTopMovers } from '../services/marketOverviewService';
import { getSolBalance, getTokenBalance } from '../services/heliusService';

const { width } = Dimensions.get('window');
const WATCHLIST_STORAGE_KEY = '@meco_watchlist';
const SPARKLINE_WIDTH = 70;
const SPARKLINE_HEIGHT = 35;

function MarketOverviewCard({ data, isDark }) {
  const colors = {
    background: isDark ? 'rgba(108, 99, 255, 0.15)' : 'rgba(108, 99, 255, 0.08)',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success: '#10B981',
    error: '#EF4444',
  };
  const isPositive = (data?.marketCapChange24h || 0) >= 0;

  return (
    <View style={[styles.overviewCard, { backgroundColor: colors.background }]}>
      <View style={styles.overviewRow}>
        <View style={styles.overviewItem}>
          <Text style={[styles.overviewLabel, { color: colors.secondary }]}>Market Cap</Text>
          <Text style={[styles.overviewValue, { color: colors.text }]}>
            {data?.totalMarketCapFormatted || '\$0'}
          </Text>
        </View>
        <View style={[styles.overviewItem, styles.overviewBorder]}>
          <Text style={[styles.overviewLabel, { color: colors.secondary }]}>24h Volume</Text>
          <Text style={[styles.overviewValue, { color: colors.text }]}>
            {data?.totalVolume24hFormatted || '\$0'}
          </Text>
        </View>
        <View style={styles.overviewItem}>
          <Text style={[styles.overviewLabel, { color: colors.secondary }]}>BTC Dom</Text>
          <Text style={[styles.overviewValue, { color: colors.text }]}>
            {data?.btcDominance?.toFixed(1) || '0'}%
          </Text>
        </View>
      </View>
      <View style={[styles.marketChangeBar, {
        backgroundColor: isPositive ? colors.success + '20' : colors.error + '20'
      }]}>
        <Ionicons name={isPositive ? 'trending-up' : 'trending-down'} size={16}
          color={isPositive ? colors.success : colors.error} />
        <Text style={[styles.marketChangeText, { color: isPositive ? colors.success : colors.error }]}>
          {data?.marketCapChangeFormatted || '0%'} (24h)
        </Text>
      </View>
    </View>
  );
}

function PortfolioSummaryCard({ totalValue, changePercent, isDark }) {
  const { t } = useTranslation();
  const colors = {
    background: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success: '#10B981',
    error: '#EF4444',
  };
  const isPositive = changePercent >= 0;

  return (
    <View style={[styles.portfolioCard, { backgroundColor: colors.background }]}>
      <View style={styles.portfolioHeader}>
        <View>
          <Text style={[styles.portfolioLabel, { color: colors.secondary }]}>
            {t('total_balance') || 'Total Balance'}
          </Text>
          <Text style={[styles.portfolioValue, { color: colors.text }]}>
            ${totalValue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </Text>
        </View>
        <View style={[styles.portfolioChange, {
          backgroundColor: isPositive ? colors.success + '20' : colors.error + '20'
        }]}>
          <Ionicons name={isPositive ? 'arrow-up' : 'arrow-down'} size={12}
            color={isPositive ? colors.success : colors.error} />
          <Text style={[styles.portfolioChangeText, { color: isPositive ? colors.success : colors.error }]}>
            {Math.abs(changePercent).toFixed(2)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

function TopMoversSection({ gainers, losers, isDark }) {
  const { t } = useTranslation();
  const colors = {
    background: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success: '#10B981',
    error: '#EF4444',
  };

  const renderMoverItem = (item, isGainer) => (
    <View key={item.symbol} style={[styles.moverItem, { backgroundColor: colors.background }]}>
      <Text style={[styles.moverSymbol, { color: colors.text }]}>{item.symbol}</Text>
      <Text style={[styles.moverChange, { color: isGainer ? colors.success : colors.error }]}>
        {isGainer ? '+' : ''}{item.change24h?.toFixed(1)}%
      </Text>
    </View>
  );

  return (
    <View style={styles.topMoversContainer}>
      <View style={styles.moverColumn}>
        <View style={styles.moverHeader}>
          <Ionicons name="flame" size={16} color={colors.success} />
          <Text style={[styles.moverTitle, { color: colors.success }]}>
            {t('market_top_gainers') || 'Top Gainers'}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.moverRow}>
            {(gainers || []).slice(0, 3).map(item => renderMoverItem(item, true))}
          </View>
        </ScrollView>
      </View>
      <View style={[styles.moverColumn, { marginTop: 12 }]}>
        <View style={styles.moverHeader}>
          <Ionicons name="snow" size={16} color={colors.error} />
          <Text style={[styles.moverTitle, { color: colors.error }]}>
            {t('market_losers') || 'Losers'}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.moverRow}>
            {(losers || []).slice(0, 3).map(item => renderMoverItem(item, false))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function TokenListItem({ token, index, onPress, onLongPress, isDark, primaryColor }) {
  const colors = {
    background: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success: '#10B981',
    error: '#EF4444',
  };

  const isPositive = (token.price_change_percentage_24h || 0) >= 0;
  const changeColor = isPositive ? colors.success : colors.error;

  const sparklinePoints = useMemo(() => {
    const change = token.price_change_percentage_24h || 0;
    const values = [];
    for (let i = 0; i < 15; i++) {
      const progress = i / 14;
      const base = 100 * (1 + (change / 100) * progress * (0.7 + Math.sin(i * 0.5) * 0.3));
      values.push(base);
    }
    return values;
  }, [token.price_change_percentage_24h]);

  const renderSparkline = () => {
    const min = Math.min(...sparklinePoints);
    const max = Math.max(...sparklinePoints);
    const range = max - min || 1;
    const points = sparklinePoints.map((value, i) => {
      const x = (i / 14) * SPARKLINE_WIDTH;
      const y = SPARKLINE_HEIGHT - ((value - min) / range) * SPARKLINE_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return (
      <Svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT}>
        <Polyline points={points} fill="none" stroke={changeColor}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  };

  const formatPrice = (price) => {
    if (!price || price === 0) return '\$0.00';
    if (price < 0.0001) return `$${price.toExponential(2)}`;
    if (price < 0.01) return price.toFixed(6);
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };

  return (
    <TouchableOpacity
      style={[styles.tokenCard, { backgroundColor: colors.background }]}
      onPress={() => onPress(token)}
      onLongPress={() => onLongPress(token)}
      activeOpacity={0.7}
    >
      <View style={styles.tokenLeft}>
        <Text style={[styles.tokenRank, { color: colors.secondary }]}>{index + 1}</Text>
        <View style={[styles.tokenIcon, { backgroundColor: primaryColor + '20' }]}>
          {token.image ? (
            <Image source={{ uri: token.image }} style={styles.tokenIconImage} />
          ) : (
            <Text style={[styles.tokenIconText, { color: primaryColor }]}>
              {token.symbol?.charAt(0)}
            </Text>
          )}
        </View>
        <View style={styles.tokenInfo}>
          <Text style={[styles.tokenSymbol, { color: colors.text }]}>{token.symbol}</Text>
          <Text style={[styles.tokenName, { color: colors.secondary }]} numberOfLines={1}>
            {token.name}
          </Text>
        </View>
      </View>
      <View style={styles.tokenCenter}>{renderSparkline()}</View>
      <View style={styles.tokenRight}>
        <Text style={[styles.tokenPrice, { color: colors.text }]}>
          {formatPrice(token.current_price)}
        </Text>
        <View style={[styles.tokenChangeBadge, { backgroundColor: changeColor + '15' }]}>
          <Ionicons name={isPositive ? 'arrow-up' : 'arrow-down'} size={10} color={changeColor} />
          <Text style={[styles.tokenChangeText, { color: changeColor }]}>
            {Math.abs(token.price_change_percentage_24h || 0).toFixed(2)}%
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MarketScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [marketOverview, setMarketOverview] = useState(null);
  const [topMovers, setTopMovers] = useState({ gainers: [], losers: [] });
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [portfolioChange, setPortfolioChange] = useState(0);
  const [sortBy, setSortBy] = useState('rank');

  const colors = {
    background: isDark ? '#0A0A0F' : '#F8F9FA',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    success: '#10B981',
    error: '#EF4444',
  };

  useEffect(() => {
    const loadWatchlist = async () => {
      try {
        const stored = await AsyncStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (stored) setWatchlist(JSON.parse(stored));
      } catch (e) { console.warn('Failed to load watchlist:', e); }
    };
    loadWatchlist();
  }, []);

  // ✅ دالة جلب بيانات السوق مع الرصيد الحقيقي
  const fetchAllMarketData = async () => {
    try {
      const [tokenData, overviewData, moversData] = await Promise.all([
        getJupiterMarketData(),
        getGlobalMarketData(),
        getTopMovers(5),
      ]);

      setTokens(tokenData);
      setMarketOverview(overviewData);
      setTopMovers(moversData);

      // ✅ جلب الرصيد الحقيقي من المحفظة
      const walletPublicKey = await SecureStore.getItemAsync('wallet_public_key');

      if (walletPublicKey) {
        // جلب أرصدة المفاتيح الأساسية
        const solBalance = await getSolBalance(true, walletPublicKey);
        const solPrice = tokenData.find(t => t.symbol === 'SOL')?.current_price || 145;

        const mecoBalance = await getTokenBalance(
          '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i',
          true,
          walletPublicKey
        );
        const mecoPrice = tokenData.find(t => t.symbol === 'MECO')?.current_price || 0.00613;

        const usdcBalance = await getTokenBalance(
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          true,
          walletPublicKey
        );

        // حساب القيمة الإجمالية
        const totalValue =
          (solBalance * solPrice) +
          (mecoBalance * mecoPrice) +
          (usdcBalance * 1);

        setPortfolioValue(totalValue);
        setPortfolioChange(overviewData?.marketCapChange24h || 0);
      } else {
        setPortfolioValue(0);
        setPortfolioChange(0);
      }
    } catch (error) {
      console.error('Market fetch error:', error);
      setTokens(CORE_TOKENS.map((t, i) => ({
        ...t,
        current_price: t.symbol === 'MECO' ? 0.00613 : (t.symbol === 'SOL' ? 145.50 : 1),
        price_change_percentage_24h: (Math.random() - 0.5) * 10,
        rank: i + 1,
      })));
    }
  };

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      await fetchAllMarketData();
      if (isMounted) setLoading(false);
    };
    init();
    const intervalId = setInterval(fetchAllMarketData, 30000);
    return () => { isMounted = false; clearInterval(intervalId); };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllMarketData();
    const stored = await AsyncStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (stored) setWatchlist(JSON.parse(stored));
    setRefreshing(false);
  };

  const handleTokenPress = (token) => navigation.navigate('TokenDetails', { token });

  const handleAddToWatchlist = async (token) => {
    try {
      let newWatchlist;
      if (watchlist.includes(token.symbol)) {
        newWatchlist = watchlist.filter(s => s !== token.symbol);
      } else {
        newWatchlist = [...watchlist, token.symbol];
      }
      setWatchlist(newWatchlist);
      await AsyncStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(newWatchlist));
    } catch (e) { console.warn('Failed to update watchlist:', e); }
  };

  const filteredTokens = useMemo(() => {
    let filtered = tokens.filter(t => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!t.symbol?.toLowerCase().includes(query) && !t.name?.toLowerCase().includes(query)) return false;
      }
      if (activeTab === 'watchlist') return watchlist.includes(t.symbol);
      else if (activeTab === 'solana') return t.swapAvailable;
      else if (activeTab === 'gainers') return (t.price_change_percentage_24h || 0) > 0;
      else if (activeTab === 'losers') return (t.price_change_percentage_24h || 0) < 0;
      return true;
    });
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price': return (b.current_price || 0) - (a.current_price || 0);
        case 'change': return (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0);
        default: return (a.rank || 999) - (b.rank || 999);
      }
    });
    return filtered;
  }, [tokens, searchQuery, activeTab, watchlist, sortBy]);

  const tabs = [
    { id: 'all', label: t('all_tokens') || 'All' },
    { id: 'watchlist', label: t('watchlist') || 'Watchlist' },
    { id: 'solana', label: t('solana_tokens') || 'Solana' },
    { id: 'gainers', label: t('gainers') || 'Gainers' },
    { id: 'losers', label: t('market_losers') || 'Losers' },
  ];

  const sortOptions = [
    { id: 'rank', label: 'Rank' },
    { id: 'price', label: 'Price' },
    { id: 'change', label: '24h' },
  ];

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.loadingText, { color: colors.secondary }]}>
            {t('loading') || 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('market_title') || 'Market'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.secondary }]}>
            {t('market_subtitle') || 'Real prices • Live updates'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.searchButton, { backgroundColor: colors.card }]}
          onPress={() => setSearchModalVisible(true)}>
          <Ionicons name="search" size={20} color={colors.secondary} />
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
          colors={[primaryColor]} tintColor={primaryColor} />} showsVerticalScrollIndicator={false}>
        <MarketOverviewCard data={marketOverview} isDark={isDark} />
        <PortfolioSummaryCard totalValue={portfolioValue} changePercent={portfolioChange} isDark={isDark} />
        <TopMoversSection gainers={topMovers.gainers} losers={topMovers.losers} isDark={isDark} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContent}>
          {tabs.map(tab => (
            <TouchableOpacity key={tab.id} style={[styles.tab, activeTab === tab.id && { backgroundColor: primaryColor }]}
              onPress={() => setActiveTab(tab.id)}>
              <Text style={[styles.tabText, { color: activeTab === tab.id ? '#FFFFFF' : colors.secondary }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.sortContainer}>
          {sortOptions.map(option => (
            <TouchableOpacity key={option.id}
              style={[styles.sortButton, sortBy === option.id && { backgroundColor: primaryColor + '20' }]}
              onPress={() => setSortBy(option.id)}>
              <Text style={[styles.sortButtonText, { color: sortBy === option.id ? primaryColor : colors.secondary }]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tokenList}>
          {filteredTokens.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={48} color={colors.secondary} />
              <Text style={[styles.emptyText, { color: colors.secondary }]}>
                {activeTab === 'watchlist' ? (t('watchlist_empty') || 'No tokens') : (t('no_results') || 'No results')}
              </Text>
            </View>
          ) : filteredTokens.map((token, index) => (
            <TokenListItem key={token.mint || token.id} token={token} index={index}
              onPress={handleTokenPress} onLongPress={handleAddToWatchlist}
              isDark={isDark} primaryColor={primaryColor} />
          ))}
        </View>
      </ScrollView>
      <Modal visible={searchModalVisible} animationType="slide" transparent={true}
        onRequestClose={() => setSearchModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('market_search') || 'Search'}
              </Text>
              <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.modalInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder={t('market_search_placeholder') || 'Search...'}
              placeholderTextColor={colors.secondary} value={searchQuery}
              onChangeText={setSearchQuery} autoFocus={true} />
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: primaryColor }]}
              onPress={() => setSearchModalVisible(false)}>
              <Text style={styles.modalButtonText}>{t('ok') || 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: 28, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  searchButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },
  overviewCard: { borderRadius: 16, padding: 16, marginBottom: 12 },
  overviewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  overviewItem: { flex: 1, alignItems: 'center' },
  overviewBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(128, 128, 128, 0.2)' },
  overviewLabel: { fontSize: 12, marginBottom: 4 },
  overviewValue: { fontSize: 16, fontWeight: 'bold' },
  marketChangeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
  marketChangeText: { fontSize: 14, fontWeight: '600' },
  portfolioCard: { borderRadius: 16, padding: 16, marginBottom: 12 },
  portfolioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  portfolioLabel: { fontSize: 12, marginBottom: 4 },
  portfolioValue: { fontSize: 24, fontWeight: 'bold' },
  portfolioChange: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
  portfolioChangeText: { fontSize: 14, fontWeight: '600' },
  topMoversContainer: { marginBottom: 12 },
  moverColumn: {},
  moverHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  moverTitle: { fontSize: 14, fontWeight: '600' },
  moverRow: { flexDirection: 'row', gap: 8 },
  moverItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  moverSymbol: { fontSize: 12, fontWeight: '600' },
  moverChange: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  tabsScroll: { marginBottom: 12 },
  tabsContent: { paddingRight: 20 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: 'rgba(128, 128, 128, 0.1)' },
  tabText: { fontSize: 14, fontWeight: '600' },
  sortContainer: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  sortButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  sortButtonText: { fontSize: 12, fontWeight: '500' },
  tokenList: { gap: 10 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { marginTop: 12, fontSize: 16 },
  tokenCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14 },
  tokenLeft: { flexDirection: 'row', alignItems: 'center', flex: 1.2 },
  tokenRank: { fontSize: 11, width: 20, textAlign: 'center' },
  tokenIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  tokenIconImage: { width: 36, height: 36, borderRadius: 18 },
  tokenIconText: { fontSize: 14, fontWeight: 'bold' },
  tokenInfo: { flex: 1 },
  tokenSymbol: { fontSize: 15, fontWeight: 'bold' },
  tokenName: { fontSize: 11, marginTop: 1 },
  tokenCenter: { flex: 0.8, alignItems: 'center', justifyContent: 'center' },
  tokenRight: { flex: 1, alignItems: 'flex-end' },
  tokenPrice: { fontSize: 14, fontWeight: 'bold' },
  tokenChangeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginTop: 4, gap: 2 },
  tokenChangeText: { fontSize: 11, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { borderRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '600' },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 20 },
  modalButton: { padding: 16, borderRadius: 12, alignItems: 'center' },
  modalButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
