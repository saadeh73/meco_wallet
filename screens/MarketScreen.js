import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  RefreshControl, SafeAreaView, ActivityIndicator, Dimensions,
  TextInput, Modal, FlatList
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Polyline } from 'react-native-svg';

import { getJupiterMarketData, CORE_TOKENS } from '../services/jupiterMarketService';

const { width } = Dimensions.get('window');
const SPARKLINE_WIDTH = 60;
const SPARKLINE_HEIGHT = 30;
const WATCHLIST_STORAGE_KEY = '@meco_watchlist';

export default function MarketScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor);
  const isDark = theme === 'dark';

  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [sparklineData, setSparklineData] = useState({});
  const [watchlist, setWatchlist] = useState([]);

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
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (stored) setWatchlist(JSON.parse(stored));
      } catch (e) {}
    };
    load();
  }, []);

  const fetchMarketData = async () => {
    try {
      const data = await getJupiterMarketData();
      setTokens(data);
      const sparklines = {};
      data.forEach(t => {
        const change = t.price_change_percentage_24h || 0;
        const points = 20;
        const values = [];
        for (let i = 0; i < points; i++) {
          const progress = i / (points - 1);
          const randomFactor = 0.7 + Math.sin(i * 0.5) * 0.3;
          const base = 100 * (1 + change / 100 * progress * randomFactor);
          values.push(base);
        }
        sparklines[t.symbol] = values;
      });
      setSparklineData(sparklines);
    } catch (error) {
      console.warn('Market fetch error, using fallback');
      setTokens(CORE_TOKENS.map((t, i) => ({
        ...t,
        current_price: t.symbol === 'MECO' ? 0.00613 : 0,
        price_change_percentage_24h: 0,
        rank: i + 1
      })));
    }
  };

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      await fetchMarketData();
      if (isMounted) setLoading(false);
    };
    init();
    const intervalId = setInterval(fetchMarketData, 30000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMarketData();
    const stored = await AsyncStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (stored) setWatchlist(JSON.parse(stored));
    setRefreshing(false);
  };

  const handleTokenPress = (token) => {
    navigation.navigate('TokenDetails', { token });
  };

  const filteredTokens = useMemo(() => {
    return tokens.filter(t => {
      const safeSymbol = t.symbol ? t.symbol.toLowerCase() : '';
      const safeName = t.name ? t.name.toLowerCase() : '';
      const query = searchQuery.toLowerCase();

      const matchesSearch = searchQuery === '' || 
                            safeSymbol.includes(query) || 
                            safeName.includes(query);

      if (activeTab === 'watchlist') {
        return matchesSearch && watchlist.includes(t.symbol);
      }
      const matchesTab = activeTab === 'all' ? true :
        activeTab === 'solana' ? t.swapAvailable : 
        activeTab === 'gainers' ? (t.price_change_percentage_24h > 0) : true;

      return matchesSearch && matchesTab;
    });
  }, [tokens, searchQuery, activeTab, watchlist]);

  const formatPrice = (price) => {
    if (price === undefined || price === null) return '0.00';
    if (price < 0.01) return price.toFixed(6);
    return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  const Sparkline = ({ symbol, change }) => {
    const data = sparklineData[symbol] || [100, 102, 101, 105, 103, 107, 110];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * SPARKLINE_WIDTH;
      const y = SPARKLINE_HEIGHT - ((value - min) / range) * SPARKLINE_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const color = change >= 0 ? colors.success : colors.error;

    return (
      <Svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} style={{ marginRight: 8 }}>
        <Polyline points={points} fill="none" stroke={color} strokeWidth="2" />
      </Svg>
    );
  };

  const renderTokenItem = ({ item: token }) => {
    const isUp = token.price_change_percentage_24h >= 0;
    
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => handleTokenPress(token)}
        activeOpacity={0.7}
      >
        <View style={styles.leftSide}>
          <Text style={[styles.rank, { color: colors.secondary }]}>{token.rank}</Text>
          <Image source={{ uri: token.image }} style={styles.icon} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.symbol, { color: colors.text }]}>{token.symbol}</Text>
            <Text style={[styles.name, { color: colors.secondary }]}>{token.name}</Text>
          </View>
        </View>

        <View style={styles.middleSection}>
          <Sparkline symbol={token.symbol} change={token.price_change_percentage_24h} />
        </View>

        <View style={styles.rightSide}>
          <Text style={[styles.price, { color: colors.text }]}>
            ${formatPrice(token.current_price)}
          </Text>
          <View style={[styles.badge, { backgroundColor: isUp ? colors.success + '20' : colors.error + '20' }]}>
            <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={10} color={isUp ? colors.success : colors.error} />
            <Text style={[styles.change, { color: isUp ? colors.success : colors.error }]}>
              {Math.abs(token.price_change_percentage_24h || 0).toFixed(2)}%
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeader = () => (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{t('market_title')}</Text>
        <Text style={[styles.subtitle, { color: colors.secondary }]}>{t('market_track_prices')}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
        {[
          { id: 'all', label: t('market_all_coins') },
          { id: 'watchlist', label: t('watchlist') },
          { id: 'solana', label: t('market_solana_tokens') },
          { id: 'gainers', label: t('market_top_gainers') }
        ].map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              activeTab === tab.id && { backgroundColor: primaryColor }
            ]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === tab.id ? '#FFF' : colors.secondary }
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  if (loading) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[styles.searchInput, { backgroundColor: colors.background }]}
          onPress={() => setSearchModalVisible(true)}
        >
          <Ionicons name="search" size={20} color={colors.secondary} />
          <Text style={[styles.searchPlaceholder, { color: searchQuery ? colors.text : colors.secondary }]}>
            {searchQuery || t('market_search_placeholder')}
          </Text>
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close-circle" size={18} color={colors.secondary} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredTokens}
        keyExtractor={(item) => item.mint || item.id}
        renderItem={renderTokenItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name={activeTab === 'watchlist' ? 'star-outline' : 'analytics-outline'} size={48} color={colors.secondary} />
            <Text style={[styles.emptyText, { color: colors.secondary }]}>
              {activeTab === 'watchlist' ? t('watchlist_empty') : t('no_results')}
            </Text>
          </View>
        }
      />

      <Modal visible={searchModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('market_search')}
              </Text>
              <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, {
                backgroundColor: colors.background,
                color: colors.text,
                borderColor: colors.border
              }]}
              placeholder={t('market_search_placeholder')}
              placeholderTextColor={colors.secondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: primaryColor }]}
              onPress={() => setSearchModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>{t('ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  searchPlaceholder: {
    fontSize: 14,
    flex: 1,
  },
  header: { paddingTop: 10, paddingBottom: 15 },
  title: { fontSize: 28, fontWeight: 'bold' },
  subtitle: { fontSize: 14, marginTop: 4 },
  tabsContainer: { marginBottom: 16 },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    marginRight: 10, backgroundColor: 'rgba(0,0,0,0.05)'
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  card: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderRadius: 16, marginBottom: 12, elevation: 1
  },
  leftSide: { flexDirection: 'row', alignItems: 'center', flex: 2 },
  rank: { fontSize: 12, width: 24, textAlign: 'center', marginRight: 4 },
  icon: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  symbol: { fontSize: 16, fontWeight: 'bold' },
  name: { fontSize: 12 },
  middleSection: { flex: 1, alignItems: 'center' },
  rightSide: { alignItems: 'flex-end', flex: 1.5 },
  price: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  badge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 8
  },
  change: { fontSize: 12, fontWeight: '600', marginLeft: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
  },
});
