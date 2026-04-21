import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Image, Linking, Platform, FlatList, RefreshControl,
  Modal, TextInput, Alert, ActivityIndicator
} from 'react-native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// مفتاح AsyncStorage لحفظ المفضلة
const BOOKMARKS_STORAGE_KEY = '@meco_bookmarks';

// مكون صورة مع معالجة الخطأ (أيقونة افتراضية)
const SafeImage = ({ uri, style, defaultIcon = 'globe-outline', defaultColor = '#A0A0B0' }) => {
  const [error, setError] = useState(false);
  
  if (error || !uri) {
    return (
      <View style={[style, { backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name={defaultIcon} size={style.width * 0.6} color={defaultColor} />
      </View>
    );
  }
  
  return (
    <Image 
      source={{ uri }} 
      style={style} 
      onError={() => setError(true)}
    />
  );
};

export default function AppPortalScreen() {
  const { t, i18n } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';
  const isArabic = i18n.language === 'ar';

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  
  // حالة المفضلة الشخصية
  const [bookmarks, setBookmarks] = useState([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(true);
  
  // حالة النافذة المنبثقة للإضافة
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newBookmark, setNewBookmark] = useState({ name: '', url: '', iconUrl: '' });
  const [submitting, setSubmitting] = useState(false);

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

  // تحميل المفضلة عند بدء التشغيل
  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    try {
      const stored = await AsyncStorage.getItem(BOOKMARKS_STORAGE_KEY);
      if (stored) {
        setBookmarks(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    } finally {
      setLoadingBookmarks(false);
    }
  };

  const saveBookmarks = async (newBookmarks) => {
    try {
      await AsyncStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(newBookmarks));
      setBookmarks(newBookmarks);
    } catch (error) {
      Alert.alert('خطأ', 'فشل حفظ المفضلة');
    }
  };

  const handleAddBookmark = async () => {
    const { name, url, iconUrl } = newBookmark;
    
    if (!name.trim() || !url.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال الاسم والرابط على الأقل');
      return;
    }
    
    // التأكد من أن الرابط يبدأ بـ http/https
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }
    
    setSubmitting(true);
    const newItem = {
      id: Date.now().toString(),
      name: name.trim(),
      url: formattedUrl,
      iconUrl: iconUrl.trim() || null,
      createdAt: new Date().toISOString(),
    };
    
    const updated = [newItem, ...bookmarks];
    await saveBookmarks(updated);
    
    setNewBookmark({ name: '', url: '', iconUrl: '' });
    setAddModalVisible(false);
    setSubmitting(false);
  };

  const handleDeleteBookmark = (id) => {
    Alert.alert(
      'حذف المفضلة',
      'هل أنت متأكد من حذف هذا العنصر؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { 
          text: 'حذف', 
          style: 'destructive',
          onPress: async () => {
            const updated = bookmarks.filter(item => item.id !== id);
            await saveBookmarks(updated);
          }
        }
      ]
    );
  };

  const openLink = async (url) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('خطأ', 'لا يمكن فتح الرابط');
      }
    } catch (error) {
      Alert.alert('خطأ', 'حدث خطأ أثناء محاولة فتح الرابط');
    }
  };

  const getFilteredOpportunities = useCallback(() => {
    if (selectedCategory === 'all') return EARNING_OPPORTUNITIES;
    return EARNING_OPPORTUNITIES.filter(opp => opp.category === selectedCategory);
  }, [selectedCategory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBookmarks();
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
            <SafeImage uri={item.protocolIcon} style={styles.protocolIcon} defaultIcon="business-outline" />
            <View>
              <Text style={[styles.protocolName, { color: colors.text }]}>{item.protocol}</Text>
              <View style={styles.assetRow}>
                <SafeImage uri={item.assetIcon} style={styles.assetIcon} defaultIcon="cash-outline" />
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

  const renderBookmarkItem = ({ item }) => {
    return (
      <TouchableOpacity
        style={[styles.bookmarkCard, { backgroundColor: colors.card }]}
        onPress={() => openLink(item.url)}
        onLongPress={() => handleDeleteBookmark(item.id)}
        activeOpacity={0.8}
        delayLongPress={500}
      >
        <SafeImage uri={item.iconUrl} style={styles.bookmarkIcon} defaultIcon="link-outline" defaultColor={primaryColor} />
        <View style={styles.bookmarkInfo}>
          <Text style={[styles.bookmarkName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.bookmarkUrl, { color: colors.textSecondary }]} numberOfLines={1}>{item.url.replace(/^https?:\/\//, '')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
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

      {/* الفرص الموصى بها + المفضلة */}
      <FlatList
        data={filteredOpportunities}
        renderItem={renderOpportunityItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
        }
        ListHeaderComponent={
          <>
            {/* قسم المفضلة (يظهر أعلى الفرص) */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {isArabic ? 'مفضلتك' : 'Your Bookmarks'}
              </Text>
              <TouchableOpacity onPress={() => setAddModalVisible(true)} style={styles.addButton}>
                <Ionicons name="add-circle" size={24} color={primaryColor} />
              </TouchableOpacity>
            </View>
            
            {loadingBookmarks ? (
              <View style={styles.loadingBookmarks}>
                <ActivityIndicator size="small" color={primaryColor} />
              </View>
            ) : bookmarks.length > 0 ? (
              <FlatList
                data={bookmarks}
                renderItem={renderBookmarkItem}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                contentContainerStyle={{ marginBottom: 8 }}
              />
            ) : (
              <View style={[styles.emptyBookmarks, { backgroundColor: colors.card }]}>
                <Ionicons name="bookmark-outline" size={32} color={colors.textSecondary} />
                <Text style={[styles.emptyBookmarksText, { color: colors.textSecondary }]}>
                  {isArabic 
                    ? 'اضغط على + لإضافة مواقعك المفضلة'
                    : 'Tap + to add your favorite sites'}
                </Text>
              </View>
            )}
            
            {/* فاصل بين المفضلة والفرص */}
            <View style={styles.divider} />
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>
              {isArabic ? 'الفرص الموصى بها' : 'Recommended Opportunities'}
            </Text>
          </>
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

      {/* نافذة إضافة مفضلة */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {isArabic ? 'إضافة إلى المفضلة' : 'Add Bookmark'}
            </Text>
            
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={isArabic ? 'الاسم (مثال: Jupiter)' : 'Name (e.g., Jupiter)'}
              placeholderTextColor={colors.textSecondary}
              value={newBookmark.name}
              onChangeText={(text) => setNewBookmark(prev => ({ ...prev, name: text }))}
            />
            
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={isArabic ? 'الرابط (https://...)' : 'URL (https://...)'}
              placeholderTextColor={colors.textSecondary}
              value={newBookmark.url}
              onChangeText={(text) => setNewBookmark(prev => ({ ...prev, url: text }))}
              autoCapitalize="none"
              keyboardType="url"
            />
            
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={isArabic ? 'رابط الأيقونة (اختياري)' : 'Icon URL (optional)'}
              placeholderTextColor={colors.textSecondary}
              value={newBookmark.iconUrl}
              onChangeText={(text) => setNewBookmark(prev => ({ ...prev, iconUrl: text }))}
              autoCapitalize="none"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: 'transparent' }]} 
                onPress={() => setAddModalVisible(false)}
                disabled={submitting}
              >
                <Text style={{ color: colors.textSecondary }}>{isArabic ? 'إلغاء' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: primaryColor }]} 
                onPress={handleAddBookmark}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: '600' }}>{isArabic ? 'إضافة' : 'Add'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  addButton: { padding: 4 },
  bookmarkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  bookmarkIcon: { width: 36, height: 36, borderRadius: 8, marginRight: 12 },
  bookmarkInfo: { flex: 1, marginRight: 8 },
  bookmarkName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  bookmarkUrl: { fontSize: 12 },
  emptyBookmarks: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyBookmarksText: { marginTop: 8, fontSize: 14, textAlign: 'center' },
  loadingBookmarks: { paddingVertical: 16, alignItems: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(128,128,128,0.2)', marginVertical: 16 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  modalButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, minWidth: 100, alignItems: 'center' },
});
