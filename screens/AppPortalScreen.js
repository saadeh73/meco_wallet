import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Image, Linking, Platform, FlatList, RefreshControl
} from 'react-native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// ==================== فرص الدخل السلبي (Earn Opportunities) ====================
const EARNING_OPPORTUNITIES = [
  {
    id: 'marinade-sol',
    protocol: 'Marinade Finance',
    protocolIcon: 'https://assets.coingecko.com/coins/images/18612/large/mnde.png',
    asset: 'SOL',
    assetIcon: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    apy: 8.5,
    minDeposit: 0.1,
    description: 'تخزين سائل لـ SOL للحصول على mSOL. يمكن استخدام mSOL في DeFi مع استمرار كسب العوائد.',
    descriptionEn: 'Liquid stake SOL to receive mSOL. Use mSOL across DeFi while earning staking rewards.',
    url: 'https://marinade.finance/app/staking',
    category: 'liquid-staking',
    featured: true,
  },
  {
    id: 'jito-sol',
    protocol: 'Jito',
    protocolIcon: 'https://assets.coingecko.com/coins/images/33228/large/jto.png',
    asset: 'SOL',
    assetIcon: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    apy: 9.2,
    minDeposit: 0.1,
    description: 'تخزين SOL للحصول على JitoSOL. استفد من مكافآت MEV الإضافية بالإضافة لعوائد التخزين.',
    descriptionEn: 'Stake SOL for JitoSOL. Earn MEV rewards on top of regular staking yields.',
    url: 'https://jito.network/staking',
    category: 'liquid-staking',
    featured: true,
  },
  {
    id: 'kamino-usdc',
    protocol: 'Kamino',
    protocolIcon: 'https://www.kamino.finance/favicon.ico',
    asset: 'USDC',
    assetIcon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
    apy: 8.0,
    minDeposit: 10,
    description: 'إقراض USDC في مجمعات سيولة آلية. عوائد متغيرة بناءً على الطلب على الإقراض.',
    descriptionEn: 'Lend USDC in automated liquidity pools. Variable APY based on borrowing demand.',
    url: 'https://app.kamino.finance/lend',
    category: 'lending',
    featured: true,
  },
  {
    id: 'marginfi-usdc',
    protocol: 'Marginfi',
    protocolIcon: 'https://www.marginfi.com/favicon.ico',
    asset: 'USDC',
    assetIcon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
    apy: 6.5,
    minDeposit: 10,
    description: 'إقراض USDC على منصة Marginfi. منصة إقراض لامركزية مع خيارات رافعة مالية.',
    descriptionEn: 'Lend USDC on Marginfi. Decentralized lending protocol with leverage options.',
    url: 'https://app.marginfi.com/earn',
    category: 'lending',
    featured: false,
  },
  {
    id: 'raydium-meco-usdt',
    protocol: 'Raydium',
    protocolIcon: 'https://assets.coingecko.com/coins/images/13928/large/PSym7VQ.png',
    asset: 'MECO-USDT',
    assetIcon: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco.logo.png',
    apy: 15.5,
    minDeposit: 100,
    description: 'توفير سيولة لزوج MECO-USDT على Raydium. اربح رسوم التبادل من المجمع.',
    descriptionEn: 'Provide liquidity for MECO-USDT pair on Raydium. Earn trading fees from the pool.',
    url: 'https://raydium.io/liquidity/',
    category: 'liquidity-providing',
    featured: true,
  },
  {
    id: 'orca-sol-usdc',
    protocol: 'Orca',
    protocolIcon: 'https://assets.coingecko.com/coins/images/17547/large/Orca_Logo.png',
    asset: 'SOL-USDC',
    assetIcon: 'https://orca.so/favicon.ico',
    apy: 12.0,
    minDeposit: 50,
    description: 'توفير سيولة مركزة لزوج SOL-USDC على Orca. عوائد عالية مع تحكم أفضل في نطاق السعر.',
    descriptionEn: 'Provide concentrated liquidity for SOL-USDC pair on Orca. High yields with better price range control.',
    url: 'https://www.orca.so/pools',
    category: 'liquidity-providing',
    featured: false,
  },
];

