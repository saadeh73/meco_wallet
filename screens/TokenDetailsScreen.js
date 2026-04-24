// screens/TokenDetailsScreen.js
// شاشة تفاصيل العملة - تصميم احترافي
// FIX: استخدام السعر من شاشة السوق (token.current_price)

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Alert,
  Linking,
  Image,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const WATCHLIST_STORAGE_KEY = '@meco_watchlist';

const TIMEFRAMES = [
  { label: '1H', value: '1', days: '1' },
  { label: '24H', value: '24', days: '1' },
  { label: '7D', value: '168', days: '7' },
  { label: '30D', value: '720', days: '30' },
  { label: '1Y', value: '8760', days: '365' },
];

// عناوين العقود للـ CoinGecko (للبحث عن أسعار العملات)
const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  MECO: '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

const COINGECKO_IDS = {
  SOL: 'solana',
  USDT: 'tether',
  USDC: 'usd-coin',
  JUP: 'jupiter-aggregator',
  RAY: 'raydium',
  BONK: 'bonk',
  WIF: 'dogwifcoin',
  PYTH: 'pyth-network',
  JTO: 'jito',
  RNDR: 'render-token',
  HNT: 'helium',
  ORCA: 'orca',
  MNDE: 'marinade-finance',
  BOME: 'book-of-meme',
  TNSR: 'tensor',
};

