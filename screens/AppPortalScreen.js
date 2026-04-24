import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Image, Linking, Platform, FlatList, RefreshControl,
  Modal, TextInput, Alert, ActivityIndicator, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

// ==================== بيانات الفرص الثابتة ====================
const EARNING_OPPORTUNITIES = [
  { id: 'marinade-sol', protocol: 'Marinade Finance', protocolIcon: 'https://assets.coingecko.com/coins/images/18612/large/mnde.png', asset: 'SOL', assetIcon: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', apy: 8.5, minDeposit: 0.1, description: 'تخزين سائل لـ SOL للحصول على mSOL.', descriptionEn: 'Liquid stake SOL to receive mSOL.', url: 'https://marinade.finance/app/staking', category: 'liquid-staking', featured: true },
  { id: 'jito-sol', protocol: 'Jito', protocolIcon: 'https://assets.coingecko.com/coins/images/33228/large/jto.png', asset: 'SOL', assetIcon: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', apy: 9.2, minDeposit: 0.1, description: 'تخزين SOL للحصول على JitoSOL.', descriptionEn: 'Stake SOL for JitoSOL.', url: 'https://jito.network/staking', category: 'liquid-staking', featured: true },
  { id: 'kamino-usdc', protocol: 'Kamino', protocolIcon: 'https://www.kamino.finance/favicon.ico', asset: 'USDC', assetIcon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png', apy: 8.0, minDeposit: 10, description: 'إقراض USDC في مجمعات سيولة آلية.', descriptionEn: 'Lend USDC in automated liquidity pools.', url: 'https://app.kamino.finance/lend', category: 'lending', featured: true },
  { id: 'drift-perps', protocol: 'Drift Protocol', protocolIcon: 'https://drift.foundation/favicon.ico', asset: 'SOL/USDC', assetIcon: 'https://drift.foundation/favicon.ico', apy: 12.0, minDeposit: 10, description: 'تداول دائم لامركزي على Solana.', descriptionEn: 'Decentralized perpetual trading on Solana.', url: 'https://app.drift.trade', category: 'trading', featured: true },
  { id: 'solend-lending', protocol: 'Solend', protocolIcon: 'https://solend.fi/favicon.ico', asset: 'USDC', assetIcon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png', apy: 5.0, minDeposit: 10, description: 'إقراض واقتراض لامركزي على Solana.', descriptionEn: 'Decentralized lending and borrowing on Solana.', url: 'https://solend.fi/dashboard', category: 'lending', featured: false },
  { id: 'meteora-lp', protocol: 'Meteora', protocolIcon: 'https://meteora.ag/favicon.ico', asset: 'SOL/USDC', assetIcon: 'https://meteora.ag/favicon.ico', apy: 20.0, minDeposit: 100, description: 'توفير سيولة ديناميكية على Solana.', descriptionEn: 'Dynamic liquidity provision on Solana.', url: 'https://app.meteora.ag', category: 'liquidity-providing', featured: true },
  { id: 'jupiter-swap', protocol: 'Jupiter', protocolIcon: 'https://jup.ag/favicon.ico', asset: 'SOL', assetIcon: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', apy: 0, minDeposit: 0, description: 'أفضل أسعار التبادل على Solana.', descriptionEn: 'Best swap prices on Solana.', url: 'https://jup.ag', category: 'trading', featured: true },
  { id: 'raydium-meco-usdt', protocol: 'Raydium', protocolIcon: 'https://assets.coingecko.com/coins/images/13928/large/PSym7VQ.png', asset: 'MECO-USDT', assetIcon: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco.logo.png', apy: 15.5, minDeposit: 100, description: 'توفير سيولة لزوج MECO-USDT على Raydium.', descriptionEn: 'Provide liquidity for MECO-USDT pair on Raydium.', url: 'https://raydium.io/liquidity/', category: 'liquidity-providing', featured: true, requiresVpn: true },
  { id: 'orca-meco-usdt', protocol: 'Orca', protocolIcon: 'https://assets.coingecko.com/coins/images/17547/large/Orca_Logo.png', asset: 'MECO-USDT', assetIcon: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco.logo.png', apy: 12.0, minDeposit: 50, description: 'توفير سيولة لزوج MECO-USDT على Orca.', descriptionEn: 'Provide liquidity for MECO-USDT pair on Orca.', url: 'https://www.orca.so/pools/EEPP9R7nHgMX1hC4s9NgLGXsyXYm7BzXuicwdRtjLCLC', category: 'liquidity-providing', featured: true, requiresVpn: true },
];

const BOOKMARKS_STORAGE_KEY = '@meco_bookmarks';

const SafeImage = ({ uri, style, defaultIcon = 'globe-outline', defaultColor = '#A0A0B0' }) => {
  const [error, setError] = useState(false);
  if (error || !uri) {
    return <View style={[style, { backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' }]}><Ionicons name={defaultIcon} size={style.width * 0.6} color={defaultColor} /></View>;
  }
  return <Image source={{ uri }} style={style} onError={() => setError(true)} />;
};

export default function AppPortalScreen() {
  const { t, i18n } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';
  const isArabic = i18n.language === 'ar';

  const [refreshing, setRefreshing] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newBookmark, setNewBookmark] = useState({ name: '', url: '', iconUrl: '' });
  const [activeView, setActiveView] = useState('all'); // 'all' or 'bookmarks'

  // 🌟 نظام التبويبات المتعددة (Multi-Tabs System)
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [inputUrl, setInputUrl] = useState('');
  const [loadingWeb, setLoadingWeb] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [tabsOverviewVisible, setTabsOverviewVisible] = useState(false);

  const webviewRefs = useRef({});

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

  useEffect(() => { loadBookmarks(); }, []);

  const loadBookmarks = async () => {
    try {
      const stored = await AsyncStorage.getItem(BOOKMARKS_STORAGE_KEY);
      if (stored) setBookmarks(JSON.parse(stored));
    } catch (e) {} finally { setLoadingBookmarks(false); }
  };

  const saveBookmarks = async (newBookmarks) => {
    try {
      await AsyncStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(newBookmarks));
      setBookmarks(newBookmarks);
    } catch (e) {}
  };

  const handleAddBookmark = async () => {
    if (!newBookmark.name.trim() || !newBookmark.url.trim()) return;
    let formattedUrl = newBookmark.url.trim();
    if (!formattedUrl.startsWith('http')) formattedUrl = 'https://' + formattedUrl;
    const newItem = { id: Date.now().toString(), name: newBookmark.name.trim(), url: formattedUrl, iconUrl: newBookmark.iconUrl.trim() || null };
    await saveBookmarks([newItem, ...bookmarks]);
    setNewBookmark({ name: '', url: '', iconUrl: '' });
    setAddModalVisible(false);
  };

  const handleDeleteBookmark = (id) => {
    const updated = bookmarks.filter(item => item.id !== id);
    saveBookmarks(updated);
  };

  const openNewTab = (url) => {
    const newId = Date.now().toString();
    const newTab = { id: newId, url: url, title: 'Loading...', canGoBack: false, canGoForward: false };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
    setInputUrl(url);
    setTabsOverviewVisible(false);
  };

  const closeTab = (id) => {
    const filtered = tabs.filter(t => t.id !== id);
    setTabs(filtered);
    if (activeTabId === id) {
      if (filtered.length > 0) {
        const lastTab = filtered[filtered.length - 1];
        setActiveTabId(lastTab.id);
        setInputUrl(lastTab.url);
      } else {
        setActiveTabId(null);
        setInputUrl('');
        setTabsOverviewVisible(false);
      }
    }
  };

  const switchTab = (id) => {
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      setActiveTabId(id);
      setInputUrl(tab.url);
      setTabsOverviewVisible(false);
    }
  };

  const handleSearchSubmit = () => {
    let formatted = inputUrl.trim();
    if (!formatted) return;
    if (!formatted.startsWith('http') && !formatted.includes('.')) {
      formatted = `https://www.google.com/search?q=${encodeURIComponent(formatted)}`;
    } else if (!formatted.startsWith('http')) {
      formatted = `https://${formatted}`;
    }
    Keyboard.dismiss();
    if (activeTabId) {
      setTabs(tabs.map(t => t.id === activeTabId ? { ...t, url: formatted } : t));
    } else {
      openNewTab(formatted);
    }
  };

  const activeTabDetails = tabs.find(t => t.id === activeTabId);

  const renderOpportunityItem = ({ item }) => (
    <TouchableOpacity style={[styles.opportunityCard, { backgroundColor: colors.card }]} onPress={() => openNewTab(item.url)} activeOpacity={0.8}>
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
        {item.apy > 0 && (
          <View style={[styles.apyBadge, { backgroundColor: primaryColor + '20' }]}>
            <Text style={[styles.apyText, { color: item.apy > 10 ? colors.success : colors.warning }]}>APY {item.apy}%</Text>
          </View>
        )}
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>{isArabic ? item.description : item.descriptionEn}</Text>
      {item.requiresVpn && (
        <View style={styles.vpnWarning}>
          <Ionicons name="warning-outline" size={14} color={colors.warning} />
          <Text style={[styles.vpnWarningText, { color: colors.warning }]}>
            {isArabic ? 'قد يتطلب هذا الموقع استخدام VPN للوصول إليه' : 'This site may require a VPN to access'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderBookmarkItem = ({ item }) => (
    <TouchableOpacity style={[styles.bookmarkCard, { backgroundColor: colors.card }]} onPress={() => openNewTab(item.url)} onLongPress={() => handleDeleteBookmark(item.id)} delayLongPress={500}>
      <SafeImage uri={item.iconUrl} style={styles.bookmarkIcon} defaultIcon="link-outline" defaultColor={primaryColor} />
      <View style={styles.bookmarkInfo}>
        <Text style={[styles.bookmarkName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.bookmarkUrl, { color: colors.textSecondary }]} numberOfLines={1}>{item.url.replace(/^https?:\/\//, '')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 50 : 30 }]}>
      
      {/* 🌟 الشريط العلوي المتطور (Browser Header) */}
      <View style={styles.topHeaderRow}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setActiveTabId(null)}>
          <Ionicons name={activeTabId ? "home-outline" : "home"} size={22} color={activeTabId ? colors.textSecondary : primaryColor} />
        </TouchableOpacity>

        <View style={[styles.urlBarContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginLeft: 10 }} />
          <TextInput
            style={[styles.urlInput, { color: colors.text }]}
            placeholder={isArabic ? 'ابحث أو أدخل رابط...' : 'Search or enter URL...'}
            placeholderTextColor={colors.textSecondary}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={handleSearchSubmit}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="go"
          />
          {activeTabId && (
            <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.dotsInsideInput}>
              <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={[styles.tabsBadgeContainer, { borderColor: colors.border }]} onPress={() => {if(tabs.length > 0) setTabsOverviewVisible(true)}}>
          <Text style={[styles.tabsBadgeText, { color: colors.text }]}>{tabs.length}</Text>
        </TouchableOpacity>
      </View>

      {/* 🌟 القائمة المنسدلة للخيارات */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={styles.menuOverlay}>
            <View style={[styles.menuContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); if(activeTabDetails?.canGoBack) webviewRefs.current[activeTabId]?.goBack(); }}>
                <Ionicons name="arrow-back" size={20} color={activeTabDetails?.canGoBack ? colors.text : colors.textSecondary} />
                <Text style={[styles.menuText, { color: activeTabDetails?.canGoBack ? colors.text : colors.textSecondary }]}>{isArabic ? 'رجوع للخلف' : 'Back'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); if(activeTabDetails?.canGoForward) webviewRefs.current[activeTabId]?.goForward(); }}>
                <Ionicons name="arrow-forward" size={20} color={activeTabDetails?.canGoForward ? colors.text : colors.textSecondary} />
                <Text style={[styles.menuText, { color: activeTabDetails?.canGoForward ? colors.text : colors.textSecondary }]}>{isArabic ? 'تقدم للأمام' : 'Forward'}</Text>
              </TouchableOpacity>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); webviewRefs.current[activeTabId]?.reload(); }}>
                <Ionicons name="refresh" size={20} color={colors.text} />
                <Text style={[styles.menuText, { color: colors.text }]}>{isArabic ? 'تحديث الصفحة' : 'Reload'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { 
                  setMenuVisible(false); 
                  setNewBookmark({ name: activeTabDetails?.title || '', url: activeTabDetails?.url || '', iconUrl: '' });
                  setAddModalVisible(true); 
              }}>
                <Ionicons name="star-outline" size={20} color={colors.warning} />
                <Text style={[styles.menuText, { color: colors.text }]}>{isArabic ? 'إضافة للمفضلة' : 'Add Bookmark'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 🌟 شاشة إدارة التبويبات المفتوحة (Tabs Overview) */}
      <Modal visible={tabsOverviewVisible} animationType="slide" onRequestClose={() => setTabsOverviewVisible(false)}>
        <View style={[styles.tabsOverviewContainer, { backgroundColor: colors.background }]}>
          <View style={styles.tabsOverviewHeader}>
            <Text style={[styles.tabsOverviewTitle, { color: colors.text }]}>{isArabic ? 'التبويبات المفتوحة' : 'Open Tabs'}</Text>
            <TouchableOpacity onPress={() => {setTabsOverviewVisible(false); if(!activeTabId) setActiveTabId(tabs[0]?.id);}}>
              <Ionicons name="close" size={28} color={colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={tabs}
            numColumns={2}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 10 }}
            renderItem={({ item }) => (
              <View style={[styles.tabPreviewCard, { backgroundColor: colors.card, borderColor: item.id === activeTabId ? primaryColor : colors.border }]}>
                <View style={styles.tabPreviewHeader}>
                  <Text style={[styles.tabPreviewTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                  <TouchableOpacity onPress={() => closeTab(item.id)} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.tabPreviewBody} onPress={() => switchTab(item.id)}>
                  <Ionicons name="globe-outline" size={40} color={colors.textSecondary + '50'} />
                </TouchableOpacity>
              </View>
            )}
          />
          <TouchableOpacity style={[styles.newTabBtn, { backgroundColor: primaryColor }]} onPress={() => {setTabsOverviewVisible(false); setActiveTabId(null); setInputUrl('');}}>
            <Ionicons name="add" size={24} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: 'bold', marginLeft: 8 }}>{isArabic ? 'علامة تبويب جديدة' : 'New Tab'}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* 🌟 منطقة العرض (متصفح أو رئيسية) */}
      <View style={{ flex: 1 }}>
        {activeTabId ? (
          tabs.map(tab => (
            <View key={tab.id} style={{ flex: 1, display: tab.id === activeTabId ? 'flex' : 'none' }}>
              {loadingWeb && tab.id === activeTabId && (
                <View style={[styles.browserLoader, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={primaryColor} /></View>
              )}
              <WebView
                ref={el => webviewRefs.current[tab.id] = el}
                source={{ uri: tab.url }}
                style={{ flex: 1 }}
                onLoadStart={() => { if(tab.id === activeTabId) setLoadingWeb(true); }}
                onLoadEnd={() => { if(tab.id === activeTabId) setLoadingWeb(false); }}
                onNavigationStateChange={(navState) => {
                  setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, url: navState.url, title: navState.title || t.title, canGoBack: navState.canGoBack, canGoForward: navState.canGoForward } : t));
                  if (tab.id === activeTabId) setInputUrl(navState.url);
                }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
              />
            </View>
          ))
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={[styles.banner, { backgroundColor: colors.banner }]}>
              <View style={styles.bannerContent}>
                <Text style={styles.bannerTitle}>{isArabic ? 'استكشف Web3' : 'Explore Web3'}</Text>
                <Text style={styles.bannerSubtitle}>{isArabic ? 'أفضل فرص التخزين والإقراض على Solana' : 'Top staking and lending opportunities'}</Text>
              </View>
              <Ionicons name="compass-outline" size={60} color="rgba(255,255,255,0.2)" style={styles.bannerIcon} />
            </View>

            {/* 🌟 تبويبات "كل التطبيقات" و"المفضلة" */}
            <View style={[styles.tabSwitchContainer, { backgroundColor: colors.card }]}>
              <TouchableOpacity
                style={[styles.tabSwitchItem, activeView === 'all' && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
                onPress={() => setActiveView('all')}
              >
                <Text style={[styles.tabSwitchText, { color: activeView === 'all' ? primaryColor : colors.textSecondary }]}>
                  {isArabic ? 'كل التطبيقات' : 'All Apps'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabSwitchItem, activeView === 'bookmarks' && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
                onPress={() => setActiveView('bookmarks')}
              >
                <Text style={[styles.tabSwitchText, { color: activeView === 'bookmarks' ? primaryColor : colors.textSecondary }]}>
                  {isArabic ? 'المفضلة' : 'Bookmarks'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* المحتوى حسب التبويب النشط */}
            {activeView === 'all' ? (
              <>
                <FlatList 
                  data={EARNING_OPPORTUNITIES} 
                  renderItem={renderOpportunityItem} 
                  keyExtractor={item => item.id} 
                  scrollEnabled={false} 
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 50 }} 
                />
              </>
            ) : (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>{isArabic ? 'مفضلتك' : 'Your Bookmarks'}</Text>
                </View>
                
                {loadingBookmarks ? (
                  <ActivityIndicator size="small" color={primaryColor} style={{ marginVertical: 20 }} />
                ) : bookmarks.length > 0 ? (
                  <FlatList 
                    data={bookmarks} 
                    renderItem={renderBookmarkItem} 
                    keyExtractor={item => item.id} 
                    scrollEnabled={false} 
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 50 }} 
                  />
                ) : (
                  <View style={[styles.emptyBookmarks, { backgroundColor: colors.card }]}>
                    <Ionicons name="bookmark-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.emptyBookmarksText, { color: colors.textSecondary }]}>
                      {isArabic ? 'لا توجد مفضلة بعد' : 'No bookmarks yet'}
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

      {/* نافذة الإضافة للمفضلة */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{isArabic ? 'إضافة للمفضلة' : 'Add Bookmark'}</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Name" placeholderTextColor={colors.textSecondary} value={newBookmark.name} onChangeText={(text) => setNewBookmark(prev => ({ ...prev, name: text }))} />
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="URL" placeholderTextColor={colors.textSecondary} value={newBookmark.url} onChangeText={(text) => setNewBookmark(prev => ({ ...prev, url: text }))} keyboardType="url" autoCapitalize="none" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setAddModalVisible(false)}><Text style={{ color: colors.textSecondary }}>{isArabic ? 'إلغاء' : 'Cancel'}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: primaryColor }]} onPress={handleAddBookmark}><Text style={{ color: '#FFF' }}>{isArabic ? 'حفظ' : 'Save'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 10, gap: 10 },
  headerBtn: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(128,128,128,0.1)' },
  urlBarContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, height: 45 },
  urlInput: { flex: 1, paddingHorizontal: 10, fontSize: 14, height: '100%' },
  dotsInsideInput: { paddingHorizontal: 10, height: '100%', justifyContent: 'center' },
  tabsBadgeContainer: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  tabsBadgeText: { fontSize: 14, fontWeight: 'bold' },
  menuOverlay: { flex: 1, backgroundColor: 'transparent' },
  menuContent: { position: 'absolute', top: Platform.OS === 'ios' ? 95 : 75, right: 60, width: 180, borderRadius: 12, borderWidth: 1, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  menuText: { fontSize: 16, fontWeight: '500' },
  menuDivider: { height: 1, marginHorizontal: 10 },
  tabsOverviewContainer: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  tabsOverviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  tabsOverviewTitle: { fontSize: 24, fontWeight: 'bold' },
  tabPreviewCard: { flex: 1, margin: 8, borderRadius: 16, borderWidth: 2, height: 180, overflow: 'hidden' },
  tabPreviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.2)' },
  tabPreviewTitle: { flex: 1, fontSize: 12, fontWeight: 'bold' },
  tabPreviewBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  newTabBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 30, elevation: 5 },
  browserLoader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  banner: { marginHorizontal: 20, marginBottom: 20, borderRadius: 20, padding: 20, overflow: 'hidden' },
  bannerContent: { zIndex: 2 },
  bannerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 6 },
  bannerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  bannerIcon: { position: 'absolute', right: -10, bottom: -10, zIndex: 1 },
  tabSwitchContainer: { flexDirection: 'row', marginHorizontal: 20, borderRadius: 16, marginBottom: 16, paddingHorizontal: 8 },
  tabSwitchItem: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabSwitchText: { fontSize: 16, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  opportunityCard: { borderRadius: 16, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  protocolInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  protocolIcon: { width: 40, height: 40, borderRadius: 20 },
  protocolName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assetIcon: { width: 16, height: 16, borderRadius: 8 },
  assetName: { fontSize: 13 },
  apyBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  apyText: { fontSize: 14, fontWeight: '700' },
  description: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  vpnWarning: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 8 },
  vpnWarningText: { fontSize: 12, fontWeight: '500' },
  bookmarkCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8 },
  bookmarkIcon: { width: 36, height: 36, borderRadius: 8, marginRight: 12 },
  bookmarkInfo: { flex: 1, marginRight: 8 },
  bookmarkName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  bookmarkUrl: { fontSize: 12 },
  emptyBookmarks: { padding: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12, marginHorizontal: 20 },
  emptyBookmarksText: { marginTop: 8, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  modalButton: { padding: 12, borderRadius: 12, minWidth: 100, alignItems: 'center' },
});
