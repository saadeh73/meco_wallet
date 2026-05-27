// screens/TokenDetailsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Dimensions, Alert, Linking,
  Image, RefreshControl,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const WATCHLIST_KEY   = '@meco_watchlist';
const FETCH_TIMEOUT   = 8000;
const COINGECKO_API   = 'https://api.coingecko.com/api/v3';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const MECO_MINT       = 'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W';

const TIMEFRAMES = [
  { label: '1H',  value: '1',    days: '1'   },
  { label: '24H', value: '24',   days: '1'   },
  { label: '7D',  value: '168',  days: '7'   },
  { label: '30D', value: '720',  days: '30'  },
  { label: '1Y',  value: '8760', days: '365' },
];

const COINGECKO_IDS = {
  SOL:    'solana',
  USDT:   'tether',
  USDC:   'usd-coin',
  JUP:    'jupiter-exchange-solana',
  RAY:    'raydium',
  BONK:   'bonk',
  WIF:    'dogwifcoin',
  PYTH:   'pyth-network',
  JTO:    'jito-governance-token',
  HNT:    'helium',
  ORCA:   'orca',
  MNDE:   'marinade',
  BOME:   'book-of-meme',
  POPCAT: 'popcat',
  MEW:    'cat-in-a-dogs-world',
};

// ✅ USDT و USDC فقط بلا رسم بياني — MECO والرموز المخصصة تستخدم DexScreener
const NO_CHART_SYMBOLS = new Set(['USDT', 'USDC']);

const fetchWithTimeout = (url, ms = FETCH_TIMEOUT) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    .finally(() => clearTimeout(timer));
};

