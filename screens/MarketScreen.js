// screens/MarketScreen.js
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, RefreshControl, SafeAreaView, ActivityIndicator,
  TextInput,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Polyline } from 'react-native-svg';

import { getJupiterMarketData, CORE_TOKENS } from '../services/jupiterMarketService';
import { getGlobalMarketData, getTopMovers } from '../services/marketOverviewService';
import { getSolBalance, getTokenBalance } from '../services/heliusService';

const SPARKLINE_WIDTH      = 70;
const SPARKLINE_HEIGHT     = 35;
const WATCHLIST_KEY        = '@meco_watchlist';
const REFRESH_INTERVAL_MS  = 30000;

// ─── MarketOverviewCard ───────────────────────────────────────────────────────
function MarketOverviewCard({ data, isDark }) {
  const { t } = useTranslation();
  const C = {
    bg:      isDark ? 'rgba(108,99,255,0.15)' : 'rgba(108,99,255,0.08)',
    text:    isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success: '#10B981',
    error:   '#EF4444',
  };
  const isPositive = (data?.marketCapChange24h || 0) >= 0;

  return (
    <View style={[S.overviewCard, { backgroundColor: C.bg }]}>
      <View style={S.overviewRow}>
        <View style={S.overviewItem}>
          {/* ✅ مترجم */}
          <Text style={[S.overviewLabel, { color: C.secondary }]}>{t('market_cap_label')}</Text>
          <Text style={[S.overviewValue, { color: C.text }]}>{data?.totalMarketCapFormatted || '$0'}</Text>
        </View>
        <View style={[S.overviewItem, S.overviewBorder]}>
          <Text style={[S.overviewLabel, { color: C.secondary }]}>{t('market_volume')}</Text>
          <Text style={[S.overviewValue, { color: C.text }]}>{data?.totalVolume24hFormatted || '$0'}</Text>
        </View>
        <View style={S.overviewItem}>
          <Text style={[S.overviewLabel, { color: C.secondary }]}>{t('btc_dominance')}</Text>
          <Text style={[S.overviewValue, { color: C.text }]}>{data?.btcDominance?.toFixed(1) || '0'}%</Text>
        </View>
      </View>
      <View style={[S.marketChangeBar, { backgroundColor: isPositive ? C.success + '20' : C.error + '20' }]}>
        <Ionicons name={isPositive ? 'trending-up' : 'trending-down'} size={16} color={isPositive ? C.success : C.error} />
        {/* ✅ مترجم بدون نص ثابت "(24h)" */}
        <Text style={[S.marketChangeText, { color: isPositive ? C.success : C.error }]}>
          {data?.marketCapChangeFormatted || '0%'} ({t('time_24h')})
        </Text>
      </View>
    </View>
  );
}

