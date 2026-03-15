import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  RefreshControl, SafeAreaView, ActivityIndicator, Alert, Dimensions,
  TextInput, Modal
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const TOKEN_LIST = [
  {
    id: 'solana', symbol: 'SOL', name: 'Solana', decimals: 9, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    mint: 'So11111111111111111111111111111111111111112',
  },
  {
    id: 'tether', symbol: 'USDT', name: 'Tether', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
    mint: 'Es9vMFrzaCERc8Foa8XfRduKiSfrhEL5c7qr2WXXBWY5',
  },
  {
    id: 'usd-coin', symbol: 'USDC', name: 'USD Coin', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  {
    id: 'MonyCoin', symbol: 'MECO', name: 'MonyCoin', decimals: 9, swapAvailable: true,
    image: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco.logo.png',
    mint: '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i',
  },
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', decimals: 8, swapAvailable: false, image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', decimals: 18, swapAvailable: false, image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
  { id: 'binancecoin', symbol: 'BNB', name: 'Binance Coin', decimals: 18, swapAvailable: false, image: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png' },
];

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

  const colors = {
    background: isDark ? '#0A0A0F' : '#F8F9FA',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
  };

  const fetchMarketData = async () => {
    try {
      const ids = TOKEN_LIST.map(t => t.id).join(',');
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
      
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('API Error');
      
      const data = await response.json();
      
      const formattedData = data.map(item => {
        const localInfo = TOKEN_LIST.find(t => t.id === item.id);
        return {
          ...localInfo,
          current_price: item.current_price,
          price_change_percentage_24h: item.price_change_percentage_24h,
          market_cap: item.market_cap,
          total_volume: item.total_volume,
          rank: item.market_cap_rank
        };
      });

      if (!formattedData.find(t => t.symbol === 'MECO')) {
        const mecoInfo = TOKEN_LIST.find(t => t.symbol === 'MECO');
        formattedData.push({
          ...mecoInfo,
          current_price: 0.00613,
          price_change_percentage_24h: 2.5,
          rank: 999
        });
      }

      setTokens(formattedData.sort((a, b) => a.rank - b.rank));

    } catch (error) {
      console.warn('Market fetch error, using fallback');
      setTokens(TOKEN_LIST.map((t, i) => ({
        ...t,
        current_price: t.symbol === 'MECO' ? 0.00613 : 0,
        price_change_percentage_24h: 0,
        rank: i + 1
      })));
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchMarketData();
      setLoading(false);
    };
    init();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMarketData();
    setRefreshing(false);
  };

  const handleTokenPress = (token) => {
    navigation.navigate('TokenDetails', { token });
  };

  // فلترة العملات حسب البحث والتبويب
  const filteredTokens = tokens.filter(t => {
    // فلترة حسب البحث
    const matchesSearch = searchQuery === '' || 
      t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase());

    // فلترة حسب التبويب
    const matchesTab = activeTab === 'all' ? true : 
                      activeTab === 'solana' ? t.swapAvailable : 
                      activeTab === 'gainers' ? t.price_change_percentage_24h > 0 : true;

    return matchesSearch && matchesTab;
  });

  const renderTabs = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
      {[
        { id: 'all', label: t('market_all_coins') },
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
      {/* 🔍 شريط البحث */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
        <TouchableOpacity 
          style={[styles.searchInput, { backgroundColor: colors.background }]}
          onPress={() => setSearchModalVisible(true)}
        >
          <Ionicons name="search" size={20} color={colors.secondary} />
          <Text style={[styles.searchPlaceholder, { color: colors.secondary }]}>
            {searchQuery || t('market_search_placeholder')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{t('market_title')}</Text>
          <Text style={[styles.subtitle, { color: colors.secondary }]}>{t('market_track_prices')}</Text>
        </View>

        {renderTabs()}

        <View style={styles.listContainer}>
          {filteredTokens.map((token, index) => {
            const isUp = token.price_change_percentage_24h >= 0;
            return (
              <TouchableOpacity
                key={index}
                style={[styles.card, { backgroundColor: colors.card }]}
                onPress={() => handleTokenPress(token)}
                activeOpacity={0.7}
              >
                <View style={styles.leftSide}>
                  <Text style={[styles.rank, { color: colors.secondary }]}>{token.rank}</Text>
                  <Image source={{ uri: token.image }} style={styles.icon} />
                  <View>
                    <Text style={[styles.symbol, { color: colors.text }]}>{token.symbol}</Text>
                    <Text style={[styles.name, { color: colors.secondary }]}>{token.name}</Text>
                  </View>
                </View>
                
                <View style={styles.rightSide}>
                  <Text style={[styles.price, { color: colors.text }]}>
                    ${token.current_price?.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: isUp ? '#10B98120' : '#EF444420' }]}>
                    <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={10} color={isUp ? '#10B981' : '#EF4444'} />
                    <Text style={[styles.change, { color: isUp ? '#10B981' : '#EF4444' }]}>
                      {Math.abs(token.price_change_percentage_24h).toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* 🔍 Modal البحث */}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  searchPlaceholder: {
    fontSize: 14,
  },
  header: { padding: 20, paddingTop: 10 },
  title: { fontSize: 28, fontWeight: 'bold' },
  subtitle: { fontSize: 14, marginTop: 4 },
  tabsContainer: { paddingHorizontal: 20, marginBottom: 16 },
  tab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    marginRight: 10, backgroundColor: 'rgba(0,0,0,0.05)'
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  listContainer: { paddingHorizontal: 20 },
  card: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderRadius: 16, marginBottom: 12, elevation: 1
  },
  leftSide: { flexDirection: 'row', alignItems: 'center' },
  rank: { fontSize: 12, width: 24, textAlign: 'center', marginRight: 4 },
  icon: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  symbol: { fontSize: 16, fontWeight: 'bold' },
  name: { fontSize: 12 },
  rightSide: { alignItems: 'flex-end' },
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
});
