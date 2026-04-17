import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Image, Linking, Platform, FlatList, RefreshControl
} from 'react-native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// ==================== قائمة التطبيقات ====================
const DAPPS = [
  // === DeFi ===
  {
    id: 'jupiter',
    name: 'Jupiter',
    description: 'أفضل مجمّع تبادل على Solana',
    descriptionEn: 'Best swap aggregator on Solana',
    url: 'https://jup.ag/',
    logo: 'https://jup.ag/favicon.ico',
    category: 'defi',
    featured: true,
  },
  {
    id: 'raydium',
    name: 'Raydium',
    description: 'صانع سوق آلي رائد',
    descriptionEn: 'Leading AMM and liquidity provider',
    url: 'https://raydium.io/',
    logo: 'https://assets.coingecko.com/coins/images/13928/large/PSym7VQ.png',
    category: 'defi',
    featured: true,
  },
  {
    id: 'orca',
    name: 'Orca',
    description: 'مجمع سيولة مركّزة',
    descriptionEn: 'Concentrated liquidity aggregator',
    url: 'https://www.orca.so/',
    logo: 'https://assets.coingecko.com/coins/images/17547/large/Orca_Logo.png',
    category: 'defi',
    featured: true,
  },
  {
    id: 'jito',
    name: 'Jito',
    description: 'بروتوكول إعادة التخزين',
    descriptionEn: 'Leading restaking protocol',
    url: 'https://jito.network/',
    logo: 'https://assets.coingecko.com/coins/images/33228/large/jto.png',
    category: 'defi',
    featured: false,
  },
  {
    id: 'marinade',
    name: 'Marinade',
    description: 'تخزين سائل لـ SOL',
    descriptionEn: 'Liquid staking for SOL',
    url: 'https://marinade.finance/',
    logo: 'https://assets.coingecko.com/coins/images/18612/large/mnde.png',
    category: 'defi',
    featured: true,
  },
  {
    id: 'kamino',
    name: 'Kamino',
    description: 'إقراض وإدارة سيولة',
    descriptionEn: 'Lending and liquidity management',
    url: 'https://kamino.finance/',
    logo: 'https://www.kamino.finance/favicon.ico',
    category: 'defi',
    featured: false,
  },
  {
    id: 'drift',
    name: 'Drift',
    description: 'عقود دائمة سريعة',
    descriptionEn: 'Fast perpetuals trading',
    url: 'https://www.drift.trade/',
    logo: 'https://www.drift.trade/favicon.ico',
    category: 'defi',
    featured: false,
  },
  // === NFTs ===
  {
    id: 'magic-eden',
    name: 'Magic Eden',
    description: 'أكبر سوق NFT',
    descriptionEn: 'Largest NFT marketplace',
    url: 'https://magiceden.io/',
    logo: 'https://magiceden.io/favicon.ico',
    category: 'nft',
    featured: true,
  },
  {
    id: 'tensor',
    name: 'Tensor',
    description: 'تداول NFT للمحترفين',
    descriptionEn: 'Pro NFT trading',
    url: 'https://www.tensor.trade/',
    logo: 'https://www.tensor.trade/favicon.ico',
    category: 'nft',
    featured: true,
  },
];

const CATEGORIES = [
  { id: 'all', name: 'الكل', nameEn: 'All' },
  { id: 'defi', name: 'DeFi', nameEn: 'DeFi' },
  { id: 'nft', name: 'NFTs', nameEn: 'NFTs' },
  { id: 'favorites', name: 'المفضلة', nameEn: 'Favorites' },
];