// ─── PortfolioSummaryCard ─────────────────────────────────────────────────────
function PortfolioSummaryCard({ totalValue, changePercent, isDark }) {
  const { t } = useTranslation();
  const C = {
    bg:      isDark ? '#1A1A2E' : '#FFFFFF',
    text:    isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success: '#10B981',
    error:   '#EF4444',
  };
  const isPositive = changePercent >= 0;

  return (
    <View style={[S.portfolioCard, { backgroundColor: C.bg }]}>
      <View style={S.portfolioHeader}>
        <View>
          <Text style={[S.portfolioLabel, { color: C.secondary }]}>{t('total_balance')}</Text>
          <Text style={[S.portfolioValue, { color: C.text }]}>
            ${totalValue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </Text>
        </View>
        <View style={[S.portfolioChange, { backgroundColor: isPositive ? C.success + '20' : C.error + '20' }]}>
          <Ionicons name={isPositive ? 'arrow-up' : 'arrow-down'} size={12} color={isPositive ? C.success : C.error} />
          <Text style={[S.portfolioChangeText, { color: isPositive ? C.success : C.error }]}>
            {Math.abs(changePercent).toFixed(2)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── TopMoversSection ─────────────────────────────────────────────────────────
function TopMoversSection({ gainers, losers, isDark }) {
  const { t } = useTranslation();
  const C = {
    bg:      isDark ? '#1A1A2E' : '#FFFFFF',
    text:    isDark ? '#FFFFFF' : '#1A1A2E',
    success: '#10B981',
    error:   '#EF4444',
  };

  const MoverItem = ({ item, isGainer }) => (
    <View style={[S.moverItem, { backgroundColor: C.bg }]}>
      <Text style={[S.moverSymbol, { color: C.text }]}>{item.symbol}</Text>
      <Text style={[S.moverChange, { color: isGainer ? C.success : C.error }]}>
        {isGainer ? '+' : ''}{item.change24h?.toFixed(1)}%
      </Text>
    </View>
  );

  return (
    <View style={S.topMoversContainer}>
      <View style={S.moverColumn}>
        <View style={S.moverHeader}>
          <Ionicons name="flame" size={16} color={C.success} />
          <Text style={[S.moverTitle, { color: C.success }]}>{t('market_top_gainers')}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={S.moverRow}>
            {(gainers || []).slice(0, 3).map(item => <MoverItem key={item.symbol} item={item} isGainer />)}
          </View>
        </ScrollView>
      </View>
      <View style={[S.moverColumn, { marginTop: 12 }]}>
        <View style={S.moverHeader}>
          <Ionicons name="snow" size={16} color={C.error} />
          <Text style={[S.moverTitle, { color: C.error }]}>{t('market_losers')}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={S.moverRow}>
            {(losers || []).slice(0, 3).map(item => <MoverItem key={item.symbol} item={item} isGainer={false} />)}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── TokenListItem ────────────────────────────────────────────────────────────
function TokenListItem({ token, index, onPress, onLongPress, isDark, primaryColor }) {
  const C = {
    bg:      isDark ? '#1A1A2E' : '#FFFFFF',
    text:    isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success: '#10B981',
    error:   '#EF4444',
  };
  const isPositive  = (token.price_change_percentage_24h || 0) >= 0;
  const changeColor = isPositive ? C.success : C.error;

  // Sparkline — منحنى بصري بناءً على نسبة التغيير (ليس بيانات حقيقية)
  const sparklinePoints = useMemo(() => {
    const change = token.price_change_percentage_24h || 0;
    return Array.from({ length: 15 }, (_, i) => {
      const progress = i / 14;
      return 100 * (1 + (change / 100) * progress * (0.7 + Math.sin(i * 0.5) * 0.3));
    });
  }, [token.price_change_percentage_24h]);

  const renderSparkline = () => {
    const min   = Math.min(...sparklinePoints);
    const max   = Math.max(...sparklinePoints);
    const range = max - min || 1;
    const pts   = sparklinePoints.map((v, i) => {
      const x = (i / 14) * SPARKLINE_WIDTH;
      const y = SPARKLINE_HEIGHT - ((v - min) / range) * SPARKLINE_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return (
      <Svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT}>
        <Polyline points={pts} fill="none" stroke={changeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  };

  const formatPrice = (price) => {
    if (!price || price === 0) return '$0.00';
    if (price < 0.0001) return `$${price.toExponential(2)}`;
    if (price < 0.01)   return `$${price.toFixed(6)}`;
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };

  return (
    <TouchableOpacity
      style={[S.tokenCard, { backgroundColor: C.bg }]}
      onPress={() => onPress(token)}
      onLongPress={() => onLongPress(token)}
      activeOpacity={0.7}
    >
      <View style={S.tokenLeft}>
        <Text style={[S.tokenRank, { color: C.secondary }]}>{index + 1}</Text>
        <View style={[S.tokenIcon, { backgroundColor: primaryColor + '20' }]}>
          {token.image
            ? <Image source={{ uri: token.image }} style={S.tokenIconImage} />
            : <Text style={[S.tokenIconText, { color: primaryColor }]}>{token.symbol?.charAt(0)}</Text>}
        </View>
        <View style={S.tokenInfo}>
          <Text style={[S.tokenSymbol, { color: C.text }]}>{token.symbol}</Text>
          <Text style={[S.tokenName, { color: C.secondary }]} numberOfLines={1}>{token.name}</Text>
        </View>
      </View>
      <View style={S.tokenCenter}>{renderSparkline()}</View>
      <View style={S.tokenRight}>
        <Text style={[S.tokenPrice, { color: C.text }]}>{formatPrice(token.current_price)}</Text>
        <View style={[S.tokenChangeBadge, { backgroundColor: changeColor + '15' }]}>
          <Ionicons name={isPositive ? 'arrow-up' : 'arrow-down'} size={10} color={changeColor} />
          <Text style={[S.tokenChangeText, { color: changeColor }]}>
            {Math.abs(token.price_change_percentage_24h || 0).toFixed(2)}%
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
export default function MarketScreen() {
  const navigation   = useNavigation();
  const { t }        = useTranslation();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';

  const activeAccount = useAppStore(s => {
    const accounts = s.accounts;
    const idx      = s.activeAccountIndex;
    return accounts.length > 0 ? accounts[idx] : null;
  });

  const [tokens,         setTokens]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [activeTab,      setActiveTab]      = useState('all');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [watchlist,      setWatchlist]      = useState([]);
  const [marketOverview, setMarketOverview] = useState(null);
  const [topMovers,      setTopMovers]      = useState({ gainers: [], losers: [] });
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [portfolioChange,setPortfolioChange]= useState(0);
  const [sortBy,         setSortBy]         = useState('rank');

  // ✅ flag لمنع الاستدعاء المزدوج عند أول mount
  const isInitialMount = useRef(true);

  const C = {
    background: isDark ? '#0A0A0F' : '#F8F9FA',
    card:       isDark ? '#1A1A2E' : '#FFFFFF',
    text:       isDark ? '#FFFFFF' : '#1A1A2E',
    secondary:  isDark ? '#A0A0B0' : '#6B7280',
    border:     isDark ? '#2A2A3E' : '#E5E7EB',
    success:    '#10B981',
    error:      '#EF4444',
  };

  // ── Load watchlist ──────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(WATCHLIST_KEY)
      .then(stored => { if (stored) setWatchlist(JSON.parse(stored)); })
      .catch(() => {});
  }, []);

  // ── Portfolio calculation ───────────────────────────────────────────────────
  // ✅ حساب Portfolio لكل العملات المتاحة وليس SOL+MECO+USDC+USDT فقط
  const calculatePortfolio = async (tokenData, publicKey) => {
    if (!publicKey || !tokenData.length) return;
    try {
      let total = 0;

      for (const token of CORE_TOKENS) {
        const price = tokenData.find(tk => tk.symbol === token.symbol)?.current_price || 0;
        if (price === 0) continue;

        let balance = 0;
        if (token.symbol === 'SOL') {
          balance = await getSolBalance(true, publicKey).catch(() => 0);
        } else {
          balance = await getTokenBalance(token.mint, true, publicKey).catch(() => 0);
        }
        total += (balance || 0) * price;
      }

      setPortfolioValue(total);
    } catch (_) {
      setPortfolioValue(0);
    }
  };

  // ── Fetch all market data ───────────────────────────────────────────────────
  const fetchAllMarketData = useCallback(async () => {
    try {
      const [tokenData, overviewData, moversData] = await Promise.all([
        getJupiterMarketData(),
        getGlobalMarketData(),
        getTopMovers(5),
      ]);

      setTokens(tokenData);
      setMarketOverview(overviewData);
      setTopMovers(moversData);
      setPortfolioChange(overviewData?.marketCapChange24h || 0);

      if (activeAccount?.publicKey) {
        await calculatePortfolio(tokenData, activeAccount.publicKey);
      }
    } catch (err) {
      console.error('Market fetch error:', err);
      // ✅ لا بيانات عشوائية — نعرض الأسعار بصفر بدلاً من Math.random()
      setTokens(CORE_TOKENS.map((tk, i) => ({
        ...tk,
        current_price:               0,
        price_change_percentage_24h: 0,
        rank: i + 1,
      })));
    }
  }, [activeAccount?.publicKey]);

  // ── Initial load + interval ─────────────────────────────────────────────────
  // ✅ useEffect للتحميل الأول والـ interval فقط
  useEffect(() => {
    let isMounted  = true;
    const init = async () => {
      await fetchAllMarketData();
      if (isMounted) setLoading(false);
    };
    init();

    const interval = setInterval(fetchAllMarketData, REFRESH_INTERVAL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeAccount?.publicKey]);

  // ✅ useFocusEffect للتحديث عند العودة للشاشة — يتخطى أول مرة
  useFocusEffect(
    useCallback(() => {
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }
      fetchAllMarketData();
    }, [fetchAllMarketData])
  );

  // ── Refresh ─────────────────────────────────────────────────────────────────
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllMarketData();
    try {
      const stored = await AsyncStorage.getItem(WATCHLIST_KEY);
      if (stored) setWatchlist(JSON.parse(stored));
    } catch (_) {}
    setRefreshing(false);
  };

  // ── Watchlist toggle ────────────────────────────────────────────────────────
  const handleAddToWatchlist = async (token) => {
    try {
      const updated = watchlist.includes(token.symbol)
        ? watchlist.filter(s => s !== token.symbol)
        : [...watchlist, token.symbol];
      setWatchlist(updated);
      await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
    } catch (_) {}
  };

  // ── Filtered + sorted tokens ────────────────────────────────────────────────
  // ✅ إصلاح تعارض اسم t — تغيير parameter إلى tk
  const filteredTokens = useMemo(() => {
    let result = tokens.filter(tk => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!tk.symbol?.toLowerCase().includes(q) && !tk.name?.toLowerCase().includes(q)) return false;
      }
      if (activeTab === 'watchlist') return watchlist.includes(tk.symbol);
      if (activeTab === 'gainers')   return (tk.price_change_percentage_24h || 0) > 0;
      if (activeTab === 'losers')    return (tk.price_change_percentage_24h || 0) < 0;
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === 'price')  return (b.current_price || 0) - (a.current_price || 0);
      if (sortBy === 'change') return (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0);
      return (a.rank || 999) - (b.rank || 999);
    });

    return result;
  }, [tokens, searchQuery, activeTab, watchlist, sortBy]);

  // ✅ Tabs — كلها مترجمة
  const tabs = [
    { id: 'all',       labelKey: 'all_tokens'       },
    { id: 'watchlist', labelKey: 'watchlist'         },
    { id: 'gainers',   labelKey: 'gainers'           },
    { id: 'losers',    labelKey: 'market_losers'     },
  ];

  // ✅ Sort options — كلها مترجمة
  const sortOptions = [
    { id: 'rank',   labelKey: 'rank'   },
    { id: 'price',  labelKey: 'price'  },
    { id: 'change', labelKey: 'change' },
  ];

  const handleCloseSearch = () => { setSearchQuery(''); setIsSearchActive(false); };

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
        <View style={S.loadingCenter}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[S.loadingText, { color: C.secondary }]}>{t('loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>

      {/* Header */}
      <View style={S.header}>
        <View>
          <Text style={[S.headerTitle,    { color: C.text }]}>{t('market_title')}</Text>
          <Text style={[S.headerSubtitle, { color: C.secondary }]}>{t('market_subtitle')}</Text>
        </View>
        <TouchableOpacity
          style={[S.searchButton, { backgroundColor: C.card }]}
          onPress={() => setIsSearchActive(v => !v)}
        >
          <Ionicons name={isSearchActive ? 'close' : 'search'} size={20} color={C.secondary} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      {isSearchActive && (
        <View style={[S.searchBarContainer, { backgroundColor: C.background }]}>
          <View style={[S.searchInputWrapper, { backgroundColor: C.card, borderColor: C.border }]}>
            <Ionicons name="search" size={18} color={C.secondary} style={{ marginLeft: 12 }} />
            <TextInput
              style={[S.searchInput, { color: C.text }]}
              placeholder={t('market_search_placeholder')}
              placeholderTextColor={C.secondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={S.clearBtn}>
                <Ionicons name="close-circle" size={18} color={C.secondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={handleCloseSearch} style={S.cancelBtn}>
            <Text style={{ color: primaryColor, fontWeight: '600' }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={S.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[primaryColor]} tintColor={primaryColor} />}
        showsVerticalScrollIndicator={false}
      >
        {/* إخفاء البطاقات العلوية أثناء البحث */}
        {!isSearchActive && (
          <>
            <MarketOverviewCard data={marketOverview} isDark={isDark} />
            <PortfolioSummaryCard totalValue={portfolioValue} changePercent={portfolioChange} isDark={isDark} />
            <TopMoversSection gainers={topMovers.gainers} losers={topMovers.losers} isDark={isDark} />
          </>
        )}

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.tabsScroll} contentContainerStyle={S.tabsContent}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[S.tab, activeTab === tab.id && { backgroundColor: primaryColor }]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[S.tabText, { color: activeTab === tab.id ? '#FFFFFF' : C.secondary }]}>
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sort */}
        <View style={S.sortContainer}>
          {sortOptions.map(opt => (
            <TouchableOpacity
              key={opt.id}
              style={[S.sortButton, sortBy === opt.id && { backgroundColor: primaryColor + '20' }]}
              onPress={() => setSortBy(opt.id)}
            >
              <Text style={[S.sortButtonText, { color: sortBy === opt.id ? primaryColor : C.secondary }]}>
                {t(opt.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Token list */}
        <View style={S.tokenList}>
          {filteredTokens.length === 0 ? (
            <View style={S.emptyContainer}>
              <Ionicons name="search" size={48} color={C.secondary} />
              <Text style={[S.emptyText, { color: C.secondary }]}>
                {activeTab === 'watchlist' ? t('watchlist_empty') : t('no_results')}
              </Text>
            </View>
          ) : filteredTokens.map((token, index) => (
            <TokenListItem
              key={token.mint || token.id}
              token={token}
              index={index}
              onPress={() => navigation.navigate('TokenDetails', { token })}
              onLongPress={() => handleAddToWatchlist(token)}
              isDark={isDark}
              primaryColor={primaryColor}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const S = StyleSheet.create({
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:   { marginTop: 12, fontSize: 14 },

  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle:    { fontSize: 28, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  searchButton:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

  searchBarContainer:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  searchInputWrapper:  { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, height: 44 },
  searchInput:         { flex: 1, paddingHorizontal: 10, fontSize: 15, height: '100%' },
  clearBtn:            { padding: 10 },
  cancelBtn:           { paddingLeft: 12, paddingVertical: 10 },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

  overviewCard:       { borderRadius: 16, padding: 16, marginBottom: 12 },
  overviewRow:        { flexDirection: 'row', justifyContent: 'space-between' },
  overviewItem:       { flex: 1, alignItems: 'center' },
  overviewBorder:     { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(128,128,128,0.2)' },
  overviewLabel:      { fontSize: 12, marginBottom: 4 },
  overviewValue:      { fontSize: 16, fontWeight: 'bold' },
  marketChangeBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
  marketChangeText:   { fontSize: 14, fontWeight: '600' },

  portfolioCard:       { borderRadius: 16, padding: 16, marginBottom: 12 },
  portfolioHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  portfolioLabel:      { fontSize: 12, marginBottom: 4 },
  portfolioValue:      { fontSize: 24, fontWeight: 'bold' },
  portfolioChange:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
  portfolioChangeText: { fontSize: 14, fontWeight: '600' },

  topMoversContainer: { marginBottom: 12 },
  moverColumn:        {},
  moverHeader:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  moverTitle:         { fontSize: 14, fontWeight: '600' },
  moverRow:           { flexDirection: 'row', gap: 8 },
  moverItem:          { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  moverSymbol:        { fontSize: 12, fontWeight: '600' },
  moverChange:        { fontSize: 11, fontWeight: '600', marginTop: 2 },

  tabsScroll:   { marginBottom: 12 },
  tabsContent:  { paddingRight: 20 },
  tab:          { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: 'rgba(128,128,128,0.1)' },
  tabText:      { fontSize: 14, fontWeight: '600' },

  sortContainer:   { flexDirection: 'row', marginBottom: 12, gap: 8 },
  sortButton:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  sortButtonText:  { fontSize: 12, fontWeight: '500' },

  tokenList:      { gap: 10 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText:      { marginTop: 12, fontSize: 16 },

  tokenCard:        { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14 },
  tokenLeft:        { flexDirection: 'row', alignItems: 'center', flex: 1.2 },
  tokenRank:        { fontSize: 11, width: 20, textAlign: 'center' },
  tokenIcon:        { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  tokenIconImage:   { width: 36, height: 36, borderRadius: 18 },
  tokenIconText:    { fontSize: 14, fontWeight: 'bold' },
  tokenInfo:        { flex: 1 },
  tokenSymbol:      { fontSize: 15, fontWeight: 'bold' },
  tokenName:        { fontSize: 11, marginTop: 1 },
  tokenCenter:      { flex: 0.8, alignItems: 'center', justifyContent: 'center' },
  tokenRight:       { flex: 1, alignItems: 'flex-end' },
  tokenPrice:       { fontSize: 14, fontWeight: 'bold' },
  tokenChangeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginTop: 4, gap: 2 },
  tokenChangeText:  { fontSize: 11, fontWeight: '600' },
});