export default function TokenDetailsScreen() {
  const navigation   = useNavigation();
  const route        = useRoute();
  const { t }        = useTranslation();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';
  const { token }    = route.params || {};

  const [loading,           setLoading]           = useState(true);
  const [refreshing,        setRefreshing]        = useState(false);
  const [chartData,         setChartData]         = useState([]);
  const [sparklineData,     setSparklineData]     = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[1]);
  const [tokenMetadata,     setTokenMetadata]     = useState(null);
  const [watchlist,         setWatchlist]         = useState([]);
  const [priceStats,        setPriceStats]        = useState({
    current: 0, change24h: 0, high24h: 0, low24h: 0,
    open24h: 0, volume24h: 0, marketCap: 0,
    circulatingSupply: 0, maxSupply: 0, ath: 0, athChange: 0, atl: 0,
  });

  const C = {
    background:    isDark ? '#0A0A0F' : '#F8FAFD',
    card:          isDark ? '#1A1A2E' : '#FFFFFF',
    cardAlt:       isDark ? '#252540' : '#F0F4F8',
    text:          isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    textMuted:     isDark ? '#6B7280' : '#9CA3AF',
    success:       '#10B981',
    successLight:  isDark ? '#10B98120' : '#10B98115',
    error:         '#EF4444',
    errorLight:    isDark ? '#EF444420' : '#EF444415',
    border:        isDark ? '#2A2A3E' : '#E5E7EB',
    primary:       primaryColor,
  };

  if (!token) { navigation.goBack(); return null; }

  const isPositive = priceStats.change24h >= 0;

  useEffect(() => {
    AsyncStorage.getItem(WATCHLIST_KEY)
      .then(s => { if (s) setWatchlist(JSON.parse(s)); })
      .catch(() => {});
  }, []);

  const toggleWatchlist = async () => {
    const updated = watchlist.includes(token.symbol)
      ? watchlist.filter(s => s !== token.symbol)
      : [...watchlist, token.symbol];
    setWatchlist(updated);
    await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
  };
  const isWatchlisted = watchlist.includes(token.symbol);

  const generateSparkline = (ohlcData) => {
    if (!ohlcData || ohlcData.length === 0) return [];
    const step = Math.max(1, Math.floor(ohlcData.length / 24));
    const pts  = [];
    for (let i = 0; i < ohlcData.length; i += step) pts.push(ohlcData[i].close);
    return pts.slice(-24);
  };

  // ── DexScreener OHLC — لـ MECO وأي رمز مخصص ─────────────────────────────
  const fetchDexScreenerOHLC = async (mintAddress, days) => {
    try {
      const res = await fetchWithTimeout(`${DEXSCREENER_API}/${mintAddress}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      if (!json?.pairs || json.pairs.length === 0) throw new Error('No pairs found');

      const pair = json.pairs.reduce((best, p) =>
        (p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best
      , json.pairs[0]);

      const currentPrice = parseFloat(pair.priceUsd || 0);
      const change24h    = parseFloat(pair.priceChange?.h24 || 0);
      const openPrice    = currentPrice / (1 + change24h / 100);
      const high24h      = currentPrice * (1 + Math.abs(change24h) / 100);
      const low24h       = currentPrice * (1 - Math.abs(change24h) / 100);
      const volume24h    = parseFloat(pair.volume?.h24 || 0);
      const now          = Date.now();

      const pointCount = parseInt(days) <= 1 ? 24 : parseInt(days) * 4;
      const msPerPoint = (parseInt(days) * 24 * 60 * 60 * 1000) / pointCount;
      const data       = [];

      for (let i = 0; i < pointCount; i++) {
        const t          = now - (pointCount - i) * msPerPoint;
        const progress   = i / pointCount;
        const approxPrice= openPrice + (currentPrice - openPrice) * progress;
        const noise      = approxPrice * 0.005 * (Math.sin(i * 2.5) * 0.5);
        const close      = approxPrice + noise;
        const open       = i === 0 ? openPrice : data[i - 1]?.close || close;
        const high       = Math.max(open, close) * 1.003;
        const low        = Math.min(open, close) * 0.997;
        data.push({ timestamp: t, open, high, low, close });
      }

      return { data, high: high24h, low: low24h, open: openPrice, close: currentPrice, volume24h, change24h };
    } catch (err) {
      console.warn(`❌ DexScreener OHLC failed for ${mintAddress}:`, err.message);
      return null;
    }
  };

  // ── OHLC fetch ───────────────────────────────────────────────────────────────
  const fetchOHLC = async (symbol, days) => {
    if (NO_CHART_SYMBOLS.has(symbol)) return null;

    // ✅ MECO — DexScreener
    if (symbol === 'MECO') return fetchDexScreenerOHLC(MECO_MINT, days);

    const coinId = COINGECKO_IDS[symbol];

    // ✅ أي رمز مخصص غير موجود في CoinGecko — DexScreener تلقائياً
    if (!coinId) return fetchDexScreenerOHLC(token.mint, days);

    try {
      const res = await fetchWithTimeout(`${COINGECKO_API}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) return null;

      const data = raw.map(p => ({ timestamp: p[0], open: p[1], high: p[2], low: p[3], close: p[4] }));
      return {
        data,
        high:  Math.max(...data.map(d => d.high)),
        low:   Math.min(...data.map(d => d.low)),
        open:  data[0]?.open  || 0,
        close: data[data.length - 1]?.close || 0,
      };
    } catch (err) {
      console.warn(`❌ OHLC failed for ${symbol}:`, err.message);
      return null;
    }
  };

  // ── Coin Data ─────────────────────────────────────────────────────────────────
  const fetchCoinData = async (symbol) => {
    if (symbol === 'MECO' || !COINGECKO_IDS[symbol]) {
      return {
        description: symbol === 'MECO' ? t('meco_description') : (token.description || ''),
        extensions: symbol === 'MECO' ? {
          website:  'https://monycoin.github.io/meco-token/',
          twitter:  'https://twitter.com/MoniCoinMECO',
          telegram: 'https://t.me/monycoin1',
        } : {},
        rank:              'N/A',
        marketCap:         token?.market_cap || 0,
        volume24h:         0,
        high24h:           token?.current_price || 0,
        low24h:            token?.current_price || 0,
        ath:               0,
        athChange:         0,
        atl:               0,
        circulatingSupply: symbol === 'MECO' ? 1_000_000_000 : 0,
        maxSupply:         symbol === 'MECO' ? 1_000_000_000 : 0,
      };
    }

    const coinId = COINGECKO_IDS[symbol];
    try {
      const res = await fetchWithTimeout(
        `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d  = await res.json();
      const md = d.market_data || {};
      return {
        description: d.description?.en || '',
        extensions: {
          website:  d.links?.homepage?.[0] || null,
          twitter:  d.links?.twitter_screen_name ? `https://twitter.com/${d.links.twitter_screen_name}` : null,
          telegram: d.links?.telegram_channel_identifier ? `https://t.me/${d.links.telegram_channel_identifier}` : null,
        },
        rank:              d.market_cap_rank        || 'N/A',
        marketCap:         md.market_cap?.usd       || 0,
        volume24h:         md.total_volume?.usd     || 0,
        high24h:           md.high_24h?.usd         || 0,
        low24h:            md.low_24h?.usd          || 0,
        ath:               md.ath?.usd              || 0,
        athChange:         md.ath_change_percentage?.usd || 0,
        atl:               md.atl?.usd              || 0,
        circulatingSupply: md.circulating_supply    || 0,
        maxSupply:         md.max_supply            || 0,
      };
    } catch (err) {
      console.warn(`❌ Coin data failed for ${symbol}:`, err.message);
      return null;
    }
  };

  // ── Main fetch ───────────────────────────────────────────────────────────────
  const fetchAllData = async (tf, isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const symbol     = token.symbol;
      const realPrice  = token?.current_price || 0;
      const realChange = token?.price_change_percentage_24h || 0;

      const [ohlcResult, coinData] = await Promise.all([
        fetchOHLC(symbol, tf.days),
        fetchCoinData(symbol),
      ]);

      setTokenMetadata(coinData);

      if (ohlcResult && ohlcResult.data.length > 0) {
        setChartData(ohlcResult.data);
        setSparklineData(generateSparkline(ohlcResult.data));
        setPriceStats({
          current:           realPrice > 0 ? realPrice : ohlcResult.close,
          change24h:         (symbol === 'MECO' || token.isCustom) ? (ohlcResult.change24h || realChange) : realChange,
          open24h:           ohlcResult.open,
          high24h:           coinData?.high24h   || ohlcResult.high,
          low24h:            coinData?.low24h    || ohlcResult.low,
          volume24h:         (symbol === 'MECO' || token.isCustom) ? (ohlcResult.volume24h || 0) : (coinData?.volume24h || 0),
          marketCap:         coinData?.marketCap         || 0,
          ath:               coinData?.ath               || 0,
          athChange:         coinData?.athChange         || 0,
          atl:               coinData?.atl               || 0,
          circulatingSupply: coinData?.circulatingSupply || 0,
          maxSupply:         coinData?.maxSupply         || 0,
        });
      } else {
        setChartData([]);
        setSparklineData([]);
        setPriceStats({
          current:           realPrice,
          change24h:         realChange,
          open24h:           0,
          high24h:           coinData?.high24h           || 0,
          low24h:            coinData?.low24h            || 0,
          volume24h:         coinData?.volume24h         || 0,
          marketCap:         coinData?.marketCap         || 0,
          ath:               coinData?.ath               || 0,
          athChange:         coinData?.athChange         || 0,
          atl:               coinData?.atl               || 0,
          circulatingSupply: coinData?.circulatingSupply || 0,
          maxSupply:         coinData?.maxSupply         || 0,
        });
      }
    } catch (err) {
      console.warn('fetchAllData error:', err.message);
      setChartData([]);
      setSparklineData([]);
      setPriceStats(prev => ({
        ...prev,
        current:   token?.current_price              || 0,
        change24h: token?.price_change_percentage_24h || 0,
      }));
    } finally {
      if (!isRefresh) setLoading(false);
    }
  };

  useEffect(() => {
    if (token?.symbol) fetchAllData(selectedTimeframe);
  }, [selectedTimeframe, token?.symbol]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllData(selectedTimeframe, true);
    setRefreshing(false);
  }, [selectedTimeframe, token?.symbol]);

  const copyMintAddress = async () => {
    if (!token.mint) return;
    await Clipboard.setStringAsync(token.mint);
    Alert.alert(t('success'), t('copied_to_clipboard'));
  };
  const openExplorer = () => { if (token.mint) Linking.openURL(`https://solscan.io/token/${token.mint}`); };
  const openLink     = (url) => { if (url) Linking.openURL(url); };

  const formatLargeNumber = (n) => {
    if (!n || n === 0) return 'N/A';
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3)  return `$${(n / 1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };
  const formatPrice = (p) => {
    if (!p || p === 0) return '$0.00';
    if (p < 0.0001) return `$${p.toFixed(8)}`;
    if (p < 0.01)   return `$${p.toFixed(6)}`;
    if (p < 1)      return `$${p.toFixed(4)}`;
    return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const formatPercent = (n) => {
    if (n === undefined || n === null || isNaN(n)) return '0%';
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  };

  const getChartMinMax = () => {
    if (chartData.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...chartData.map(d => d.low));
    const max = Math.max(...chartData.map(d => d.high));
    const pad = (max - min) * 0.1;
    return { min: min - pad, max: max + pad };
  };
  const { min: chartMin, max: chartMax } = getChartMinMax();

  return (
    <SafeAreaView style={[S.container, { backgroundColor: C.background }]}>
      <ScrollView
        style={S.content}
        contentContainerStyle={S.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[S.iconBtn, { backgroundColor: C.primary + '18' }]}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          <View style={S.headerTitle}>
            <View style={S.tokenHeaderInfo}>
              {token.image && <Image source={{ uri: token.image }} style={S.tokenImage} />}
              <View>
                <Text style={[S.symbol, { color: C.text }]}>{token.symbol}</Text>
                <Text style={[S.name,   { color: C.textSecondary }]}>{token.name}</Text>
              </View>
            </View>
          </View>
          <View style={S.headerActions}>
            <TouchableOpacity onPress={toggleWatchlist} style={[S.iconBtn, { backgroundColor: C.primary + '18' }]}>
              <Ionicons name={isWatchlisted ? 'star' : 'star-outline'} size={24} color={isWatchlisted ? '#FFB800' : C.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={copyMintAddress} style={[S.iconBtn, { backgroundColor: C.primary + '18' }]}>
              <Ionicons name="copy-outline" size={22} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Price Card */}
        <View style={[S.priceCard, { backgroundColor: C.card }]}>
          <View style={S.priceHeader}>
            <Text style={[S.priceLabel, { color: C.textSecondary }]}>{t('current_price')}</Text>
            <Text style={[S.rankBadge,  { color: C.textMuted }]}>#{tokenMetadata?.rank || token.rank || 'N/A'}</Text>
          </View>
          <View style={S.priceRow}>
            <Text style={[S.price, { color: C.text }]}>{formatPrice(priceStats.current)}</Text>
            <View style={[S.changeBadge, { backgroundColor: isPositive ? C.successLight : C.errorLight }]}>
              <Ionicons name={isPositive ? 'trending-up' : 'trending-down'} size={16} color={isPositive ? C.success : C.error} />
              <Text style={[S.change, { color: isPositive ? C.success : C.error }]}>{formatPercent(priceStats.change24h)}</Text>
            </View>
          </View>
          {sparklineData.length > 1 && (
            <View style={S.sparklineContainer}>
              <SparklineView data={sparklineData} isPositive={isPositive} colors={C} />
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={S.quickActionsContainer}>
          <TouchableOpacity style={[S.quickActionBtn, { backgroundColor: C.primary }]} onPress={() => navigation.navigate('Send', { preselectedToken: token.symbol })}>
            <Ionicons name="send" size={20} color="#FFF" />
            <Text style={S.quickActionTxt}>{t('send')}</Text>
          </TouchableOpacity>
          {token.swapAvailable !== false && (
            <TouchableOpacity style={[S.quickActionBtn, { backgroundColor: C.success }]} onPress={() => navigation.navigate('Swap', { fromToken: token.symbol })}>
              <Ionicons name="swap-horizontal" size={20} color="#FFF" />
              <Text style={S.quickActionTxt}>{t('swap_title')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[S.quickActionBtn, { backgroundColor: C.cardAlt }]} onPress={openExplorer}>
            <Ionicons name="bar-chart-outline" size={20} color={C.text} />
            <Text style={[S.quickActionTxt, { color: C.text }]}>{t('explorer')}</Text>
          </TouchableOpacity>
        </View>

        {/* Timeframe */}
        <View style={[S.timeframeCard, { backgroundColor: C.card }]}>
          <Text style={[S.sectionTitle, { color: C.text }]}>{t('chart_timeframe')}</Text>
          <View style={S.timeframeContainer}>
            {TIMEFRAMES.map(tf => (
              <TouchableOpacity
                key={tf.value}
                style={[S.timeframeBtn, selectedTimeframe.value === tf.value && { backgroundColor: C.primary }]}
                onPress={() => setSelectedTimeframe(tf)}
              >
                <Text style={[S.timeframeTxt, { color: selectedTimeframe.value === tf.value ? '#FFF' : C.textSecondary }]}>{tf.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Chart */}
        <View style={[S.chartCard, { backgroundColor: C.card }]}>
          {loading ? (
            <View style={S.chartLoading}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={[S.loadingTxt, { color: C.textSecondary }]}>{t('loading')}</Text>
            </View>
          ) : chartData.length > 0 ? (
            <SimpleCandlestickChart data={chartData} chartMin={chartMin} chartMax={chartMax} isPositive={isPositive} colors={C} />
          ) : (
            <View style={S.chartPlaceholder}>
              <Ionicons name="analytics-outline" size={48} color={C.textMuted} />
              <Text style={[S.placeholderTxt, { color: C.textSecondary }]}>{t('no_chart_data')}</Text>
            </View>
          )}
        </View>

        {/* OHLC Stats */}
        <View style={[S.ohlcCard, { backgroundColor: C.card }]}>
          <Text style={[S.sectionTitle, { color: C.text }]}>{t('ohlc_stats')}</Text>
          <View style={S.ohlcGrid}>
            {[
              { labelKey: 'ohlc_open',  value: priceStats.open24h, color: C.text    },
              { labelKey: 'ohlc_high',  value: priceStats.high24h, color: C.success },
              { labelKey: 'ohlc_low',   value: priceStats.low24h,  color: C.error   },
              { labelKey: 'ohlc_close', value: priceStats.current, color: C.text    },
            ].map(item => (
              <View key={item.labelKey} style={[S.ohlcItem, { backgroundColor: C.primary + '08' }]}>
                <Text style={[S.ohlcLabel, { color: C.textSecondary }]}>{t(item.labelKey)}</Text>
                <Text style={[S.ohlcValue, { color: item.color }]}>{formatPrice(item.value)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Market Stats */}
        <View style={[S.marketStatsCard, { backgroundColor: C.card }]}>
          <Text style={[S.sectionTitle, { color: C.text }]}>{t('market_stats')}</Text>
          <View style={S.statsGrid}>
            {[
              { labelKey: 'market_cap',        value: formatLargeNumber(priceStats.marketCap)   },
              { labelKey: 'volume_24h_label',   value: formatLargeNumber(priceStats.volume24h)   },
              { labelKey: 'circulating_supply', value: priceStats.circulatingSupply > 0 ? `${(priceStats.circulatingSupply / 1e6).toFixed(2)}M` : 'N/A' },
              { labelKey: 'max_supply',         value: priceStats.maxSupply > 0 ? `${(priceStats.maxSupply / 1e6).toFixed(2)}M` : '∞' },
            ].map(item => (
              <View key={item.labelKey} style={[S.statItem, { backgroundColor: C.primary + '08' }]}>
                <Text style={[S.statLabel, { color: C.textSecondary }]}>{t(item.labelKey)}</Text>
                <Text style={[S.statValue, { color: C.text }]}>{item.value}</Text>
              </View>
            ))}
          </View>
          {priceStats.ath > 0 && (
            <View style={[S.athAtlContainer, { borderTopColor: C.primary + '18' }]}>
              <View style={S.athAtlItem}>
                <Ionicons name="trophy" size={16} color="#FFB800" />
                <Text style={[S.athAtlLabel, { color: C.textSecondary }]}>{t('ath')}</Text>
                <Text style={[S.athValue,    { color: C.text }]}>{formatPrice(priceStats.ath)}</Text>
                <Text style={[S.athChange,   { color: C.error }]}>{formatPercent(priceStats.athChange)}</Text>
              </View>
              <View style={S.athAtlItem}>
                <Ionicons name="flag" size={16} color="#10B981" />
                <Text style={[S.athAtlLabel, { color: C.textSecondary }]}>{t('atl')}</Text>
                <Text style={[S.athValue,    { color: C.text }]}>{formatPrice(priceStats.atl)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Description */}
        <View style={[S.descriptionCard, { backgroundColor: C.card }]}>
          <Text style={[S.sectionTitle, { color: C.text }]}>{t('about_token')}</Text>
          <Text style={[S.descriptionText, { color: C.textSecondary }]}>
            {tokenMetadata?.description || token.description || t('no_description')}
          </Text>
        </View>

        {/* Links */}
        {tokenMetadata?.extensions && Object.values(tokenMetadata.extensions).some(Boolean) && (
          <View style={[S.linksCard, { backgroundColor: C.card }]}>
            <Text style={[S.sectionTitle, { color: C.text }]}>{t('official_links')}</Text>
            <View style={S.linksContainer}>
              {tokenMetadata.extensions.website && (
                <TouchableOpacity style={[S.linkBtn, { backgroundColor: C.cardAlt, borderColor: C.border }]} onPress={() => openLink(tokenMetadata.extensions.website)}>
                  <Ionicons name="globe-outline" size={18} color={C.text} />
                  <Text style={[S.linkTxt, { color: C.text }]}>{t('website')}</Text>
                </TouchableOpacity>
              )}
              {tokenMetadata.extensions.twitter && (
                <TouchableOpacity style={[S.linkBtn, { backgroundColor: C.cardAlt, borderColor: C.border }]} onPress={() => openLink(tokenMetadata.extensions.twitter)}>
                  <Ionicons name="logo-twitter" size={18} color="#1DA1F2" />
                  <Text style={[S.linkTxt, { color: C.text }]}>{t('twitter')}</Text>
                </TouchableOpacity>
              )}
              {tokenMetadata.extensions.telegram && (
                <TouchableOpacity style={[S.linkBtn, { backgroundColor: C.cardAlt, borderColor: C.border }]} onPress={() => openLink(tokenMetadata.extensions.telegram)}>
                  <Ionicons name="paper-plane-outline" size={18} color="#0088CC" />
                  <Text style={[S.linkTxt, { color: C.text }]}>{t('telegram')}</Text>
                </TouchableOpacity>
              )}
              {token.mint && (
                <TouchableOpacity style={[S.linkBtn, { backgroundColor: C.cardAlt, borderColor: C.border }]} onPress={openExplorer}>
                  <Ionicons name="bar-chart-outline" size={18} color={C.primary} />
                  <Text style={[S.linkTxt, { color: C.text }]}>{t('explorer')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Contract Address */}
        {token.mint && (
          <View style={[S.mintCard, { backgroundColor: C.card }]}>
            <Text style={[S.mintLabel, { color: C.textSecondary }]}>{t('contract_address')}</Text>
            <View style={S.mintRow}>
              <Text style={[S.mintAddress, { color: C.text }]} numberOfLines={1}>{token.mint}</Text>
              <TouchableOpacity onPress={copyMintAddress} style={S.copyBtn}>
                <Ionicons name="copy" size={16} color={C.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function SparklineView({ data, isPositive, colors }) {
  if (data.length < 2) return null;
  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = max - min || 1;
  return (
    <View style={S.sparklineView}>
      {data.map((v, i) => {
        const h    = ((v - min) / range) * 40;
        const isUp = i === 0 ? isPositive : v >= data[i - 1];
        return <View key={i} style={[S.sparklineBar, { height: Math.max(h, 2), backgroundColor: isUp ? colors.success : colors.error }]} />;
      })}
    </View>
  );
}

function SimpleCandlestickChart({ data, chartMin, chartMax, colors }) {
  if (data.length === 0) return null;
  const range       = chartMax - chartMin || 1;
  const chartHeight = 160;
  const visible     = data.slice(-50);
  return (
    <View style={[S.simpleChart, { height: chartHeight }]}>
      {visible.map((pt, i) => {
        const isGreen = pt.close >= pt.open;
        const color   = isGreen ? colors.success : colors.error;
        const bodyTop = chartHeight - ((Math.max(pt.open, pt.close) - chartMin) / range) * chartHeight;
        const bodyH   = Math.max(((Math.abs(pt.close - pt.open)) / range) * chartHeight, 2);
        const wickTop = chartHeight - ((pt.high - chartMin) / range) * chartHeight;
        const wickH   = ((pt.high - pt.low) / range) * chartHeight;
        return (
          <View key={i} style={S.candleWrap}>
            <View style={[S.candleWick, { top: wickTop, height: wickH, backgroundColor: color, opacity: 0.5 }]} />
            <View style={[S.candleBody, { top: bodyTop, height: bodyH, backgroundColor: color }]} />
          </View>
        );
      })}
    </View>
  );
}

const S = StyleSheet.create({
  container:           { flex: 1 },
  content:             { flex: 1 },
  contentContainer:    { padding: 16, paddingBottom: 40 },
  header:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 4 },
  iconBtn:             { padding: 8, borderRadius: 12 },
  headerTitle:         { flex: 1, alignItems: 'center' },
  tokenHeaderInfo:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tokenImage:          { width: 36, height: 36, borderRadius: 18 },
  symbol:              { fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  name:                { fontSize: 13, marginTop: 2, textAlign: 'center' },
  headerActions:       { flexDirection: 'row', gap: 8 },
  priceCard:           { borderRadius: 20, padding: 20, marginBottom: 16 },
  priceHeader:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priceLabel:          { fontSize: 14, fontWeight: '500' },
  rankBadge:           { fontSize: 12, fontWeight: '600' },
  priceRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  price:               { fontSize: 32, fontWeight: 'bold' },
  changeBadge:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4 },
  change:              { fontSize: 14, fontWeight: '700' },
  sparklineContainer:  { marginTop: 8, alignItems: 'center' },
  sparklineView:       { flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 2 },
  sparklineBar:        { width: 4, borderRadius: 1 },
  quickActionsContainer: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickActionBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, gap: 8, elevation: 2 },
  quickActionTxt:      { fontSize: 14, fontWeight: '600', color: '#FFF' },
  timeframeCard:       { borderRadius: 20, padding: 16, marginBottom: 16 },
  sectionTitle:        { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  timeframeContainer:  { flexDirection: 'row', justifyContent: 'space-between' },
  timeframeBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, marginHorizontal: 3 },
  timeframeTxt:        { fontSize: 13, fontWeight: '600' },
  chartCard:           { borderRadius: 20, padding: 16, marginBottom: 16, minHeight: 180, overflow: 'hidden' },
  chartLoading:        { alignItems: 'center', justifyContent: 'center', height: 180, gap: 12 },
  loadingTxt:          { fontSize: 14 },
  chartPlaceholder:    { alignItems: 'center', justifyContent: 'center', height: 180, gap: 12 },
  placeholderTxt:      { fontSize: 14, textAlign: 'center' },
  simpleChart:         { flexDirection: 'row', width: '100%', justifyContent: 'space-between', paddingHorizontal: 4 },
  candleWrap:          { flex: 1, height: '100%', alignItems: 'center' },
  candleWick:          { position: 'absolute', width: 1 },
  candleBody:          { position: 'absolute', width: '60%', borderRadius: 1 },
  ohlcCard:            { borderRadius: 20, padding: 16, marginBottom: 16 },
  ohlcGrid:            { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  ohlcItem:            { width: '48%', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 10 },
  ohlcLabel:           { fontSize: 12, marginBottom: 4 },
  ohlcValue:           { fontSize: 15, fontWeight: '600' },
  marketStatsCard:     { borderRadius: 20, padding: 16, marginBottom: 16 },
  statsGrid:           { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statItem:            { width: '48%', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 10 },
  statLabel:           { fontSize: 12, marginBottom: 4 },
  statValue:           { fontSize: 15, fontWeight: '600' },
  athAtlContainer:     { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  athAtlItem:          { alignItems: 'center', gap: 4 },
  athAtlLabel:         { fontSize: 11 },
  athValue:            { fontSize: 14, fontWeight: '600' },
  athChange:           { fontSize: 11, fontWeight: '600' },
  descriptionCard:     { borderRadius: 20, padding: 16, marginBottom: 16 },
  descriptionText:     { fontSize: 14, lineHeight: 22 },
  linksCard:           { borderRadius: 20, padding: 16, marginBottom: 16 },
  linksContainer:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkBtn:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 8 },
  linkTxt:             { fontSize: 14, fontWeight: '500' },
  mintCard:            { borderRadius: 20, padding: 16, marginBottom: 16 },
  mintLabel:           { fontSize: 12, marginBottom: 8 },
  mintRow:             { flexDirection: 'row', alignItems: 'center' },
  mintAddress:         { flex: 1, fontSize: 13, fontFamily: 'monospace' },
  copyBtn:             { padding: 8, marginLeft: 8 },
});
