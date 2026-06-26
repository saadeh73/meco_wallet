// screens/DappBrowserScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Keyboard, TouchableWithoutFeedback, Platform, FlatList
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pairWalletConnect } from '../services/walletConnectService'; // ✅ استيراد دالة الربط

const BOOKMARKS_KEY = '@meco_bookmarks';

export default function DappBrowserScreen() {
  const { t }        = useTranslation();
  const navigation   = useNavigation();
  const route        = useRoute();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';

  const C = {
    bg:       isDark ? '#07070F' : '#F0F1F6',
    surface:  isDark ? '#0F0F1E' : '#FFFFFF',
    surface2: isDark ? '#161628' : '#F8F8FF',
    text:     isDark ? '#EEEEFF' : '#0D0D1A',
    muted:    isDark ? '#6060A0' : '#9090A8',
    border:   isDark ? '#1E1E38' : '#E4E4F0',
    border2:  isDark ? '#282842' : '#DDDDF0',
    accent:   primaryColor,
    warning:  '#F59E0B',
    inputBg:  isDark ? '#13132A' : '#F2F2FB',
  };

  const { url: initialUrl, name: initialName } = route.params || {};

  const [tabs,             setTabs]            = useState([]);
  const [activeTabId,      setActiveTabId]     = useState(null);
  const [inputUrl,         setInputUrl]        = useState('');
  const [loadingWeb,       setLoadingWeb]      = useState(false);
  const [menuVisible,      setMenuVisible]     = useState(false);
  const [tabsOvVisible,    setTabsOvVisible]   = useState(false);
  const [addModalVisible,  setAddModalVisible] = useState(false);
  const [newBookmark,      setNewBookmark]     = useState({ name: '', url: '', iconUrl: '' });

  const webviewRefs = useRef({});

  // 1. فتح التبويب الأول عند تشغيل المتصفح برابط خارجي
  useEffect(() => {
    if (initialUrl) {
      const id = Date.now().toString();
      setTabs([{ id, url: initialUrl, title: initialName || t('loading_page'), canGoBack: false, canGoForward: false }]);
      setActiveTabId(id);
      setInputUrl(initialUrl);
    }
  }, [initialUrl, initialName]);

  // ✅ 2. الاستماع لكود الـ QR بعد العودة من كاميرا الكود أو اختيار لقطة شاشة
  useEffect(() => {
    const scanned = route.params?.scannedAddress;
    if (scanned?.startsWith('wc:')) {
      // تفريغ البيانات حتى لا تتكرر العملية عند تدوير الشاشة أو إعادة فتحها
      navigation.setParams({ scannedAddress: undefined });
      
      // تنفيذ عملية الربط مباشرة بينما المتصفح مفتوح!
      pairWalletConnect(scanned)
        .then(() => {
          console.log('✅ WalletConnect paired inside browser successfully!');
        })
        .catch(err => {
          console.warn('❌ Pairing failed inside browser:', err.message);
        });
    }
  }, [route.params?.scannedAddress]);

  const openNewTab = useCallback(url => {
    const id = Date.now().toString();
    setTabs(prev => [...prev, { id, url, title: t('loading_page'), canGoBack: false, canGoForward: false }]);
    setActiveTabId(id);
    setInputUrl(url);
    setTabsOvVisible(false);
  }, [t]);

  const closeTab = useCallback(id => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        if (next.length) {
          setActiveTabId(next[next.length - 1].id);
          setInputUrl(next[next.length - 1].url);
        } else {
          setActiveTabId(null);
          setInputUrl('');
          navigation.goBack();
        }
      }
      return next;
    });
  }, [activeTabId, navigation]);

  const switchTab = id => {
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      setActiveTabId(id);
      setInputUrl(tab.url);
      setTabsOvVisible(false);
    }
  };

  const handleSearch = () => {
    let url = inputUrl.trim();
    if (!url) return;
    if (!url.startsWith('http') && !url.includes('.'))
      url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    else if (!url.startsWith('http'))
      url = `https://${url}`;
    Keyboard.dismiss();
    
    if (activeTabId) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, url } : t));
    } else {
      openNewTab(url);
    }
  };

  const handleAddBookmark = async () => {
    if (!newBookmark.name.trim() || !newBookmark.url.trim()) return;
    let url = newBookmark.url.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    try {
      const s = await AsyncStorage.getItem(BOOKMARKS_KEY);
      const currentList = s ? JSON.parse(s) : [];
      const updatedList = [
        { id: Date.now().toString(), name: newBookmark.name.trim(), url, iconUrl: newBookmark.iconUrl.trim() || null },
        ...currentList,
      ];
      await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updatedList));
    } catch (_) {}
    setNewBookmark({ name: '', url: '', iconUrl: '' });
    setAddModalVisible(false);
  };

  const activeTab = tabs.find(t => t.id === activeTabId);

  // تحديث عنوان شريط الهيدر بذكاء بناءً على الصفحة المفتوحة
  useEffect(() => {
    if (activeTab) {
      navigation.setOptions({ title: activeTab.title });
    }
  }, [activeTab?.title]);

  return (
    <View style={[S.root, { backgroundColor: C.bg }]}>
      
      {/* ── شريط تحكم متصفح Web3 العلوي المعدل ── */}
      <View style={[S.addrRow, { borderBottomColor: C.border }]}>
        <TouchableOpacity style={[S.homeBtn, { backgroundColor: C.inputBg, borderColor: C.border }]} onPress={() => navigation.goBack()}>
          <Ionicons name="close-outline" size={22} color={C.text} />
        </TouchableOpacity>

        <View style={[S.urlBar, { backgroundColor: C.inputBg, borderColor: C.border }]}>
          {loadingWeb ? (
            <ActivityIndicator size="small" color={C.accent} style={{ marginLeft: 13 }} />
          ) : (
            <Ionicons name="search" size={14} color={C.muted} style={{ marginLeft: 13 }} />
          )}
          <TextInput
            style={[S.urlInput, { color: C.text }]}
            placeholder={t('browser_search_placeholder')}
            placeholderTextColor={C.muted}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            selectTextOnFocus
          />
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={S.dotsBtn}>
            <Ionicons name="ellipsis-vertical" size={18} color={C.text} />
          </TouchableOpacity>
        </View>

        {/* ✅ زر الـ QR كود مدمج مباشرة بالمتصفح، يرسل المستخدم لـ QRScanner ثم يعود تلقائياً هنا */}
        <TouchableOpacity
          style={[S.qrBtn, { backgroundColor: C.accent + '20', borderColor: C.accent + '50' }]}
          onPress={() => navigation.navigate('QRScanner', { returnTo: 'DappBrowser' })}
        >
          <Ionicons name="qr-code-outline" size={19} color={C.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.tabsBtn, { backgroundColor: C.accent + '20', borderColor: C.accent + '55' }]}
          onPress={() => setTabsOvVisible(true)}
        >
          <Text style={[S.tabsBadge, { color: C.accent }]}>{tabs.length}</Text>
        </TouchableOpacity>
      </View>

      {/* ── المتصفح الفعلي (WebView) ── */}
      <View style={{ flex: 1 }}>
        {tabs.map(tab => (
          <View key={tab.id} style={{ flex: 1, display: tab.id === activeTabId ? 'flex' : 'none' }}>
            <WebView
              ref={el => (webviewRefs.current[tab.id] = el)}
              source={{ uri: tab.url }}
              style={{ flex: 1 }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scrollEnabled={true}
              bounces={false}
              allowsInlineMediaPlayback={true}
              allowsFullscreenVideo={true}
              mixedContentMode="compatibility"
              thirdPartyCookiesEnabled={true}
              sharedCookiesEnabled={true}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={S.webLoader}>
                  <ActivityIndicator size="large" color={C.accent} />
                </View>
              )}
              onLoadStart={() => { if (tab.id === activeTabId) setLoadingWeb(true); }}
              onLoadEnd={()   => { if (tab.id === activeTabId) setLoadingWeb(false); }}
              onNavigationStateChange={nav => {
                setTabs(prev => prev.map(t =>
                  t.id === tab.id
                    ? { ...t, url: nav.url, title: nav.title || t.title, canGoBack: nav.canGoBack, canGoForward: nav.canGoForward }
                    : t
                ));
                if (tab.id === activeTabId) setInputUrl(nav.url);
              }}
            />
          </View>
        ))}
      </View>

      {/* ── باقي نوافذ الـ Modal (القائمة، التبويبات، والمفضلة) ── */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' }}>
            <View style={[S.menu, { backgroundColor: C.surface, borderColor: C.border2 }]}>
              {[
                { icon:'arrow-back',    key:'browser_back',    enabled: activeTab?.canGoBack,    action: () => { setMenuVisible(false); if (activeTab?.canGoBack) webviewRefs.current[activeTabId]?.goBack(); } },
                { icon:'arrow-forward', key:'browser_forward', enabled: activeTab?.canGoForward, action: () => { setMenuVisible(false); if (activeTab?.canGoForward) webviewRefs.current[activeTabId]?.goForward(); } },
              ].map(b => (
                <TouchableOpacity key={b.key} style={S.menuRow} onPress={b.action}>
                  <Ionicons name={b.icon} size={17} color={b.enabled ? C.text : C.muted} />
                  <Text style={[S.menuTxt, { color: b.enabled ? C.text : C.muted }]}>{t(b.key)}</Text>
                </TouchableOpacity>
              ))}
              <View style={[S.menuDivider, { backgroundColor: C.border }]} />
              <TouchableOpacity style={S.menuRow} onPress={() => { setMenuVisible(false); webviewRefs.current[activeTabId]?.reload(); }}>
                <Ionicons name="refresh" size={17} color={C.text} />
                <Text style={[S.menuTxt, { color: C.text }]}>{t('browser_reload')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.menuRow} onPress={() => { setMenuVisible(false); setNewBookmark({ name: activeTab?.title || '', url: activeTab?.url || '', iconUrl: '' }); setAddModalVisible(true); }}>
                <Ionicons name="star-outline" size={17} color={C.warning} />
                <Text style={[S.menuTxt, { color: C.text }]}>{t('add_bookmark')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={tabsOvVisible} animationType="slide" onRequestClose={() => setTabsOvVisible(false)}>
        <View style={[S.tabsOvRoot, { backgroundColor: C.bg }]}>
          <View style={[S.tabsOvHeader, { borderBottomColor: C.border }]}>
            <View>
              <Text style={[S.tabsOvTitle, { color: C.text }]}>{t('open_tabs')}</Text>
              <Text style={[S.tabsOvSub,   { color: C.muted }]}>{tabs.length} {t('portal_tabs_label')}</Text>
            </View>
            <TouchableOpacity style={[S.closeBtn, { backgroundColor: C.border }]} onPress={() => setTabsOvVisible(false)}>
              <Ionicons name="close" size={19} color={C.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={tabs} numColumns={2} keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => (
              <View style={[S.tabPreview, { backgroundColor: C.surface, borderColor: item.id === activeTabId ? C.accent : C.border }]}>
                <View style={[S.tabPreviewTop, { borderBottomColor: C.border }]}>
                  <Text style={[S.tabPreviewTitle, { color: C.text }]} numberOfLines={1}>{item.title}</Text>
                  <TouchableOpacity onPress={() => closeTab(item.id)} style={[S.tabCloseBtn, { backgroundColor: C.border }]}>
                    <Ionicons name="close" size={12} color={C.muted} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={S.tabPreviewBody} onPress={() => switchTab(item.id)}>
                  <View style={[S.tabFavicon, { backgroundColor: C.accent + '18' }]}>
                    <Ionicons name="globe-outline" size={22} color={C.accent + '80'} />
                  </View>
                  <Text style={[S.tabPreviewUrl, { color: C.muted }]} numberOfLines={2}>
                    {item.url.replace(/^https?:\/\//, '').substring(0, 32)}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
          <TouchableOpacity
            style={[S.newTabBtn, { backgroundColor: C.accent }]}
            onPress={() => { setTabsOvVisible(false); openNewTab('https://www.google.com'); }}
          >
            <Ionicons name="add" size={22} color="#FFF" />
            <Text style={S.newTabTxt}>{t('new_tab')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={addModalVisible} transparent animationType="slide" onRequestClose={() => setAddModalVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={S.sheetOverlay}>
            <View style={[S.sheet, { backgroundColor: C.surface2 }]}>
              <View style={[S.sheetHandle, { backgroundColor: C.border2 }]} />
              <Text style={[S.sheetTitle, { color: C.text }]}>{t('add_bookmark')}</Text>
              {[
                { field:'name', icon:'text-outline', placeholderKey:'bookmark_name_placeholder', kbType:'default' },
                { field:'url',  icon:'link-outline', placeholderKey:'bookmark_url_placeholder',  kbType:'url'     },
              ].map(f => (
                <View key={f.field} style={[S.inputRow, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                  <Ionicons name={f.icon} size={16} color={C.muted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={[S.inputTxt, { color: C.text }]}
                    placeholder={t(f.placeholderKey)}
                    placeholderTextColor={C.muted}
                    value={newBookmark[f.field]}
                    onChangeText={v => setNewBookmark(p => ({ ...p, [f.field]: v }))}
                    keyboardType={f.kbType}
                    autoCapitalize="none"
                  />
                </View>
              ))}
              <View style={S.sheetBtns}>
                <TouchableOpacity style={[S.sheetBtn, { backgroundColor: C.border }]} onPress={() => setAddModalVisible(false)}>
                  <Text style={[S.sheetBtnTxt, { color: C.muted }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.sheetBtn, { backgroundColor: C.accent }]} onPress={handleAddBookmark}>
                  <Ionicons name="bookmark" size={15} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={[S.sheetBtnTxt, { color: '#FFF' }]}>{t('save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}

const S = StyleSheet.create({
  root:     { flex: 1 },
  addrRow:  { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:10, gap:8, borderBottomWidth:1 },
  homeBtn:  { width:42, height:42, borderRadius:13, borderWidth:1, justifyContent:'center', alignItems:'center' },
  urlBar:   { flex:1, flexDirection:'row', alignItems:'center', borderRadius:13, borderWidth:1, height:44 },
  urlInput: { flex:1, paddingHorizontal:10, fontSize:14, height:'100%' },
  dotsBtn:  { paddingHorizontal:11, height:'100%', justifyContent:'center' },
  qrBtn:    { width:42, height:42, borderRadius:13, borderWidth:1, justifyContent:'center', alignItems:'center' },
  tabsBtn:  { width:42, height:42, borderRadius:13, borderWidth:1.5, justifyContent:'center', alignItems:'center' },
  tabsBadge:{ fontSize:14, fontWeight:'800' },
  webLoader:    { position:'absolute', top:0, left:0, right:0, bottom:0, justifyContent:'center', alignItems:'center', zIndex:10, backgroundColor:'rgba(0,0,0,0.05)' },
  tabsOvRoot:   { flex:1, paddingTop: Platform.OS==='ios'?52:20 },
  tabsOvHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, borderBottomWidth:1 },
  tabsOvTitle:  { fontSize:22, fontWeight:'800', marginBottom:2 },
  tabsOvSub:    { fontSize:13 },
  closeBtn:     { width:36, height:36, borderRadius:18, justifyContent:'center', alignItems:'center' },
  tabPreview:   { flex:1, margin:8, borderRadius:20, borderWidth:2, height:175, overflow:'hidden' },
  tabPreviewTop:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:10, borderBottomWidth:1 },
  tabPreviewTitle:{ flex:1, fontSize:12, fontWeight:'700', marginRight:6 },
  tabCloseBtn:  { width:22, height:22, borderRadius:11, justifyContent:'center', alignItems:'center' },
  tabPreviewBody:{ flex:1, justifyContent:'center', alignItems:'center', gap:8 },
  tabFavicon:   { width:42, height:42, borderRadius:13, justifyContent:'center', alignItems:'center' },
  tabPreviewUrl:{ fontSize:11, textAlign:'center', paddingHorizontal:8 },
  newTabBtn:    { position:'absolute', bottom:40, alignSelf:'center', flexDirection:'row', alignItems:'center', paddingVertical:16, paddingHorizontal:32, borderRadius:30, elevation:6 },
  newTabTxt:    { color:'#FFF', fontWeight:'800', fontSize:16, marginLeft:8 },
  menu:         { position:'absolute', right:16, top:64, width:188, borderRadius:18, borderWidth:1, elevation:10, zIndex:999 },
  menuRow:      { flexDirection:'row', alignItems:'center', paddingVertical:14, paddingHorizontal:16, gap:12 },
  menuTxt:      { fontSize:14, fontWeight:'600' },
  menuDivider:  { height:1, marginHorizontal:10 },
  sheetOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'flex-end' },
  sheet:        { borderTopLeftRadius:28, borderTopRightRadius:28, padding:24, paddingBottom: Platform.OS==='ios'?40:24 },
  sheetHandle:  { width:40, height:4, borderRadius:2, alignSelf:'center', marginBottom:20 },
  sheetTitle:   { fontSize:20, fontWeight:'800', textAlign:'center', marginBottom:20 },
  inputRow:     { flexDirection:'row', alignItems:'center', borderRadius:14, borderWidth:1, marginBottom:12, height:52 },
  inputTxt:     { flex:1, paddingHorizontal:12, fontSize:15, height:'100%' },
  sheetBtns:    { flexDirection:'row', gap:12, marginTop:8 },
  sheetBtn:     { flex:1, flexDirection:'row', justifyContent:'center', alignItems:'center', paddingVertical:16, borderRadius:14 },
  sheetBtnTxt:  { fontSize:15, fontWeight:'800' },
});
