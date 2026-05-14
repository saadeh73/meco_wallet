import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Image, Platform, FlatList, ActivityIndicator,
  Modal, TextInput, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

// ==================== بيانات الفرص (سيتم ترجمتها في الواجهة) ====================
const EARNING_OPPORTUNITIES = [
  { id: 'marinade-sol', protocol: 'Marinade Finance', protocolIcon: 'https://assets.coingecko.com/coins/images/18612/large/mnde.png', asset: 'SOL', apy: 8.5, url: 'https://marinade.finance/app/staking', category: 'staking', featured: true, descKey: 'desc_marinade' },
  { id: 'jito-sol', protocol: 'Jito', protocolIcon: 'https://assets.coingecko.com/coins/images/33228/large/jto.png', asset: 'SOL', apy: 9.2, url: 'https://jito.network/staking', category: 'staking', featured: true, descKey: 'desc_jito' },
  { id: 'meteora-lp', protocol: 'Meteora', protocolIcon: 'https://meteora.ag/favicon.ico', asset: 'SOL/USDC', apy: 20.0, url: 'https://app.meteora.ag', category: 'defi', featured: true, descKey: 'desc_meteora' },
  { id: 'jupiter-swap', protocol: 'Jupiter', protocolIcon: 'https://jup.ag/favicon.ico', asset: 'SOL', apy: 0, url: 'https://jup.ag', category: 'trading', featured: true, descKey: 'desc_jupiter' },
  { id: 'kamino-usdc', protocol: 'Kamino', protocolIcon: 'https://www.kamino.finance/favicon.ico', asset: 'USDC', apy: 8.0, url: 'https://app.kamino.finance/lend', category: 'defi', featured: false, descKey: 'desc_kamino' },
  { id: 'drift-perps', protocol: 'Drift Protocol', protocolIcon: 'https://drift.foundation/favicon.ico', asset: 'SOL/USDC', apy: 12.0, url: 'https://app.drift.trade', category: 'trading', featured: false, descKey: 'desc_drift' },
  { id: 'solend-lending', protocol: 'Solend', protocolIcon: 'https://solend.fi/favicon.ico', asset: 'USDC', apy: 5.0, url: 'https://solend.fi/dashboard', category: 'defi', featured: false, descKey: 'desc_solend' },
  { id: 'raydium-meco-usdt', protocol: 'Raydium', protocolIcon: 'https://assets.coingecko.com/coins/images/13928/large/PSym7VQ.png', asset: 'MECO-USDT', apy: 15.5, url: 'https://raydium.io/liquidity/', category: 'pools', featured: false, requiresVpn: true, descKey: 'desc_raydium' },
  { id: 'orca-meco-usdt', protocol: 'Orca', protocolIcon: 'https://assets.coingecko.com/coins/images/17547/large/Orca_Logo.png', asset: 'MECO-USDT', apy: 12.0, url: 'https://www.orca.so/pools/EEPP9R7nHgMX1hC4s9NgLGXsyXYm7BzXuicwdRtjLCLC', category: 'pools', featured: false, requiresVpn: true, descKey: 'desc_orca' },
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
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const [bookmarks, setBookmarks] = useState([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newBookmark, setNewBookmark] = useState({ name: '', url: '', iconUrl: '' });
  const [activeView, setActiveView] = useState('explore'); // 'explore' or 'bookmarks'

  // Browser Tabs State
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
    const newTab = { id: newId, url: url, title: t('loading_page', 'جاري التحميل...'), canGoBack: false, canGoForward: false };
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

  // تصنيف التطبيقات
  const featuredApps = EARNING_OPPORTUNITIES.filter(app => app.featured);
  const categories = [
    { id: 'staking', title: t('category_staking', 'تخزين (Staking)'), data: EARNING_OPPORTUNITIES.filter(app => app.category === 'staking') },
    { id: 'defi', title: t('category_defi', 'تمويل لامركزي (DeFi)'), data: EARNING_OPPORTUNITIES.filter(app => app.category === 'defi') },
    { id: 'trading', title: t('category_trading', 'تداول (Trading)'), data: EARNING_OPPORTUNITIES.filter(app => app.category === 'trading') },
    { id: 'pools', title: t('category_pools', 'مجمعات سيولة (Pools)'), data: EARNING_OPPORTUNITIES.filter(app => app.category === 'pools') },
  ];

  // 🎨 تصميم بطاقة البانر (Featured)
  const renderFeaturedCard = ({ item }) => (
    <TouchableOpacity style={[styles.featuredCard, { backgroundColor: colors.card }]} onPress={() => openNewTab(item.url)} activeOpacity={0.9}>
      <View style={styles.featuredHeader}>
        <SafeImage uri={item.protocolIcon} style={styles.featuredIcon} defaultIcon="business-outline" />
        {item.apy > 0 && (
          <View style={[styles.apyBadge, { backgroundColor: primaryColor + '20' }]}>
            <Text style={[styles.apyText, { color: primaryColor }]}>{t('up_to')} {item.apy}%</Text>
          </View>
        )}
      </View>
      <Text style={[styles.featuredTitle, { color: colors.text }]} numberOfLines={1}>{item.protocol}</Text>
      <Text style={[styles.featuredDesc, { color: colors.textSecondary }]} numberOfLines={2}>{t(item.descKey)}</Text>
    </TouchableOpacity>
  );

  // 🎨 تصميم البطاقة المربعة للشبكة (Grid App Card)
  const renderAppCard = ({ item }) => (
    <TouchableOpacity style={[styles.appCard, { backgroundColor: colors.card }]} onPress={() => openNewTab(item.url)} activeOpacity={0.8}>
      <SafeImage uri={item.protocolIcon} style={styles.appIcon} defaultIcon="globe-outline" />
      <Text style={[styles.appName, { color: colors.text }]} numberOfLines={1}>{item.protocol}</Text>
      <Text style={[styles.appDesc, { color: colors.textSecondary }]} numberOfLines={1}>{item.asset}</Text>
      {item.requiresVpn && (
         <Ionicons name="warning" size={14} color={colors.warning} style={styles.vpnIcon} />
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
      
      {/* Browser Header */}
      <View style={styles.topHeaderRow}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setActiveTabId(null)}>
          <Ionicons name={activeTabId ? "home-outline" : "home"} size={22} color={activeTabId ? colors.textSecondary : primaryColor} />
        </TouchableOpacity>

        <View style={[styles.urlBarContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginLeft: 10 }} />
          <TextInput
            style={[styles.urlInput, { color: colors.text }]}
            placeholder={t('browser_search_placeholder', 'Search or enter URL...')}
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

      {/* Browser Menu Modal */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={styles.menuOverlay}>
            <View style={[styles.menuContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); if(activeTabDetails?.canGoBack) webviewRefs.current[activeTabId]?.goBack(); }}>
                <Ionicons name="arrow-back" size={20} color={activeTabDetails?.canGoBack ? colors.text : colors.textSecondary} />
                <Text style={[styles.menuText, { color: activeTabDetails?.canGoBack ? colors.text : colors.textSecondary }]}>{t('browser_back', 'Back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); if(activeTabDetails?.canGoForward) webviewRefs.current[activeTabId]?.goForward(); }}>
                <Ionicons name="arrow-forward" size={20} color={activeTabDetails?.canGoForward ? colors.text : colors.textSecondary} />
                <Text style={[styles.menuText, { color: activeTabDetails?.canGoForward ? colors.text : colors.textSecondary }]}>{t('browser_forward', 'Forward')}</Text>
              </TouchableOpacity>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); webviewRefs.current[activeTabId]?.reload(); }}>
                <Ionicons name="refresh" size={20} color={colors.text} />
                <Text style={[styles.menuText, { color: colors.text }]}>{t('browser_reload', 'Reload')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { 
                  setMenuVisible(false); 
                  setNewBookmark({ name: activeTabDetails?.title || '', url: activeTabDetails?.url || '', iconUrl: '' });
                  setAddModalVisible(true); 
              }}>
                <Ionicons name="star-outline" size={20} color={colors.warning} />
                <Text style={[styles.menuText, { color: colors.text }]}>{t('add_bookmark', 'Add Bookmark')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Tabs Overview Modal */}
      <Modal visible={tabsOverviewVisible} animationType="slide" onRequestClose={() => setTabsOverviewVisible(false)}>
        <View style={[styles.tabsOverviewContainer, { backgroundColor: colors.background }]}>
          <View style={styles.tabsOverviewHeader}>
            <Text style={[styles.tabsOverviewTitle, { color: colors.text }]}>{t('open_tabs', 'Open Tabs')}</Text>
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
            <Text style={{ color: '#FFF', fontWeight: 'bold', marginLeft: 8 }}>{t('new_tab', 'New Tab')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Main Content Area */}
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
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>
            
            <View style={styles.headerWelcome}>
               <Text style={[styles.welcomeTitle, { color: colors.text }]}>{t('explore_web3', 'استكشف Web3')}</Text>
               <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>{t('explore_desc', 'أفضل التطبيقات اللامركزية بين يديك')}</Text>
            </View>

            {/* Tab Switches (Explore / Bookmarks) */}
            <View style={[styles.tabSwitchContainer, { backgroundColor: colors.card }]}>
              <TouchableOpacity style={[styles.tabSwitchItem, activeView === 'explore' && { backgroundColor: primaryColor }]} onPress={() => setActiveView('explore')}>
                <Text style={[styles.tabSwitchText, { color: activeView === 'explore' ? '#FFF' : colors.textSecondary }]}>{t('discover', 'استكشف')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tabSwitchItem, activeView === 'bookmarks' && { backgroundColor: primaryColor }]} onPress={() => setActiveView('bookmarks')}>
                <Text style={[styles.tabSwitchText, { color: activeView === 'bookmarks' ? '#FFF' : colors.textSecondary }]}>{t('bookmarks', 'المفضلة')}</Text>
              </TouchableOpacity>
            </View>

            {activeView === 'explore' ? (
              <>
                {/* 🎨 Featured Apps (Hero Carousel) */}
                <View style={styles.sectionContainer}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('featured_apps', 'تطبيقات مميزة')}</Text>
                  <FlatList
                    data={featuredApps}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={item => item.id}
                    renderItem={renderFeaturedCard}
                    contentContainerStyle={{ paddingHorizontal: 20 }}
                  />
                </View>

                {/* 🎨 Grid Categories */}
                {categories.map((category) => (
                   category.data.length > 0 && (
                    <View key={category.id} style={styles.sectionContainer}>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>{category.title}</Text>
                      <FlatList
                        data={category.data}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={item => item.id}
                        renderItem={renderAppCard}
                        contentContainerStyle={{ paddingHorizontal: 20 }}
                      />
                    </View>
                   )
                ))}
              </>
            ) : (
              // Bookmarks View
              <>
                {loadingBookmarks ? (
                  <ActivityIndicator size="small" color={primaryColor} style={{ marginTop: 50 }} />
                ) : bookmarks.length > 0 ? (
                  <View style={{ paddingHorizontal: 20 }}>
                     {bookmarks.map(item => <React.Fragment key={item.id}>{renderBookmarkItem({item})}</React.Fragment>)}
                  </View>
                ) : (
                  <View style={[styles.emptyBookmarks, { backgroundColor: colors.card }]}>
                    <Ionicons name="bookmark-outline" size={48} color={colors.textSecondary} />
                    <Text style={[styles.emptyBookmarksText, { color: colors.textSecondary }]}>{t('no_bookmarks_yet', 'لا توجد مفضلة بعد')}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

      {/* Add Bookmark Modal */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('add_bookmark', 'إضافة للمفضلة')}</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder={t('bookmark_name_placeholder', "Name")} placeholderTextColor={colors.textSecondary} value={newBookmark.name} onChangeText={(text) => setNewBookmark(prev => ({ ...prev, name: text }))} />
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder={t('bookmark_url_placeholder', "URL")} placeholderTextColor={colors.textSecondary} value={newBookmark.url} onChangeText={(text) => setNewBookmark(prev => ({ ...prev, url: text }))} keyboardType="url" autoCapitalize="none" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setAddModalVisible(false)}><Text style={{ color: colors.textSecondary }}>{t('cancel', 'إلغاء')}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: primaryColor }]} onPress={handleAddBookmark}><Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t('save', 'حفظ')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 10, gap: 10 },
  headerBtn: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(128,128,128,0.1)' },
  urlBarContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, height: 45 },
  urlInput: { flex: 1, paddingHorizontal: 10, fontSize: 14, height: '100%' },
  dotsInsideInput: { paddingHorizontal: 10, height: '100%', justifyContent: 'center' },
  tabsBadgeContainer: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  tabsBadgeText: { fontSize: 14, fontWeight: 'bold' },
  
  headerWelcome: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },
  welcomeTitle: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  welcomeSubtitle: { fontSize: 14, fontWeight: '500' },

  tabSwitchContainer: { flexDirection: 'row', marginHorizontal: 20, borderRadius: 20, marginBottom: 20, padding: 4 },
  tabSwitchItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 16 },
  tabSwitchText: { fontSize: 14, fontWeight: '700' },

  sectionContainer: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },

  // App Store Style Cards
  featuredCard: { width: width * 0.75, borderRadius: 24, padding: 20, marginRight: 15, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
  featuredHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  featuredIcon: { width: 56, height: 56, borderRadius: 18 },
  apyBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  apyText: { fontSize: 12, fontWeight: '800' },
  featuredTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  featuredDesc: { fontSize: 13, lineHeight: 18 },

  appCard: { width: 110, padding: 16, borderRadius: 20, marginRight: 12, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  appIcon: { width: 48, height: 48, borderRadius: 14, marginBottom: 12 },
  appName: { fontSize: 14, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  appDesc: { fontSize: 11, textAlign: 'center' },
  vpnIcon: { position: 'absolute', top: 10, right: 10 },

  bookmarkCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 12 },
  bookmarkIcon: { width: 40, height: 40, borderRadius: 12, marginRight: 14 },
  bookmarkInfo: { flex: 1, marginRight: 8 },
  bookmarkName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  bookmarkUrl: { fontSize: 13 },
  
  emptyBookmarks: { padding: 40, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginTop: 20 },
  emptyBookmarksText: { marginTop: 12, fontSize: 15, fontWeight: '500' },

  // Modals & Menus
  menuOverlay: { flex: 1, backgroundColor: 'transparent' },
  menuContent: { position: 'absolute', top: Platform.OS === 'ios' ? 95 : 75, right: 60, width: 180, borderRadius: 16, borderWidth: 1, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  menuText: { fontSize: 15, fontWeight: '600' },
  menuDivider: { height: 1, marginHorizontal: 10 },
  
  tabsOverviewContainer: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  tabsOverviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  tabsOverviewTitle: { fontSize: 24, fontWeight: '800' },
  tabPreviewCard: { flex: 1, margin: 8, borderRadius: 20, borderWidth: 2, height: 200, overflow: 'hidden' },
  tabPreviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.2)' },
  tabPreviewTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  tabPreviewBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  newTabBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 28, borderRadius: 30, elevation: 5 },
  
  browserLoader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { borderRadius: 24, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 14, padding: 16, fontSize: 16, marginBottom: 16 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 12 },
  modalButton: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center' },
});