const CATEGORIES = [
  { id: 'all', name: 'الكل', nameEn: 'All' },
  { id: 'liquid-staking', name: 'تخزين سائل', nameEn: 'Liquid Staking' },
  { id: 'lending', name: 'إقراض', nameEn: 'Lending' },
  { id: 'liquidity-providing', name: 'توفير سيولة', nameEn: 'Liquidity' },
];

export default function AppPortalScreen() {
  const { t, i18n } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';
  const isArabic = i18n.language === 'ar';

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const colors = {
    background: isDark ? '#0A0A0F' : '#F2F3F7',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#8E8E93',
    border: isDark ? '#2A2A3E' : '#E5E5EA',
    success: '#10B981',
    warning: '#F59E0B',
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

  const getFilteredOpportunities = useCallback(() => {
    if (selectedCategory === 'all') return EARNING_OPPORTUNITIES;
    return EARNING_OPPORTUNITIES.filter(opp => opp.category === selectedCategory);
  }, [selectedCategory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const renderOpportunityItem = ({ item }) => {
    const description = isArabic ? item.description : item.descriptionEn;
    const apyColor = item.apy > 10 ? colors.success : colors.warning;

    return (
      <TouchableOpacity
        style={[styles.opportunityCard, { backgroundColor: colors.card }]}
        onPress={() => openLink(item.url)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.protocolInfo}>
            <Image source={{ uri: item.protocolIcon }} style={styles.protocolIcon} />
            <View>
              <Text style={[styles.protocolName, { color: colors.text }]}>{item.protocol}</Text>
              <View style={styles.assetRow}>
                <Image source={{ uri: item.assetIcon }} style={styles.assetIcon} />
                <Text style={[styles.assetName, { color: colors.textSecondary }]}>{item.asset}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.apyBadge, { backgroundColor: primaryColor + '20' }]}>
            <Text style={[styles.apyText, { color: apyColor }]}>APY {item.apy}%</Text>
          </View>
        </View>
        
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
          {description}
        </Text>
        
        <View style={styles.cardFooter}>
          <View style={styles.minDeposit}>
            <Ionicons name="wallet-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.minDepositText, { color: colors.textSecondary }]}>
              الحد الأدنى: {item.minDeposit} {item.asset}
            </Text>
          </View>
          {item.featured && (
            <View style={[styles.featuredBadge, { backgroundColor: primaryColor + '20' }]}>
              <Ionicons name="star" size={12} color={primaryColor} />
              <Text style={[styles.featuredText, { color: primaryColor }]}>مميز</Text>
            </View>
          )}
        </View>
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

  const filteredOpportunities = getFilteredOpportunities();

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
              ? 'أفضل فرص التخزين والإقراض على Solana'
              : 'Top staking and lending opportunities on Solana'}
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

      {/* Disclaimer */}
      <View style={[styles.disclaimer, { backgroundColor: colors.warning + '15' }]}>
        <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
        <Text style={[styles.disclaimerText, { color: colors.warning }]}>
          {isArabic 
            ? 'سيتم توجيهك إلى الموقع الرسمي للبروتوكول. قم دائمًا بأبحاثك الخاصة (DYOR).'
            : 'You will be redirected to the official protocol. Always DYOR.'}
        </Text>
      </View>

      {/* Opportunities List */}
      <FlatList
        data={filteredOpportunities}
        renderItem={renderOpportunityItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="leaf-outline" size={50} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {isArabic ? 'لا توجد فرص في هذه الفئة' : 'No opportunities in this category'}
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
  disclaimer: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disclaimerText: { flex: 1, fontSize: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  opportunityCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  protocolInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  protocolIcon: { width: 40, height: 40, borderRadius: 20 },
  protocolName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assetIcon: { width: 16, height: 16, borderRadius: 8 },
  assetName: { fontSize: 13 },
  apyBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  apyText: { fontSize: 14, fontWeight: '700' },
  description: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  minDeposit: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  minDepositText: { fontSize: 12 },
  featuredBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  featuredText: { fontSize: 11, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { marginTop: 16, fontSize: 16 },
});
