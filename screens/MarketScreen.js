// screens/MarketScreen.js
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, RefreshControl, SafeAreaView, ActivityIndicator,
  TextInput, Modal, Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Polyline } from 'react-native-svg';

import {
  getJupiterMarketData, CORE_TOKENS,
  fetchCustomTokenByMint, saveCustomToken, deleteCustomToken, getCustomTokens,
} from '../services/jupiterMarketService';
import { getGlobalMarketData, getTopMovers } from '../services/marketOverviewService';
import { getSolBalance, getTokenBalance } from '../services/heliusService';

const SPARKLINE_WIDTH     = 70;
const SPARKLINE_HEIGHT    = 35;
const WATCHLIST_KEY       = '@meco_watchlist';
const REFRESH_INTERVAL_MS = 30000;

// ─── MarketOverviewCard ───────────────────────────────────────────────────────
function MarketOverviewCard({ data, isDark }) {
  const { t } = useTranslation();
  const C = {
    bg:        isDark ? 'rgba(108,99,255,0.15)' : 'rgba(108,99,255,0.08)',
    text:      isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success:   '#10B981',
    error:     '#EF4444',
  };
  const isPositive = (data?.marketCapChange24h || 0) >= 0;
  return (
    <View style={[S.overviewCard, { backgroundColor: C.bg }]}>
      <View style={S.overviewRow}>
        <View style={S.overviewItem}>
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
    bg:        isDark ? '#1A1A2E' : '#FFFFFF',
    text:      isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success:   '#10B981',
    error:     '#EF4444',
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
    bg:        isDark ? '#1A1A2E' : '#FFFFFF',
    text:      isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    success:   '#10B981',
    error:     '#EF4444',
  };
  const isPositive  = (token.price_change_percentage_24h || 0) >= 0;
  const changeColor = isPositive ? C.success : C.error;

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
          <View style={S.tokenSymbolRow}>
            <Text style={[S.tokenSymbol, { color: C.text }]}>{token.symbol}</Text>
            {/* ✅ شارة للرموز المضافة */}
            {token.isCustom && (
              <View style={[S.customBadge, { backgroundColor: primaryColor + '20' }]}>
                <Text style={[S.customBadgeText, { color: primaryColor }]}>+</Text>
              </View>
            )}
          </View>
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

  const [tokens,          setTokens]          = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [activeTab,       setActiveTab]       = useState('all');
  const [searchQuery,     setSearchQuery]     = useState('');
  const [isSearchActive,  setIsSearchActive]  = useState(false);
  const [watchlist,       setWatchlist]       = useState([]);
  const [marketOverview,  setMarketOverview]  = useState(null);
  const [topMovers,       setTopMovers]       = useState({ gainers: [], losers: [] });
  const [portfolioValue,  setPortfolioValue]  = useState(0);
  const [portfolioChange, setPortfolioChange] = useState(0);
  const [sortBy,          setSortBy]          = useState('rank');

  // ✅ حالة Modal إضافة رمز مخصص
  const [addTokenModal,    setAddTokenModal]    = useState(false);
  const [mintInput,        setMintInput]        = useState('');
  const [fetchingToken,    setFetchingToken]    = useState(false);
  const [previewToken,     setPreviewToken]     = useState(null);
  const [fetchError,       setFetchError]       = useState('');

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

  useEffect(() => {
    AsyncStorage.getItem(WATCHLIST_KEY)
      .then(stored => { if (stored) setWatchlist(JSON.parse(stored)); })
      .catch(() => {});
  }, []);

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
      setTokens(CORE_TOKENS.map((tk, i) => ({
        ...tk,
        current_price:               0,
        price_change_percentage_24h: 0,
        rank: i + 1,
      })));
    }
  }, [activeAccount?.publicKey]);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      await fetchAllMarketData();
      if (isMounted) setLoading(false);
    };
    init();
    const interval = setInterval(fetchAllMarketData, REFRESH_INTERVAL_MS);
    return () => { isMounted = false; clearInterval(interval); };
  }, [activeAccount?.publicKey]);

  useFocusEffect(
    useCallback(() => {
      if (isInitialMount.current) { isInitialMount.current = false; return; }
      fetchAllMarketData();
    }, [fetchAllMarketData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllMarketData();
    try {
      const stored = await AsyncStorage.getItem(WATCHLIST_KEY);
      if (stored) setWatchlist(JSON.parse(stored));
    } catch (_) {}
    setRefreshing(false);
  };

  const handleAddToWatchlist = async (token) => {
    try {
      const updated = watchlist.includes(token.symbol)
        ? watchlist.filter(s => s !== token.symbol)
        : [...watchlist, token.symbol];
      setWatchlist(updated);
      await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
    } catch (_) {}
  };

  // ── ✅ جلب بيانات الرمز المخصص ───────────────────────────────────────────────
  const handleFetchCustomToken = async () => {
    if (!mintInput.trim()) return;
    setFetchingToken(true);
    setFetchError('');
    setPreviewToken(null);
    try {
      const tokenData = await fetchCustomTokenByMint(mintInput.trim());
      setPreviewToken(tokenData);
    } catch (err) {
      // استخدام مفاتيح الخطأ
      const message = err.message?.includes('not found') ? t('token_not_found')
                    : err.message?.includes('Invalid')    ? t('invalid_contract_address')
                    : t('error');
      setFetchError(message);
    } finally {
      setFetchingToken(false);
    }
  };

  // ── ✅ حفظ الرمز المخصص ──────────────────────────────────────────────────────
  const handleSaveCustomToken = async () => {
    if (!previewToken) return;
    try {
      await saveCustomToken(previewToken);
      setAddTokenModal(false);
      setMintInput('');
      setPreviewToken(null);
      setFetchError('');
      await fetchAllMarketData(); // تحديث القائمة فوراً
      Alert.alert(t('success'), t('token_added_success', { symbol: previewToken.symbol }));
    } catch (err) {
      const message = err.message?.includes('already exists') ? t('token_already_exists') : t('error');
      setFetchError(message);
    }
  };

  // ── ✅ حذف رمز مخصص ──────────────────────────────────────────────────────────
  const handleDeleteCustomToken = (token) => {
    Alert.alert(
      t('delete'),
      t('delete_token_confirm', { symbol: token.symbol }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteCustomToken(token.mint);
            await fetchAllMarketData();
          },
        },
      ]
    );
  };

  const handleCloseAddModal = () => {
    setAddTokenModal(false);
    setMintInput('');
    setPreviewToken(null);
    setFetchError('');
  };

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

  const tabs = [
    { id: 'all',       labelKey: 'all_tokens'   },
    { id: 'watchlist', labelKey: 'watchlist'     },
    { id: 'gainers',   labelKey: 'gainers'       },
    { id: 'losers',    labelKey: 'market_losers' },
  ];

  const sortOptions = [
    { id: 'rank',   labelKey: 'rank'   },
    { id: 'price',  labelKey: 'price'  },
    { id: 'change', labelKey: 'change' },
  ];

  const handleCloseSearch = () => { setSearchQuery(''); setIsSearchActive(false); };

  const formatPrice = (price) => {
    if (!price || price === 0) return '$0.00';
    if (price < 0.0001) return `$${price.toExponential(2)}`;
    if (price < 0.01)   return `$${price.toFixed(6)}`;
    return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };

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

      {/* ✅ Search bar مع زر + */}
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
            {/* ✅ زر + لإضافة رمز مخصص */}
            <TouchableOpacity
              onPress={() => setAddTokenModal(true)}
              style={[S.addTokenBtn, { backgroundColor: primaryColor }]}
            >
              <Ionicons name="add" size={20} color="#FFF" />
            </TouchableOpacity>
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
        {!isSearchActive && (
          <>
            <MarketOverviewCard data={marketOverview} isDark={isDark} />
            <PortfolioSummaryCard totalValue={portfolioValue} changePercent={portfolioChange} isDark={isDark} />
            <TopMoversSection gainers={topMovers.gainers} losers={topMovers.losers} isDark={isDark} />
          </>
        )}

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
              onPress={(tk) => {
                navigation.navigate('TokenDetails', { token: tk });
              }}
              onLongPress={(tk) => {
                if (tk.isCustom) {
                  handleDeleteCustomToken(tk);
                } else {
                  handleAddToWatchlist(tk);
                }
              }}
              isDark={isDark}
              primaryColor={primaryColor}
            />
          ))}
        </View>
      </ScrollView>

      {/* ✅ Modal إضافة رمز مخصص */}
      <Modal
        visible={addTokenModal}
        transparent
        animationType="slide"
        onRequestClose={handleCloseAddModal}
      >
        <View style={S.modalOverlay}>
          <View style={[S.modalContent, { backgroundColor: C.card }]}>
            <View style={S.modalHandle} />

            <View style={S.modalHeader}>
              <Text style={[S.modalTitle, { color: C.text }]}>{t('add_custom_token')}</Text>
              <TouchableOpacity onPress={handleCloseAddModal} style={[S.modalCloseBtn, { backgroundColor: C.background }]}>
                <Ionicons name="close" size={20} color={C.secondary} />
              </TouchableOpacity>
            </View>

            {/* حقل إدخال عنوان العقد */}
            <Text style={[S.modalLabel, { color: C.secondary }]}>{t('custom_token_address')}</Text>
            <View style={[S.modalInputWrapper, { backgroundColor: C.background, borderColor: C.border }]}>
              <TextInput
                style={[S.modalInput, { color: C.text }]}
                placeholder={t('custom_token_placeholder')}
                placeholderTextColor={C.secondary}
                value={mintInput}
                onChangeText={(text) => {
                  setMintInput(text);
                  setPreviewToken(null);
                  setFetchError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* رسالة خطأ */}
            {fetchError ? (
              <Text style={[S.fetchError, { color: C.error }]}>{fetchError}</Text>
            ) : null}

            {/* زر البحث */}
            {!previewToken && (
              <TouchableOpacity
                style={[S.fetchBtn, { backgroundColor: primaryColor, opacity: fetchingToken || !mintInput.trim() ? 0.6 : 1 }]}
                onPress={handleFetchCustomToken}
                disabled={fetchingToken || !mintInput.trim()}
              >
                {fetchingToken
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <>
                      <Ionicons name="search" size={18} color="#FFF" />
                      <Text style={S.fetchBtnText}>{t('fetch_token_data')}</Text>
                    </>
                }
              </TouchableOpacity>
            )}

            {/* ✅ معاينة الرمز */}
            {previewToken && (
              <View style={[S.previewCard, { backgroundColor: C.background, borderColor: C.border }]}>
                <View style={S.previewHeader}>
                  <View style={[S.previewIcon, { backgroundColor: primaryColor + '20' }]}>
                    {previewToken.image
                      ? <Image source={{ uri: previewToken.image }} style={S.previewIconImage} />
                      : <Text style={[S.previewIconText, { color: primaryColor }]}>{previewToken.symbol?.charAt(0)}</Text>
                    }
                  </View>
                  <View style={S.previewInfo}>
                    <Text style={[S.previewSymbol, { color: C.text }]}>{previewToken.symbol}</Text>
                    <Text style={[S.previewName,   { color: C.secondary }]}>{previewToken.name}</Text>
                  </View>
                  <View style={S.previewPriceCol}>
                    <Text style={[S.previewPrice, { color: C.text }]}>{formatPrice(previewToken.current_price)}</Text>
                    <Text style={[S.previewChange, {
                      color: (previewToken.price_change_percentage_24h || 0) >= 0 ? C.success : C.error
                    }]}>
                      {(previewToken.price_change_percentage_24h || 0) >= 0 ? '+' : ''}
                      {(previewToken.price_change_percentage_24h || 0).toFixed(2)}%
                    </Text>
                  </View>
                </View>

                {/* أزرار إضافة / إعادة البحث */}
                <View style={S.previewActions}>
                  <TouchableOpacity
                    style={[S.previewCancelBtn, { borderColor: C.border }]}
                    onPress={() => { setPreviewToken(null); setMintInput(''); }}
                  >
                    <Text style={{ color: C.secondary, fontWeight: '600' }}>{t('research')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.previewAddBtn, { backgroundColor: primaryColor }]}
                    onPress={handleSaveCustomToken}
                  >
                    <Ionicons name="add-circle" size={18} color="#FFF" />
                    <Text style={S.previewAddText}>{t('add_custom_token')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
const S = StyleSheet.create({
  loadingCenter:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText:    { marginTop: 12, fontSize: 14 },

  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle:    { fontSize: 28, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  searchButton:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

  searchBarContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, height: 44 },
  searchInput:        { flex: 1, paddingHorizontal: 10, fontSize: 15, height: '100%' },
  clearBtn:           { padding: 10 },
  cancelBtn:          { paddingLeft: 12, paddingVertical: 10 },
  // ✅ زر +
  addTokenBtn:        { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 4 },

  scrollContent:  { paddingHorizontal: 20, paddingBottom: 100 },

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

  sortContainer:  { flexDirection: 'row', marginBottom: 12, gap: 8 },
  sortButton:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  sortButtonText: { fontSize: 12, fontWeight: '500' },

  tokenList:      { gap: 10 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText:      { marginTop: 12, fontSize: 16 },

  tokenCard:         { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14 },
  tokenLeft:         { flexDirection: 'row', alignItems: 'center', flex: 1.2 },
  tokenRank:         { fontSize: 11, width: 20, textAlign: 'center' },
  tokenIcon:         { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  tokenIconImage:    { width: 36, height: 36, borderRadius: 18 },
  tokenIconText:     { fontSize: 14, fontWeight: 'bold' },
  tokenInfo:         { flex: 1 },
  tokenSymbolRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenSymbol:       { fontSize: 15, fontWeight: 'bold' },
  tokenName:         { fontSize: 11, marginTop: 1 },
  customBadge:       { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  customBadgeText:   { fontSize: 10, fontWeight: '800' },
  tokenCenter:       { flex: 0.8, alignItems: 'center', justifyContent: 'center' },
  tokenRight:        { flex: 1, alignItems: 'flex-end' },
  tokenPrice:        { fontSize: 14, fontWeight: 'bold' },
  tokenChangeBadge:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginTop: 4, gap: 2 },
  tokenChangeText:   { fontSize: 11, fontWeight: '600' },

  // ✅ Modal styles
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:    { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 12 },
  modalHandle:     { width: 40, height: 4, backgroundColor: '#E5E5EA', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:      { fontSize: 20, fontWeight: '800' },
  modalCloseBtn:   { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalLabel:      { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  modalInputWrapper:{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 50, marginBottom: 12 },
  modalInput:      { flex: 1, fontSize: 14 },
  fetchError:      { fontSize: 13, marginBottom: 12, textAlign: 'center' },
  fetchBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14, gap: 8, marginBottom: 16 },
  fetchBtnText:    { color: '#FFF', fontSize: 16, fontWeight: '700' },

  previewCard:     { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  previewHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  previewIcon:     { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  previewIconImage:{ width: 48, height: 48, borderRadius: 24 },
  previewIconText: { fontSize: 20, fontWeight: 'bold' },
  previewInfo:     { flex: 1 },
  previewSymbol:   { fontSize: 18, fontWeight: '800' },
  previewName:     { fontSize: 13, marginTop: 2 },
  previewPriceCol: { alignItems: 'flex-end' },
  previewPrice:    { fontSize: 16, fontWeight: '700' },
  previewChange:   { fontSize: 13, fontWeight: '600', marginTop: 2 },
  previewActions:  { flexDirection: 'row', gap: 12 },
  previewCancelBtn:{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  previewAddBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, gap: 8 },
  previewAddText:  { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