export default function AppPortalScreen() {
  const { t, i18n } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';
  const isArabic = i18n.language === 'ar';

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [favorites, setFavorites] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const colors = {
    background: isDark ? '#0A0A0F' : '#F2F3F7',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#8E8E93',
    border: isDark ? '#2A2A3E' : '#E5E5EA',
    banner: primaryColor,
  };

  const openLink = async (url) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        console.warn('Cannot open URL:', url);
      }
    } catch (error) {
      console.error('Error opening link:', error);
    }
  };

  const toggleFavorite = (dappId) => {
    setFavorites(prev => 
      prev.includes(dappId) 
        ? prev.filter(id => id !== dappId)
        : [...prev, dappId]
    );
  };

  const getFilteredDapps = useCallback(() => {
    if (selectedCategory === 'favorites') {
      return DAPPS.filter(dapp => favorites.includes(dapp.id));
    }
    if (selectedCategory === 'all') {
      return DAPPS;
    }
    return DAPPS.filter(dapp => dapp.category === selectedCategory);
  }, [selectedCategory, favorites]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const renderDappItem = ({ item }) => {
    const isFavorite = favorites.includes(item.id);
    const description = isArabic ? item.description : item.descriptionEn;

    return (
      <TouchableOpacity
        style={[styles.dappCard, { backgroundColor: colors.card }]}
        onPress={() => openLink(item.url)}
        activeOpacity={0.8}
      >
        <Image source={{ uri: item.logo }} style={styles.dappLogo} />
        <View style={styles.dappInfo}>
          <View style={styles.dappHeader}>
            <Text style={[styles.dappName, { color: colors.text }]}>{item.name}</Text>
            {item.featured && (
              <View style={[styles.featuredBadge, { backgroundColor: primaryColor + '20' }]}>
                <Ionicons name="star" size={12} color={primaryColor} />
              </View>
            )}
          </View>
          <Text style={[styles.dappDesc, { color: colors.textSecondary }]} numberOfLines={2}>
            {description}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={() => toggleFavorite(item.id)}
        >
          <Ionicons 
            name={isFavorite ? 'bookmark' : 'bookmark-outline'} 
            size={22} 
            color={isFavorite ? primaryColor : colors.textSecondary} 
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderCategoryTab = (category) => {
    const isActive = selectedCategory === category.id;
    const displayName = isArabic ? category.name : category.nameEn;
    
    return (
      <TouchableOpacity
        key={category.id}
        style={[
          styles.categoryTab,
          isActive && { borderBottomColor: primaryColor, borderBottomWidth: 2 }
        ]}
        onPress={() => setSelectedCategory(category.id)}
      >
        <Text
          style={[
            styles.categoryText,
            { color: isActive ? primaryColor : colors.textSecondary }
          ]}
        >
          {displayName}
        </Text>
      </TouchableOpacity>
    );
  };

  const filteredDapps = getFilteredDapps();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Banner */}
      <View style={[styles.banner, { backgroundColor: colors.banner }]}>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>
            {isArabic ? 'استكشف Web3' : 'Explore Web3'}
          </Text>
          <Text style={styles.bannerSubtitle}>
            {isArabic 
              ? 'أفضل التطبيقات اللامركزية على Solana'
              : 'Top dApps on Solana'}
          </Text>
        </View>
        <Ionicons name="compass-outline" size={60} color="rgba(255,255,255,0.2)" style={styles.bannerIcon} />
      </View>

      {/* Categories */}
      <View style={styles.categoriesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {CATEGORIES.map(renderCategoryTab)}
        </ScrollView>
      </View>

      {/* dApps List */}
      <FlatList
        data={filteredDapps}
        renderItem={renderDappItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="bookmark-outline" size={50} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {isArabic ? 'لا توجد تطبيقات مفضلة' : 'No favorite dApps yet'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    marginHorizontal: 20,
    marginTop: Platform.OS === 'ios' ? 60 : 40,
    marginBottom: 20,
    borderRadius: 20,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  bannerContent: { zIndex: 2 },
  bannerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 6 },
  bannerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  bannerIcon: { position: 'absolute', right: -10, bottom: -10, zIndex: 1 },
  categoriesContainer: { paddingHorizontal: 20, marginBottom: 16 },
  categoryTab: { paddingHorizontal: 16, paddingVertical: 10, marginRight: 20 },
  categoryText: { fontSize: 16, fontWeight: '600' },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  dappCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dappLogo: { width: 48, height: 48, borderRadius: 24, marginRight: 14 },
  dappInfo: { flex: 1 },
  dappHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  dappName: { fontSize: 16, fontWeight: '700', marginRight: 6 },
  featuredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dappDesc: { fontSize: 12 },
  favoriteButton: { padding: 8, marginLeft: 8 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { marginTop: 16, fontSize: 16 },
});