export default function TokenDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';
  const { token } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [sparklineData, setSparklineData] = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[1]);
  const [tokenMetadata, setTokenMetadata] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [priceStats, setPriceStats] = useState({
    current: 0,
    change24h: 0,
    high24h: 0,
    low24h: 0,
    open24h: 0,
    volume24h: 0,
    marketCap: 0,
    circulatingSupply: 0,
    maxSupply: 0,
    ath: 0,
    athChange: 0,
    atl: 0,
  });

  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    cardAlt: isDark ? '#252540' : '#F0F4F8',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    textMuted: isDark ? '#6B7280' : '#9CA3AF',
    success: '#10B981',
    successLight: isDark ? '#10B98120' : '#10B98115',
    error: '#EF4444',
    errorLight: isDark ? '#EF444420' : '#EF444415',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    primary: primaryColor,
  };

  if (!token) {
    navigation.goBack();
    return null;
  }

  const isPositive = priceStats.change24h >= 0;

  // تحميل المفضلة
  useEffect(() => {
    const loadWatchlist = async () => {
      try {
        const stored = await AsyncStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (stored) setWatchlist(JSON.parse(stored));
      } catch (e) {
        console.warn('Failed to load watchlist:', e);
      }
    };
    loadWatchlist();
  }, []);

  const toggleWatchlist = async () => {
    const symbol = token.symbol;
    let newList;
    if (watchlist.includes(symbol)) {
      newList = watchlist.filter(s => s !== symbol);
    } else {
      newList = [...watchlist, symbol];
    }
    setWatchlist(newList);
    await AsyncStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(newList));
  };

  const isWatchlisted = watchlist.includes(token.symbol);

  // ✅ استخدام السعر من شاشة السوق (الذي جلبته already من DexScreener للمكوّن MECO)
  // لا حاجة لجلب السعر من جديد - السعر موجود في token.current_price
  const getPriceFromToken = () => {
    const price = token?.current_price || 0;

    // 🛡️ إذا كان السعر 0 أو غير موجود، استخدم السعر الاحتياطي
    if (price === 0 && token?.symbol === 'MECO') {
      return 0.002013; // السعر الاحتياطي للمكوّن MECO
    }

    return price;
  };

  // جلب بيانات OHLC من CoinGecko
  const fetchOHLCFromCoinGecko = async (symbol, days = 7) => {
    try {
      const coinId = COINGECKO_IDS[symbol] || symbol.toLowerCase();
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const ohlcData = await response.json();

      if (!Array.isArray(ohlcData) || ohlcData.length === 0) {
        throw new Error('No OHLC data');
      }

      const formattedData = ohlcData.map(point => ({
        timestamp: point[0],
        open: point[1],
        high: point[2],
        low: point[3],
        close: point[4],
      }));

      const latestClose = formattedData[formattedData.length - 1]?.close || 0;
      const firstOpen = formattedData[0]?.open || 0;
      const change24h = firstOpen > 0 ? ((latestClose - firstOpen) / firstOpen) * 100 : 0;

      return {
        data: formattedData,
        stats: {
          currentPrice: latestClose,
          openPrice: firstOpen,
          high24h: Math.max(...formattedData.map(d => d.high)),
          low24h: Math.min(...formattedData.map(d => d.low)),
          change24h,
        },
      };
    } catch (e) {
      console.warn(`❌ OHLC fetch failed for ${symbol}:`, e.message);
      return null;
    }
  };

  // جلب إحصائيات السوق من CoinGecko
  const fetchMarketStats = async (symbol) => {
    try {
      const coinId = COINGECKO_IDS[symbol];
      if (!coinId) return null;

      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      return {
        marketCap: data.market_data?.market_cap?.usd || 0,
        volume24h: data.market_data?.total_volume?.usd || 0,
        high24h: data.market_data?.high_24h?.usd || 0,
        low24h: data.market_data?.low_24h?.usd || 0,
        ath: data.market_data?.ath?.usd || 0,
        athChange: data.market_data?.ath_change_percentage?.usd || 0,
        atl: data.market_data?.atl?.usd || 0,
        circulatingSupply: data.market_data?.circulating_supply || 0,
        maxSupply: data.market_data?.max_supply || 0,
        rank: data.market_cap_rank || 'N/A',
      };
    } catch (e) {
      console.warn(`❌ Market stats failed for ${symbol}:`, e.message);
      return null;
    }
  };

  // جلب وصف العملة
  const fetchTokenDescription = async (symbol) => {
    try {
      if (symbol === 'MECO') {
        return {
          description: t('meco_description', 'MECO is a digital currency built on the Solana network with fast transactions and low fees.'),
          extensions: {
            website: 'https://monycoin.github.io/meco-token/',
            twitter: 'MoniCoinMECO',
            telegram: 'https://t.me/monycoin1',
          },
          rank: 'N/A',
        };
      }

      const coinId = COINGECKO_IDS[symbol];
      if (!coinId) return null;

      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false`
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      return {
        description: data.description?.en || data.description?.ar || '',
        extensions: {
          website: data.links?.homepage?.[0] || null,
          twitter: data.links?.twitter_screen_name ? `https://twitter.com/${data.links.twitter_screen_name}` : null,
          telegram: data.links?.telegram_channel_identifier ? `https://t.me/${data.links.telegram_channel_identifier}` : null,
        },
        rank: data.market_cap_rank || 'N/A',
      };
    } catch (e) {
      console.warn(`❌ Description fetch failed for ${symbol}:`, e.message);
      return null;
    }
  };

  // توليد بيانات افتراضية
  const generateMockData = (startPrice, changePct) => {
    const data = [];
    let current = startPrice > 0 ? startPrice : 1;
    const now = Date.now();
    const volatility = startPrice * 0.05;
    const trend = (changePct / 100) * 0.5;

    for (let i = 0; i < 50; i++) {
      const noise = (Math.random() - 0.5) * volatility;
      const trendBias = trend * volatility * (i / 50);
      const change = noise + trendBias;
      const open = current;
      const close = current + change;
      const high = Math.max(open, close) + Math.random() * (volatility / 2);
      const low = Math.min(open, close) - Math.random() * (volatility / 2);
      data.push({
        timestamp: now - (50 - i) * 3600000,
        open: parseFloat(open.toFixed(8)),
        high: parseFloat(high.toFixed(8)),
        low: parseFloat(low.toFixed(8)),
        close: parseFloat(close.toFixed(8)),
      });
      current = close;
    }

    if (data.length > 0) {
      data[data.length - 1].close = startPrice;
    }

    return data;
  };

  // توليد Sparkline
  const generateSparkline = (ohlcData) => {
    if (!ohlcData || ohlcData.length === 0) return [];
    const step = Math.max(1, Math.floor(ohlcData.length / 24));
    const points = [];
    for (let i = 0; i < ohlcData.length; i += step) {
      points.push(ohlcData[i].close);
    }
    return points.slice(-24);
  };

  // جلب كل البيانات
  const fetchAllData = async (tf, isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const symbol = token.symbol;

      // ✅ السعر الحقيقي من شاشة السوق (passed via token props)
      const realPrice = getPriceFromToken();

      // 2. جلب بيانات OHLC من CoinGecko
      const ohlcResult = await fetchOHLCFromCoinGecko(symbol, tf.days);

      // 3. جلب إحصائيات السوق
      const marketStats = await fetchMarketStats(symbol);

      // 4. جلب الوصف
      const metadata = await fetchTokenDescription(symbol);

      // تحديث الحالة
      setTokenMetadata(metadata);

      if (ohlcResult && ohlcResult.data.length > 0) {
        // استخدام بيانات CoinGecko
        setChartData(ohlcResult.data);
        setSparklineData(generateSparkline(ohlcResult.data));

        setPriceStats(prev => ({
          ...prev,
          current: realPrice > 0 ? realPrice : ohlcResult.stats.currentPrice,
          open24h: ohlcResult.stats.openPrice,
          high24h: marketStats?.high24h || ohlcResult.stats.high24h,
          low24h: marketStats?.low24h || ohlcResult.stats.low24h,
          change24h: ohlcResult.stats.change24h,
          marketCap: marketStats?.marketCap || 0,
          volume24h: marketStats?.volume24h || 0,
          ath: marketStats?.ath || 0,
          athChange: marketStats?.athChange || 0,
          atl: marketStats?.atl || 0,
          circulatingSupply: marketStats?.circulatingSupply || 0,
          maxSupply: marketStats?.maxSupply || 0,
        }));
      } else if (realPrice > 0) {
        // ليس هناك بيانات OHLC، استخدم السعر الحقيقي مع بيانات وهمية
        const mockData = generateMockData(realPrice, 2.5);
        setChartData(mockData);
        setSparklineData(generateSparkline(mockData));

        setPriceStats(prev => ({
          ...prev,
          current: realPrice,
          change24h: 2.5,
          marketCap: realPrice * 1000000000,
          volume24h: 125000,
        }));
      } else {
        // لا يوجد شيء، استخدم السعر من token props
        const tokenPrice = token?.current_price || 1;
        const mockData = generateMockData(tokenPrice, token?.price_change_percentage_24h || 0);
        setChartData(mockData);
        setSparklineData(generateSparkline(mockData));

        setPriceStats(prev => ({
          ...prev,
          current: tokenPrice,
          change24h: token?.price_change_percentage_24h || 0,
        }));
      }
    } catch (error) {
      console.warn('Fetch error:', error.message);

      // Fallback: استخدم السعر من token props
      const tokenPrice = token?.current_price || 1;
      const mockData = generateMockData(tokenPrice, token?.price_change_percentage_24h || 0);
      setChartData(mockData);
      setSparklineData(generateSparkline(mockData));
    } finally {
      if (!isRefresh) setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (token?.symbol) {
      fetchAllData(selectedTimeframe);
    }
  }, [selectedTimeframe, token?.symbol]);

  // Refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllData(selectedTimeframe, true);
    setRefreshing(false);
  }, [selectedTimeframe, token?.symbol]);

  // Actions
  const copyMintAddress = () => {
    if (token.mint) {
      Clipboard.setStringAsync(token.mint);
      Alert.alert(t('success', 'تم'), t('copied', 'تم النسخ'));
    }
  };

  const openExplorer = () => {
    if (token.mint) {
      Linking.openURL(`https://solscan.io/token/${token.mint}`);
    }
  };

  const openLink = (url) => {
    if (url) Linking.openURL(url);
  };

  const formatLargeNumber = (num) => {
    if (!num || num === 0) return 'N/A';
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPrice = (price) => {
    if (!price || price === 0) return '$0.00';
    if (price < 0.0001) return `$${price.toFixed(8)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (num) => {
    if (num === undefined || num === null || isNaN(num)) return '0%';
    const prefix = num >= 0 ? '+' : '';
    return `${prefix}${num.toFixed(2)}%`;
  };

  const getChartMinMax = () => {
    if (chartData.length === 0) {
      const price = priceStats.current || 1;
      return { min: price * 0.9, max: price * 1.1 };
    }
    const highs = chartData.map(d => d.high);
    const lows = chartData.map(d => d.low);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const padding = (max - min) * 0.1;
    return { min: min - padding, max: max + padding };
  };

  const { min: chartMin, max: chartMax } = getChartMinMax();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <View style={styles.tokenHeaderInfo}>
              {token.image && (
                <Image source={{ uri: token.image }} style={styles.tokenImage} />
              )}
              <View>
                <Text style={[styles.symbol, { color: colors.text }]}>{token.symbol}</Text>
                <Text style={[styles.name, { color: colors.textSecondary }]}>{token.name}</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={toggleWatchlist} style={styles.actionButton}>
              <Ionicons name={isWatchlisted ? 'star' : 'star-outline'} size={24} color={isWatchlisted ? '#FFB800' : colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={copyMintAddress} style={styles.actionButton}>
              <Ionicons name="copy-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Price Card */}
        <View style={[styles.priceCard, { backgroundColor: colors.card }]}>
          <View style={styles.priceHeader}>
            <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
              {t('current_price', 'السعر الحالي')}
            </Text>
            <Text style={[styles.rankBadge, { color: colors.textMuted }]}>
              #{tokenMetadata?.rank || token.rank || 'N/A'}
            </Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]}>
              {formatPrice(priceStats.current)}
            </Text>
            <View style={[styles.changeBadge, { backgroundColor: isPositive ? colors.successLight : colors.errorLight }]}>
              <Ionicons name={isPositive ? 'trending-up' : 'trending-down'} size={16} color={isPositive ? colors.success : colors.error} />
              <Text style={[styles.change, { color: isPositive ? colors.success : colors.error }]}>
                {formatPercent(priceStats.change24h)}
              </Text>
            </View>
          </View>

          {sparklineData.length > 1 && (
            <View style={styles.sparklineContainer}>
              <SparklineView data={sparklineData} isPositive={isPositive} colors={colors} />
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <TouchableOpacity style={[styles.quickActionButton, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate('Send', { preselectedToken: token.symbol })}>
            <Ionicons name="send" size={20} color="#FFF" />
            <Text style={styles.quickActionText}>{t('send', 'إرسال')}</Text>
          </TouchableOpacity>
          {token.swapAvailable !== false && (
            <TouchableOpacity style={[styles.quickActionButton, { backgroundColor: colors.success }]} onPress={() => navigation.navigate('Swap', { fromToken: token.symbol })}>
              <Ionicons name="swap-horizontal" size={20} color="#FFF" />
              <Text style={styles.quickActionText}>{t('swap_title', 'تبادل')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.quickActionButton, { backgroundColor: colors.cardAlt }]} onPress={openExplorer}>
            <Ionicons name="bar-chart-outline" size={20} color={colors.text} />
            <Text style={[styles.quickActionText, { color: colors.text }]}>{t('explorer', 'متصفح')}</Text>
          </TouchableOpacity>
        </View>

        {/* Timeframe Selector */}
        <View style={[styles.timeframeCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('chart_timeframe', 'الرسمة البيانية')}</Text>
          <View style={styles.timeframeContainer}>
            {TIMEFRAMES.map((tf) => (
              <TouchableOpacity key={tf.value} style={[styles.timeframeButton, selectedTimeframe.value === tf.value && { backgroundColor: colors.primary }]} onPress={() => setSelectedTimeframe(tf)}>
                <Text style={[styles.timeframeText, { color: selectedTimeframe.value === tf.value ? '#FFF' : colors.textSecondary }]}>{tf.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          {loading ? (
            <View style={styles.chartLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('loading', 'جاري التحميل...')}</Text>
            </View>
          ) : chartData.length > 0 ? (
            <SimpleCandlestickChart data={chartData} chartMin={chartMin} chartMax={chartMax} isPositive={isPositive} colors={colors} />
          ) : (
            <View style={styles.chartPlaceholder}>
              <Ionicons name="analytics-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>{t('no_chart_data', 'لا توجد بيانات')}</Text>
            </View>
          )}
        </View>

        {/* OHLC Stats */}
        <View style={[styles.ohlcCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('ohlc_stats', 'بيانات OHLC')}</Text>
          <View style={styles.ohlcGrid}>
            <View style={styles.ohlcItem}>
              <Text style={[styles.ohlcLabel, { color: colors.textSecondary }]}>Open</Text>
              <Text style={[styles.ohlcValue, { color: colors.text }]}>{formatPrice(priceStats.open24h)}</Text>
            </View>
            <View style={styles.ohlcItem}>
              <Text style={[styles.ohlcLabel, { color: colors.textSecondary }]}>High</Text>
              <Text style={[styles.ohlcValue, { color: colors.success }]}>{formatPrice(priceStats.high24h)}</Text>
            </View>
            <View style={styles.ohlcItem}>
              <Text style={[styles.ohlcLabel, { color: colors.textSecondary }]}>Low</Text>
              <Text style={[styles.ohlcValue, { color: colors.error }]}>{formatPrice(priceStats.low24h)}</Text>
            </View>
            <View style={styles.ohlcItem}>
              <Text style={[styles.ohlcLabel, { color: colors.textSecondary }]}>Close</Text>
              <Text style={[styles.ohlcValue, { color: colors.text }]}>{formatPrice(priceStats.current)}</Text>
            </View>
          </View>
        </View>

        {/* Market Stats */}
        <View style={[styles.marketStatsCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('market_stats', 'إحصائيات السوق')}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('market_cap', 'القيمة السوقية')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{formatLargeNumber(priceStats.marketCap)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('volume_24h', 'حجم التداول 24س')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{formatLargeNumber(priceStats.volume24h)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('circulating_supply', 'العرض المتداول')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{priceStats.circulatingSupply > 0 ? `${(priceStats.circulatingSupply / 1e6).toFixed(2)}M` : 'N/A'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('max_supply', 'الحد الأقصى')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{priceStats.maxSupply > 0 ? `${(priceStats.maxSupply / 1e6).toFixed(2)}M` : '∞'}</Text>
            </View>
          </View>

          {priceStats.ath > 0 && (
            <View style={styles.athAtlContainer}>
              <View style={styles.athAtlItem}>
                <Ionicons name="trophy" size={16} color="#FFB800" />
                <Text style={[styles.athAtlLabel, { color: colors.textSecondary }]}>{t('ath', 'أعلى سعر')}</Text>
                <Text style={[styles.athValue, { color: colors.text }]}>{formatPrice(priceStats.ath)}</Text>
                <Text style={[styles.athChange, { color: colors.error }]}>{formatPercent(priceStats.athChange)}</Text>
              </View>
              <View style={styles.athAtlItem}>
                <Ionicons name="flag" size={16} color="#10B981" />
                <Text style={[styles.athAtlLabel, { color: colors.textSecondary }]}>{t('atl', 'أقل سعر')}</Text>
                <Text style={[styles.athValue, { color: colors.text }]}>{formatPrice(priceStats.atl)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Description */}
        <View style={[styles.descriptionCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('about_token', 'حول العملة')}</Text>
          <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
            {tokenMetadata?.description || token.description || t('no_description', 'لا يوجد وصف متاح')}
          </Text>
        </View>

        {/* Links */}
        {tokenMetadata?.extensions && Object.keys(tokenMetadata.extensions).length > 0 && (
          <View style={[styles.linksCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('official_links', 'الروابط الرسمية')}</Text>
            <View style={styles.linksContainer}>
              {tokenMetadata.extensions.website && (
                <TouchableOpacity style={[styles.linkButton, { backgroundColor: colors.cardAlt, borderColor: colors.border }]} onPress={() => openLink(tokenMetadata.extensions.website)}>
                  <Ionicons name="globe-outline" size={18} color={colors.text} />
                  <Text style={[styles.linkText, { color: colors.text }]}>{t('website', 'الموقع')}</Text>
                </TouchableOpacity>
              )}
              {tokenMetadata.extensions.twitter && (
                <TouchableOpacity style={[styles.linkButton, { backgroundColor: colors.cardAlt, borderColor: colors.border }]} onPress={() => openLink(tokenMetadata.extensions.twitter)}>
                  <Ionicons name="logo-twitter" size={18} color="#1DA1F2" />
                  <Text style={[styles.linkText, { color: colors.text }]}>{t('twitter', 'تويتر')}</Text>
                </TouchableOpacity>
              )}
              {tokenMetadata.extensions.telegram && (
                <TouchableOpacity style={[styles.linkButton, { backgroundColor: colors.cardAlt, borderColor: colors.border }]} onPress={() => openLink(tokenMetadata.extensions.telegram)}>
                  <Ionicons name="paper-plane-outline" size={18} color="#0088CC" />
                  <Text style={[styles.linkText, { color: colors.text }]}>{t('telegram', 'تيليجرام')}</Text>
                </TouchableOpacity>
              )}
              {token.mint && (
                <TouchableOpacity style={[styles.linkButton, { backgroundColor: colors.cardAlt, borderColor: colors.border }]} onPress={openExplorer}>
                  <Ionicons name="bar-chart-outline" size={18} color={colors.primary} />
                  <Text style={[styles.linkText, { color: colors.text }]}>{t('explorer', 'المتصفح')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Contract Address */}
        {token.mint && (
          <View style={[styles.mintCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.mintLabel, { color: colors.textSecondary }]}>{t('contract_address', 'عنوان العقد')}</Text>
            <View style={styles.mintRow}>
              <Text style={[styles.mintAddress, { color: colors.text }]} numberOfLines={1}>{token.mint}</Text>
              <TouchableOpacity onPress={copyMintAddress} style={styles.copyButton}>
                <Ionicons name="copy" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Sparkline View
function SparklineView({ data, isPositive, colors }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const bars = data.map((value, index) => {
    const height = ((value - min) / range) * 40;
    return { height, isUp: index === data.length - 1 ? isPositive : value >= data[index - 1] };
  });
  return (
    <View style={styles.sparklineView}>
      {bars.map((bar, index) => (
        <View key={index} style={[styles.sparklineBar, { height: Math.max(bar.height, 2), backgroundColor: bar.isUp ? colors.success : colors.error }]} />
      ))}
    </View>
  );
}

// Simple Candlestick Chart
function SimpleCandlestickChart({ data, chartMin, chartMax, isPositive, colors }) {
  if (data.length === 0) return null;
  const range = chartMax - chartMin || 1;
  const chartHeight = 160;
  const visibleData = data.slice(-50);
  return (
    <View style={styles.simpleChartContainer}>
      {visibleData.map((point, index) => {
        const isGreen = point.close >= point.open;
        const candleColor = isGreen ? colors.success : colors.error;
        const bodyTop = chartHeight - ((point.open - chartMin) / range) * chartHeight;
        const bodyBottom = chartHeight - ((point.close - chartMin) / range) * chartHeight;
        const wickTop = chartHeight - ((point.high - chartMin) / range) * chartHeight;
        const wickBottom = chartHeight - ((point.low - chartMin) / range) * chartHeight;
        return (
          <View key={index} style={styles.candleContainer}>
            <View style={[styles.candleWickLine, { top: wickTop, height: wickBottom - wickTop, backgroundColor: candleColor, opacity: 0.5 }]} />
            <View style={[styles.candleBodyRect, { top: Math.min(bodyTop, bodyBottom), height: Math.max(Math.abs(bodyBottom - bodyTop), 2), backgroundColor: candleColor }]} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 4 },
  backButton: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(108, 99, 255, 0.1)' },
  headerTitle: { flex: 1, alignItems: 'center' },
  tokenHeaderInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tokenImage: { width: 36, height: 36, borderRadius: 18 },
  symbol: { fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  name: { fontSize: 13, marginTop: 2, textAlign: 'center' },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionButton: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(108, 99, 255, 0.1)' },
  priceCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
  priceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priceLabel: { fontSize: 14, fontWeight: '500' },
  rankBadge: { fontSize: 12, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  price: { fontSize: 32, fontWeight: 'bold' },
  changeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4 },
  change: { fontSize: 14, fontWeight: '700' },
  sparklineContainer: { marginTop: 8, alignItems: 'center' },
  sparklineView: { flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 2 },
  sparklineBar: { width: 4, borderRadius: 1 },
  quickActionsContainer: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickActionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  quickActionText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  timeframeCard: { borderRadius: 20, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  timeframeContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  timeframeButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, marginHorizontal: 3 },
  timeframeText: { fontSize: 13, fontWeight: '600' },
  chartCard: { borderRadius: 20, padding: 16, marginBottom: 16, alignItems: 'center', justifyContent: 'center', minHeight: 180, overflow: 'hidden' },
  chartLoading: { alignItems: 'center', justifyContent: 'center', height: 180, gap: 12 },
  loadingText: { fontSize: 14 },
  chartPlaceholder: { alignItems: 'center', justifyContent: 'center', height: 180, gap: 12 },
  placeholderText: { fontSize: 14, textAlign: 'center' },
  simpleChartContainer: { flexDirection: 'row', alignItems: 'center', height: 160, width: '100%', justifyContent: 'space-between', paddingHorizontal: 4 },
  candleContainer: { flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center' },
  candleWickLine: { position: 'absolute', width: 1 },
  candleBodyRect: { position: 'absolute', width: '60%', borderRadius: 1 },
  ohlcCard: { borderRadius: 20, padding: 16, marginBottom: 16 },
  ohlcGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  ohlcItem: { width: '48%', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: 'rgba(108, 99, 255, 0.05)', borderRadius: 12, marginBottom: 10 },
  ohlcLabel: { fontSize: 12, marginBottom: 4 },
  ohlcValue: { fontSize: 15, fontWeight: '600' },
  marketStatsCard: { borderRadius: 20, padding: 16, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statItem: { width: '48%', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: 'rgba(108, 99, 255, 0.05)', borderRadius: 12, marginBottom: 10 },
  statLabel: { fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: '600' },
  athAtlContainer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(108, 99, 255, 0.1)' },
  athAtlItem: { alignItems: 'center', gap: 4 },
  athAtlLabel: { fontSize: 11 },
  athValue: { fontSize: 14, fontWeight: '600' },
  athChange: { fontSize: 11, fontWeight: '600' },
  descriptionCard: { borderRadius: 20, padding: 16, marginBottom: 16 },
  descriptionText: { fontSize: 14, lineHeight: 22 },
  linksCard: { borderRadius: 20, padding: 16, marginBottom: 16 },
  linksContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 8 },
  linkText: { fontSize: 14, fontWeight: '500' },
  mintCard: { borderRadius: 20, padding: 16, marginBottom: 16 },
  mintLabel: { fontSize: 12, marginBottom: 8 },
  mintRow: { flexDirection: 'row', alignItems: 'center' },
  mintAddress: { flex: 1, fontSize: 13, fontFamily: 'monospace' },
  copyButton: { padding: 8, marginLeft: 8 },
});
