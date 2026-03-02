import React, { useEffect, useState } from 'react';
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
  Image
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { CandlestickChart } from 'react-native-wagmi-charts';

const { width } = Dimensions.get('window');

// خيارات الفترات الزمنية
const TIMEFRAMES = [
  { label: '1H', value: '1h' },
  { label: '24H', value: '24h' },
  { label: '1W', value: '7d' },
  { label: '1M', value: '30d' },
  { label: '1Y', value: '365d' },
  { label: 'ALL', value: 'max' },
];

export default function TokenDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const { token } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('24h');
  const [tokenMetadata, setTokenMetadata] = useState(null);
  const [priceStats, setPriceStats] = useState({
    current: 0,
    change24h: 0,
    high24h: 0,
    low24h: 0,
    open24h: 0,
    volume24h: 0,
    marketCap: 0,
  });

  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    success: '#10B981',
    error: '#EF4444',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
  };

  if (!token) {
    navigation.goBack();
    return null;
  }

  const isPositive = token.price_change_percentage_24h >= 0;

  // دالة لجلب بيانات الشموع
  const fetchCandlestickData = async (timeframe) => {
    try {
      setLoading(true);
      
      let resolution = '15m';
      if (timeframe === '1h') resolution = '1m';
      else if (timeframe === '24h') resolution = '5m';
      else if (timeframe === '7d') resolution = '1h';
      else if (timeframe === '30d') resolution = '4h';
      else if (timeframe === '365d') resolution = '1d';
      else if (timeframe === 'max') resolution = '1w';

      const url = `https://public-api.birdeye.so/defi/ohlc?address=${token.mint}&type=${resolution}&time_from=${Math.floor(Date.now() / 1000 - 365 * 24 * 60 * 60)}&time_to=${Math.floor(Date.now() / 1000)}`;
      
      const response = await fetch(url, {
        headers: {
          'x-chain': 'solana',
          'accept': 'application/json',
          'X-API-KEY': '573e63f9bb694038aa771187a5d27ddb'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch chart data');
      
      const json = await response.json();
      
      if (json.success && json.data?.items) {
        const formattedData = json.data.items.map(item => ({
          timestamp: item.unixTime * 1000,
          open: item.o,
          high: item.h,
          low: item.l,
          close: item.c,
          volume: item.v
        }));
        
        setChartData(formattedData);
        
        if (formattedData.length > 0) {
          const first = formattedData[0];
          const last = formattedData[formattedData.length - 1];
          setPriceStats(prev => ({
            ...prev,
            open24h: first.open,
            current: last.close,
            high24h: Math.max(...formattedData.map(d => d.high)),
            low24h: Math.min(...formattedData.map(d => d.low)),
            volume24h: formattedData.reduce((sum, d) => sum + d.volume, 0),
          }));
        }
      }
    } catch (error) {
      console.warn('Chart data error:', error);
      // بيانات وهمية للاختبار
      const mockData = generateMockData(100);
      setChartData(mockData);
    } finally {
      setLoading(false);
    }
  };

  // دالة لتوليد بيانات وهمية
  const generateMockData = (count) => {
    const data = [];
    let price = 100;
    const now = Date.now();
    
    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.5) * 10;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * 5;
      const low = Math.min(open, close) - Math.random() * 5;
      
      data.push({
        timestamp: now - (count - i) * 3600000,
        open,
        high,
        low,
        close,
        volume: Math.random() * 1000000
      });
      
      price = close;
    }
    return data;
  };

  // جلب معلومات إضافية عن التوكن
  const fetchTokenMetadata = async () => {
    try {
      const response = await fetch(`https://api.jup.ag/token/${token.mint}`);
      if (response.ok) {
        const data = await response.json();
        setTokenMetadata(data);
      }
    } catch (error) {
      console.warn('Failed to fetch token metadata:', error);
    }
  };

  useEffect(() => {
    if (token?.mint) {
      fetchCandlestickData(selectedTimeframe);
      fetchTokenMetadata();
    }
  }, [selectedTimeframe, token?.mint]);

  const copyMintAddress = () => {
    if (token.mint) {
      Clipboard.setStringAsync(token.mint);
      Alert.alert(t('success'), t('copied_to_clipboard'));
    }
  };

  const openExplorer = () => {
    if (token.mint) {
      const url = `https://solscan.io/token/${token.mint}`;
      Linking.openURL(url);
    }
  };

  const openLink = (url) => {
    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          
          <View style={styles.headerTitle}>
            <Text style={[styles.symbol, { color: colors.text }]}>{token.symbol}</Text>
            <Text style={[styles.name, { color: colors.textSecondary }]}>{token.name}</Text>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={copyMintAddress} style={styles.actionButton}>
              <Ionicons name="copy-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={openExplorer} style={styles.actionButton}>
              <Ionicons name="open-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* السعر والتغير */}
        <View style={styles.priceContainer}>
          <Text style={[styles.price, { color: colors.text }]}>
            ${token.current_price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </Text>
          <View style={[styles.changeBadge, { backgroundColor: isPositive ? colors.success + '20' : colors.error + '20' }]}>
            <Ionicons name={isPositive ? 'caret-up' : 'caret-down'} size={14} color={isPositive ? colors.success : colors.error} />
            <Text style={[styles.change, { color: isPositive ? colors.success : colors.error }]}>
              {Math.abs(token.price_change_percentage_24h).toFixed(2)}%
            </Text>
          </View>
        </View>

        {/* شريط اختيار الفترة الزمنية */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.timeframeContainer}
        >
          {TIMEFRAMES.map((tf) => (
            <TouchableOpacity
              key={tf.value}
              style={[
                styles.timeframeButton,
                { 
                  backgroundColor: selectedTimeframe === tf.value ? primaryColor : colors.card,
                  borderColor: colors.border
                }
              ]}
              onPress={() => setSelectedTimeframe(tf.value)}
            >
              <Text style={[
                styles.timeframeText,
                { color: selectedTimeframe === tf.value ? '#FFF' : colors.textSecondary }
              ]}>
                {tf.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* الرسم البياني بالشموع */}
        {loading ? (
          <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
        ) : chartData.length > 0 ? (
          <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
            <CandlestickChart.Provider data={chartData}>
              <CandlestickChart
                width={width - 32}
                height={250}
                positiveColor={colors.success}
                negativeColor={colors.error}
                positiveFillColor={colors.success}
                negativeFillColor={colors.error}
              >
                <CandlestickChart.Candles />
                <CandlestickChart.Crosshair />
              </CandlestickChart>
            </CandlestickChart.Provider>
          </View>
        ) : (
          <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              لا توجد بيانات كافية للرسم البياني
            </Text>
          </View>
        )}

        {/* إحصائيات OHLC */}
        {chartData.length > 0 && (
          <View style={[styles.statsContainer, { backgroundColor: colors.card }]}>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Open</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  ${priceStats.open24h?.toFixed(4) || '0'}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>High</Text>
                <Text style={[styles.statValue, { color: colors.success }]}>
                  ${priceStats.high24h?.toFixed(4) || '0'}
                </Text>
              </View>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Close</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  ${priceStats.current?.toFixed(4) || '0'}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Low</Text>
                <Text style={[styles.statValue, { color: colors.error }]}>
                  ${priceStats.low24h?.toFixed(4) || '0'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ✅ معلومات السوق */}
        <View style={[styles.marketStatsCard, { backgroundColor: colors.card }]}>
          <View style={styles.marketStatRow}>
            <View style={styles.marketStatItem}>
              <Text style={[styles.marketStatLabel, { color: colors.textSecondary }]}>
                {t('market_cap')}
              </Text>
              <Text style={[styles.marketStatValue, { color: colors.text }]}>
                ${token.market_cap?.toLocaleString() || 'N/A'}
              </Text>
            </View>
            <View style={styles.marketStatItem}>
              <Text style={[styles.marketStatLabel, { color: colors.textSecondary }]}>
                {t('volume_24h')}
              </Text>
              <Text style={[styles.marketStatValue, { color: colors.text }]}>
                ${token.total_volume?.toLocaleString() || 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        {/* ✅ وصف العملة */}
        <View style={[styles.descriptionCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.descriptionTitle, { color: colors.text }]}>
            {t('about_token')}
          </Text>
          <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
            {tokenMetadata?.description || token.description || t('no_description')}
          </Text>
        </View>

        {/* ✅ الروابط الرسمية */}
        <View style={[styles.linksCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.linksTitle, { color: colors.text }]}>
            {t('official_links')}
          </Text>
          
          <View style={styles.linksContainer}>
            {tokenMetadata?.extensions?.website && (
              <TouchableOpacity 
                style={[styles.linkButton, { borderColor: colors.border }]}
                onPress={() => openLink(tokenMetadata.extensions.website)}
              >
                <Ionicons name="globe-outline" size={20} color={primaryColor} />
                <Text style={[styles.linkText, { color: colors.text }]}>Website</Text>
              </TouchableOpacity>
            )}
            
            {tokenMetadata?.extensions?.twitter && (
              <TouchableOpacity 
                style={[styles.linkButton, { borderColor: colors.border }]}
                onPress={() => openLink(`https://twitter.com/${tokenMetadata.extensions.twitter}`)}
              >
                <Ionicons name="logo-twitter" size={20} color="#1DA1F2" />
                <Text style={[styles.linkText, { color: colors.text }]}>Twitter</Text>
              </TouchableOpacity>
            )}
            
            {tokenMetadata?.extensions?.telegram && (
              <TouchableOpacity 
                style={[styles.linkButton, { borderColor: colors.border }]}
                onPress={() => openLink(tokenMetadata.extensions.telegram)}
              >
                <Ionicons name="paper-plane" size={20} color="#26A5E4" />
                <Text style={[styles.linkText, { color: colors.text }]}>Telegram</Text>
              </TouchableOpacity>
            )}
            
            {token.mint && (
              <TouchableOpacity 
                style={[styles.linkButton, { borderColor: colors.border }]}
                onPress={openExplorer}
              >
                <Ionicons name="scan-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.linkText, { color: colors.text }]}>Solscan</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: { padding: 8 },
  headerTitle: { alignItems: 'center' },
  symbol: { fontSize: 18, fontWeight: 'bold' },
  name: { fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 16 },
  actionButton: { padding: 8 },

  // Price
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  price: { fontSize: 32, fontWeight: 'bold' },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  change: { fontSize: 14, fontWeight: '600' },

  // Timeframe
  timeframeContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timeframeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  timeframeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Chart
  chartContainer: {
    height: 250,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { fontSize: 14, textAlign: 'center' },

  // Stats
  statsContainer: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Market Stats
  marketStatsCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  marketStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  marketStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  marketStatLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  marketStatValue: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Description
  descriptionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  descriptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
  },

  // Links
  linksCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  linksTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  linksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
