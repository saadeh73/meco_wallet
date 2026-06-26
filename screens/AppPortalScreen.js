// screens/ExploreScreen.js (AppPortalScreen)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Image, Platform, FlatList, ActivityIndicator,
  Modal, TextInput, Keyboard, TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pairWalletConnect, initWalletConnect } from '../services/walletConnectService';

const { width } = Dimensions.get('window');
const BOOKMARKS_KEY = '@meco_bookmarks';

// ─── قائمة التطبيقات والبروتوكولات ───────────────────────────────────────────
const EARNING_OPPORTUNITIES = [
  { id: 'marinade-sol',   protocol: 'Marinade Finance', protocolIcon: 'https://assets.coingecko.com/coins/images/18612/large/mnde.png',    asset: 'SOL',      apy: 8.5,  url: 'https://marinade.finance/app/staking', category: 'staking', featured: true,  descKey: 'desc_marinade' },
  { id: 'jito-sol',       protocol: 'Jito',             protocolIcon: 'https://assets.coingecko.com/coins/images/33228/large/jto.png',     asset: 'SOL',      apy: 9.2,  url: 'https://jito.network/staking',         category: 'staking', featured: true,  descKey: 'desc_jito'     },
  { id: 'meteora-lp',     protocol: 'Meteora',          protocolIcon: 'https://meteora.ag/favicon.ico',                                    asset: 'SOL/USDC', apy: 20.0, url: 'https://app.meteora.ag',               category: 'defi',    featured: true,  descKey: 'desc_meteora'  },
  { id: 'jupiter-swap',   protocol: 'Jupiter',          protocolIcon: 'https://jup.ag/favicon.ico',                                        asset: 'SOL',      apy: 0,    url: 'https://jup.ag',                       category: 'trading', featured: true,  descKey: 'desc_jupiter'  },
  { id: 'kamino-usdc',    protocol: 'Kamino',           protocolIcon: 'https://www.kamino.finance/favicon.ico',                            asset: 'USDC',     apy: 8.0,  url: 'https://app.kamino.finance/lend',      category: 'defi',    featured: false, descKey: 'desc_kamino'   },
  { id: 'drift-perps',    protocol: 'Drift Protocol',   protocolIcon: 'https://drift.foundation/favicon.ico',                              asset: 'SOL/USDC', apy: 12.0, url: 'https://app.drift.trade',              category: 'trading', featured: false, descKey: 'desc_drift'    },
  { id: 'solend-lending', protocol: 'Solend',           protocolIcon: 'https://solend.fi/favicon.ico',                                     asset: 'USDC',     apy: 5.0,  url: 'https://solend.fi/dashboard',          category: 'defi',    featured: false, descKey: 'desc_solend'   },
  { id: 'raydium',        protocol: 'Raydium',          protocolIcon: 'https://assets.coingecko.com/coins/images/13928/large/PSym7VQ.png', asset: 'SOL-USDC', apy: 15.5, url: 'https://raydium.io/liquidity/pools/',  category: 'pools',   featured: false, descKey: 'desc_raydium'  },
  { id: 'orca',           protocol: 'Orca',             protocolIcon: 'https://assets.coingecko.com/coins/images/17547/large/Orca_Logo.png',asset:'SOL-USDC', apy: 12.0, url: 'https://www.orca.so/pools',            category: 'pools',   featured: false, descKey: 'desc_orca'     },
];

const CAT = {
  staking: { accent: '#3B82F6', bg: 'rgba(59,130,246,0.1)', icon: 'layers-outline'          },
  defi:    { accent: '#8B5CF6', bg: 'rgba(139,92,246,0.1)', icon: 'trending-up-outline'     },
  trading: { accent: '#10B981', bg: 'rgba(16,185,129,0.1)', icon: 'swap-horizontal-outline' },
  pools:   { accent: '#9945FF', bg: 'rgba(153,69,255,0.1)', icon: 'water-outline'           },
};

const SafeImage = ({ uri, style, fallbackIcon = 'globe-outline', fallbackColor = '#606080' }) => {
  const [err, setErr] = useState(false);
  if (err || !uri)
    return (
      <View style={[style, { backgroundColor: 'rgba(0,0,0,0.06)', justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name={fallbackIcon} size={style.width * 0.5} color={fallbackColor} />
      </View>
    );
  return <Image source={{ uri }} style={style} onError={() => setErr(true)} />;
};

const Pressable = ({ onPress, style, children }) => {
  const sc = useRef(new Animated.Value(1)).current;
  const spring = v => Animated.spring(sc, { toValue: v, useNativeDriver: true, damping: 18, stiffness: 350 }).start();
  return (
    <TouchableOpacity onPress={onPress} onPressIn={() => spring(0.97)} onPressOut={() => spring(1)} activeOpacity={1}>
      <Animated.View style={[style, { transform: [{ scale: sc }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
};

const TickerStrip = ({ items, C }) => {
  const x      = useRef(new Animated.Value(0)).current;
  const ITEM_W = 140;
  const totalW = items.length * ITEM_W;
  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(x, { toValue: -totalW, duration: items.length * 2800, useNativeDriver: true, isInteraction: false }),
    );
    a.start();
    return () => a.stop();
  }, []);
  const doubled = [...items, ...items];
  return (
    <View style={[S.tickerWrap, { borderTopColor: C.border, borderBottomColor: C.border, backgroundColor: C.surface }]}>
      <Animated.View style={[S.tickerTrack, { transform: [{ translateX: x }] }]}>
        {doubled.map((item, i) => (
          <View key={i} style={S.tickerItem}>
            <Text style={[S.tickerName, { color: C.muted }]}>{item.protocol}</Text>
            <View style={[S.tickerDot, { backgroundColor: C.border2 }]} />
            {item.apy > 0
              ? <Text style={[S.tickerApy, { color: '#10B981' }]}>+{item.apy}%</Text>
              : <Text style={[S.tickerApy, { color: C.accent }]}>DEX</Text>}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function AppPortalScreen() {
  const { t }        = useTranslation();
  const navigation   = useNavigation();
  const route        = useRoute();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';

  const C = {
    bg:       isDark ? '#0A0A0F' : '#F4F5F9',
    surface:  isDark ? '#111122' : '#FFFFFF',
    surface2: isDark ? '#17172C' : '#FAFAFF',
    text:     isDark ? '#F0F0FF' : '#1C1C24',
    muted:    isDark ? '#7E7EAA' : '#8A8A9E',
    border:   isDark ? '#22223D' : '#E8E8F2',
    border2:  isDark ? '#2D2D4F' : '#DDDDF0',
    accent:   primaryColor,
    warning:  '#F59E0B',
    inputBg:  isDark ? '#171730' : '#ECECF4',
    shadow:   isDark ? 'rgba(0,0,0,0.5)' : 'rgba(140,140,180,0.12)',
  };

  const [bookmarks,        setBookmarks]        = useState([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(true);
  const [addModalVisible,  setAddModalVisible]  = useState(false);
  const [newBookmark,      setNewBookmark]       = useState({ name: '', url: '', iconUrl: '' });
  const [activeView,       setActiveView]        = useState('explore');
  const [inputUrl,         setInputUrl]          = useState('');

  const headerY     = useRef(new Animated.Value(-12)).current;
  const headerOp    = useRef(new Animated.Value(0)).current;
  const bodyOp      = useRef(new Animated.Value(0)).current;
  const switchX     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(60, [
      Animated.parallel([
        Animated.spring(headerY,  { toValue: 0, useNativeDriver: true, damping: 20 }),
        Animated.timing(headerOp, { toValue: 1, useNativeDriver: true, duration: 300 }),
      ]),
      Animated.timing(bodyOp, { toValue: 1, useNativeDriver: true, duration: 350 }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.spring(switchX, {
      toValue: activeView === 'explore' ? 0 : 1,
      useNativeDriver: true, damping: 24, stiffness: 240,
    }).start();
  }, [activeView]);

  useEffect(() => { loadBookmarks(); }, []);

  useEffect(() => {
    initWalletConnect().catch(err => console.warn('WalletConnect init:', err.message));
  }, []);

  useEffect(() => {
    const scanned = route.params?.scannedAddress;
    if (scanned?.startsWith('wc:')) {
      navigation.setParams({ scannedAddress: undefined });
      pairWalletConnect(scanned);
    }
  }, [route.params?.scannedAddress]);

  const loadBookmarks = async () => {
    try { const s = await AsyncStorage.getItem(BOOKMARKS_KEY); if (s) setBookmarks(JSON.parse(s)); }
    catch (_) {} finally { setLoadingBookmarks(false); }
  };

  const saveBookmarks = async bm => {
    try { await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bm)); setBookmarks(bm); } catch (_) {}
  };

  const handleAddBookmark = async () => {
    if (!newBookmark.name.trim() || !newBookmark.url.trim()) return;
    let url = newBookmark.url.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    await saveBookmarks([
      { id: Date.now().toString(), name: newBookmark.name.trim(), url, iconUrl: newBookmark.iconUrl.trim() || null },
      ...bookmarks,
    ]);
    setNewBookmark({ name: '', url: '', iconUrl: '' });
    setAddModalVisible(false);
  };

  const handleDeleteBookmark = id => saveBookmarks(bookmarks.filter(b => b.id !== id));

  const openDappInBrowser = useCallback((url, name) => {
    navigation.navigate('DappBrowser', { url, name });
  }, [navigation]);

  const handleSearch = () => {
    let url = inputUrl.trim();
    if (!url) return;
    if (!url.startsWith('http') && !url.includes('.'))
      url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    else if (!url.startsWith('http'))
      url = `https://${url}`;
    
    Keyboard.dismiss();
    setInputUrl('');
    openDappInBrowser(url, 'Web3');
  };

  const featured   = EARNING_OPPORTUNITIES.filter(a => a.featured);
  const categories = [
    { id: 'pools',   titleKey: 'category_pools'   },
    { id: 'staking', titleKey: 'category_staking' },
    { id: 'defi',    titleKey: 'category_defi'    },
    { id: 'trading', titleKey: 'category_trading' },
  ].map(c => ({ ...c, data: EARNING_OPPORTUNITIES.filter(a => a.category === c.id) }))
   .filter(c => c.data.length);

  const FeaturedCard = ({ item }) => {
    const cat = CAT[item.category] || CAT.staking;
    return (
      <Pressable onPress={() => openDappInBrowser(item.url, item.protocol)} style={[S.featCard, { backgroundColor: C.surface, shadowColor: C.shadow, borderColor: C.border }]}>
        <View style={S.featTop}>
          <View style={[S.featIconWrap, { backgroundColor: C.bg, borderColor: C.border }]}>
            <SafeImage uri={item.protocolIcon} style={S.featIcon} fallbackIcon="business-outline" fallbackColor={cat.accent} />
          </View>
          {item.apy > 0 ? (
            <View style={[S.apyPill, { backgroundColor: cat.bg, borderColor: cat.accent + '30' }]}>
              <Text style={[S.apySmall, { color: cat.accent }]}>{t('up_to')}</Text>
              <Text style={[S.apyBig,   { color: cat.accent }]}>{item.apy}%</Text>
              <Text style={[S.apySmall, { color: cat.accent }]}>{t('portal_apy_label')}</Text>
            </View>
          ) : (
            <View style={[S.apyPill, { backgroundColor: C.inputBg, borderColor: C.border }]}>
              <Ionicons name={cat.icon} size={12} color={C.muted} />
              <Text style={[S.apySmall, { color: C.muted, marginLeft: 4 }]}>{t('portal_dex_label')}</Text>
            </View>
          )}
        </View>
        <Text style={[S.featName,  { color: C.text }]} numberOfLines={1}>{item.protocol}</Text>
        <Text style={[S.featAsset, { color: cat.accent }]}>{item.asset}</Text>
        <Text style={[S.featDesc,  { color: C.muted }]} numberOfLines={2}>{t(item.descKey)}</Text>
        <View style={[S.featFooter, { borderTopColor: C.border }]}>
          <Text style={[S.openLabel, { color: cat.accent }]}>{t('portal_open_app')}</Text>
          <View style={[S.openArrow, { backgroundColor: cat.bg }]}>
            <Ionicons name="arrow-forward" size={12} color={cat.accent} />
          </View>
        </View>
      </Pressable>
    );
  };

  const AppCard = ({ item }) => {
    const cat = CAT[item.category] || CAT.staking;
    return (
      <Pressable onPress={() => openDappInBrowser(item.url, item.protocol)} style={[S.appCard, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadow }]}>
        <View style={[S.appIconWrap, { backgroundColor: C.bg, borderColor: C.border }]}>
          <SafeImage uri={item.protocolIcon} style={S.appIcon} fallbackIcon="globe-outline" fallbackColor={cat.accent} />
        </View>
        <Text style={[S.appName,  { color: C.text }]} numberOfLines={1}>{item.protocol}</Text>
        <Text style={[S.appAsset, { color: C.muted }]} numberOfLines={1}>{item.asset}</Text>
        {item.apy > 0 ? (
          <View style={[S.appApy, { backgroundColor: cat.bg }]}>
            <Text style={[S.appApyTxt, { color: cat.accent }]}>{item.apy}% APY</Text>
          </View>
        ) : (
          <View style={[S.appApy, { backgroundColor: C.inputBg }]}>
            <Text style={[S.appApyTxt, { color: C.muted }]}>DEX</Text>
          </View>
        )}
      </Pressable>
    );
  };

  const BookmarkRow = ({ item }) => (
    <View style={[S.bmCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      <TouchableOpacity
        onPress={() => openDappInBrowser(item.url, item.name)}
        onLongPress={() => handleDeleteBookmark(item.id)}
        delayLongPress={600}
        style={S.bmInner}
        activeOpacity={0.7}
      >
        <View style={[S.bmIconWrap, { backgroundColor: C.bg, borderColor: C.border }]}>
          <SafeImage uri={item.iconUrl} style={S.bmIcon} fallbackIcon="link-outline" fallbackColor={C.accent} />
        </View>
        <View style={S.bmInfo}>
          <Text style={[S.bmName, { color: C.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[S.bmUrl,  { color: C.muted }]} numberOfLines={1}>{item.url.replace(/^https?:\/\//, '')}</Text>
        </View>
        <View style={[S.bmChevron, { backgroundColor: C.bg, borderColor: C.border }]}>
          <Ionicons name="chevron-forward" size={13} color={C.muted} />
        </View>
      </TouchableOpacity>
    </View>
  );

  const SectionHead = ({ titleKey, catId }) => {
    const cat = catId ? CAT[catId] : null;
    return (
      <View style={S.secHead}>
        {cat && <View style={[S.secDot, { backgroundColor: cat.accent }]} />}
        <Text style={[S.secTitle, { color: C.text }]}>{t(titleKey)}</Text>
      </View>
    );
  };

  return (
    <View style={[S.root, { backgroundColor: C.bg, paddingTop: Platform.OS === 'ios' ? 52 : 30 }]}>

      {/* ── شريط البحث والتحكم العلوي المتناسق ── */}
      <Animated.View style={[S.addrRow, { opacity: headerOp, transform: [{ translateY: headerY }] }]}>
        <View style={[S.homeBtn, { backgroundColor: C.accent + '15', borderColor: C.accent + '30' }]}>
          <Ionicons name="compass" size={20} color={C.accent} />
        </View>

        <View style={[S.urlBar, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="search" size={14} color={C.muted} style={{ marginLeft: 14 }} />
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
        </View>

        <TouchableOpacity
          style={[S.qrBtn, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={() => navigation.navigate('QRScanner')}
        >
          <Ionicons name="qr-code-outline" size={18} color={C.text} />
        </TouchableOpacity>
      </Animated.View>

      {/* ── المحتوى الرئيسي المتناسق ── */}
      <View style={{ flex: 1 }}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 110 }}
          style={{ opacity: bodyOp }}
        >
          <View style={S.hero}>
            <View style={[S.heroBadge, { backgroundColor: C.accent + '12', borderColor: C.accent + '25' }]}>
              <View style={[S.heroPulse, { backgroundColor: C.accent }]} />
              <Text style={[S.heroBadgeTxt, { color: C.accent }]}>{t('portal_badge_label')}</Text>
            </View>
            <Text style={[S.heroTitle, { color: C.text }]}>{t('explore_web3')}</Text>
            <Text style={[S.heroSub,   { color: C.muted }]}>{t('explore_desc')}</Text>
          </View>

          <TickerStrip items={EARNING_OPPORTUNITIES} C={C} />

          {/* ── محدد التبويبات الحديث السلس ── */}
          <View style={[S.switcher, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Animated.View style={[S.switchThumb, {
              backgroundColor: C.inputBg,
              width: (width - 46) / 2,
              transform: [{ translateX: switchX.interpolate({ inputRange: [0,1], outputRange: [2, (width-46)/2+2] }) }],
            }]} />
            {[
              { id:'explore',   activeIcon:'compass',  idleIcon:'compass-outline',  key:'discover'  },
              { id:'bookmarks', activeIcon:'bookmark', idleIcon:'bookmark-outline', key:'bookmarks' },
            ].map(tab => {
              const active = activeView === tab.id;
              return (
                <TouchableOpacity key={tab.id} style={S.switchBtn} onPress={() => setActiveView(tab.id)}>
                  <Ionicons name={active ? tab.activeIcon : tab.idleIcon} size={15} color={active ? C.accent : C.muted} style={{ marginRight: 6 }} />
                  <Text style={[S.switchTxt, { color: active ? C.text : C.muted }]}>{t(tab.key)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeView === 'explore' ? (
            <>
              {/* القسم المميز */}
              <View style={S.section}>
                <SectionHead titleKey="featured_apps" />
                <FlatList
                  data={featured}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={i => i.id}
                  renderItem={({ item }) => <FeaturedCard item={item} />}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
                  decelerationRate="fast"
                  snapToInterval={width * 0.76 + 12}
                  snapToAlignment="start"
                />
              </View>

              {/* أقسام الفئات */}
              {categories.map(cat => (
                <View key={cat.id} style={S.section}>
                  <SectionHead titleKey={cat.titleKey} catId={cat.id} />
                  <FlatList
                    data={cat.data}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={i => i.id}
                    renderItem={({ item }) => <AppCard item={item} />}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
                  />
                </View>
              ))}
            </>
          ) : (
            /* قسم المفضلة المنسق */
            <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
              <TouchableOpacity
                style={[S.addBmBtn, { backgroundColor: C.surface, borderColor: C.accent + '35' }]}
                onPress={() => { setNewBookmark({ name:'', url:'', iconUrl:'' }); setAddModalVisible(true); }}
              >
                <View style={[S.addBmIcon, { backgroundColor: C.accent + '15' }]}>
                  <Ionicons name="add" size={18} color={C.accent} />
                </View>
                <Text style={[S.addBmTxt, { color: C.accent }]}>{t('add_bookmark')}</Text>
              </TouchableOpacity>
              
              {loadingBookmarks ? (
                <ActivityIndicator size="small" color={C.accent} style={{ marginTop: 40 }} />
              ) : bookmarks.length ? (
                bookmarks.map(item => <BookmarkRow key={item.id} item={item} />)
              ) : (
                <View style={[S.emptyState, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <View style={[S.emptyIcon, { backgroundColor: C.accent + '12' }]}>
                    <Ionicons name="bookmark-outline" size={26} color={C.accent} />
                  </View>
                  <Text style={[S.emptyTitle, { color: C.text }]}>{t('no_bookmarks_yet')}</Text>
                  <Text style={[S.emptySub,   { color: C.muted }]}>{t('portal_no_bookmarks_hint')}</Text>
                </View>
              )}
            </View>
          )}
        </Animated.ScrollView>
      </View>

      {/* ── نافذة إضافة مفضلة (Bottom Sheet) معدلة بالكامل ── */}
      <Modal visible={addModalVisible} transparent animationType="slide" onRequestClose={() => setAddModalVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={S.sheetOverlay}>
            <View style={[S.sheet, { backgroundColor: C.surface }]}>
              <View style={[S.sheetHandle, { backgroundColor: C.border }]} />
              <Text style={[S.sheetTitle, { color: C.text }]}>{t('add_bookmark')}</Text>
              {[
                { field:'name', icon:'text-outline', placeholderKey:'bookmark_name_placeholder', kbType:'default' },
                { field:'url',  icon:'link-outline', placeholderKey:'bookmark_url_placeholder',  kbType:'url'     },
              ].map(f => (
                <View key={f.field} style={[S.inputRow, { backgroundColor: C.bg, borderColor: C.border }]}>
                  <Ionicons name={f.icon} size={15} color={C.muted} style={{ marginLeft: 14 }} />
                  <TextInput
                    style={[S.inputTxt, { color: C.text }]}
                    placeholder={t(f.placeholderKey)}
                    placeholderTextColor={C.muted}
                    value={newBookmark[f.field]}
                    onChangeText={v => setNewBookmark(p => ({ ...p, [f.field]: v }))}
                    keyboardType={f.kbType}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ))}
              <View style={S.sheetBtns}>
                <TouchableOpacity style={[S.sheetBtn, { backgroundColor: C.bg }]} onPress={() => setAddModalVisible(false)}>
                  <Text style={[S.sheetBtnTxt, { color: C.muted }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.sheetBtn, { backgroundColor: C.accent }]} onPress={handleAddBookmark}>
                  <Ionicons name="bookmark" size={14} color="#FFF" style={{ marginRight: 6 }} />
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

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
const S = StyleSheet.create({
  root:     { flex: 1 },
  addrRow:  { flexDirection:'row', alignItems:'center', paddingHorizontal:20, marginBottom:8, gap:10 },
  homeBtn:  { width:44, height:44, borderRadius:12, borderWidth:1, justifyContent:'center', alignItems:'center' },
  urlBar:   { flex:1, flexDirection:'row', alignItems:'center', borderRadius:12, borderWidth:1, height:44 },
  urlInput: { flex:1, paddingHorizontal:10, fontSize:14, height:'100%', paddingVertical: 0 },
  qrBtn:    { width:44, height:44, borderRadius:12, borderWidth:1, justifyContent:'center', alignItems:'center' },
  
  hero:         { paddingHorizontal:22, paddingTop:16, paddingBottom:16 },
  heroBadge:    { flexDirection:'row', alignItems:'center', alignSelf:'flex-start', paddingHorizontal:10, paddingVertical:4, borderRadius:16, borderWidth:1, gap:6, marginBottom:10 },
  heroPulse:    { width:6, height:6, borderRadius:3 },
  heroBadgeTxt: { fontSize:10, fontWeight:'700', letterSpacing:0.5, fontFamily:MONO },
  heroTitle:    { fontSize:28, fontWeight:'800', letterSpacing:-0.5, marginBottom:4, lineHeight:34 },
  heroSub:      { fontSize:13, fontWeight:'500', lineHeight:18 },
  
  tickerWrap:   { borderTopWidth:1, borderBottomWidth:1, paddingVertical:11, overflow:'hidden', marginBottom:2 },
  tickerTrack:  { flexDirection:'row' },
  tickerItem:   { width:140, flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:12 },
  tickerName:   { fontFamily:MONO, fontSize:11, fontWeight:'600' },
  tickerDot:    { width:3, height:3, borderRadius:1.5 },
  tickerApy:    { fontFamily:MONO, fontSize:11, fontWeight:'700' },
  
  switcher:     { flexDirection:'row', marginHorizontal:20, borderRadius:14, borderWidth:1, padding:2, marginTop:12, marginBottom:20, height:44, position:'relative' },
  switchThumb:  { position:'absolute', top:2, bottom:2, borderRadius:11, shadowOffset:{width:0,height:2}, shadowOpacity:0.05, shadowRadius:4, elevation:1 },
  switchBtn:    { flex:1, flexDirection:'row', justifyContent:'center', alignItems:'center', zIndex:1 },
  switchTxt:    { fontSize:13, fontWeight:'700' },
  
  section:      { marginBottom:24 },
  secHead:      { flexDirection:'row', alignItems:'center', paddingHorizontal:22, marginBottom:12, gap:8 },
  secDot:       { width:6, height:6, borderRadius:3 },
  secTitle:     { fontSize:16, fontWeight:'800', letterSpacing:-0.2 },
  
  featCard:     { width:width*0.76, borderRadius:20, padding:16, marginRight:12, borderWidth:1, elevation:2, shadowOffset:{width:0,height:4}, shadowOpacity:0.04, shadowRadius:8 },
  featBlob:     { position:'absolute', width:160, height:160, borderRadius:80, top:-50, right:-40 },
  featTop:      { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, zIndex:1 },
  featIconWrap: { width:48, height:48, borderRadius:14, borderWidth:1, justifyContent:'center', alignItems:'center', overflow:'hidden' },
  featIcon:     { width:34, height:34, borderRadius:10 },
  apyPill:      { flexDirection:'row', alignItems:'center', paddingHorizontal:8, paddingVertical:5, borderRadius:14, borderWidth:1, gap:3 },
  apySmall:     { fontSize:10, fontWeight:'700', fontFamily:MONO },
  apyBig:       { fontSize:14, fontWeight:'900', fontFamily:MONO },
  featName:     { fontSize:18, fontWeight:'800', marginBottom:2, zIndex:1 },
  featAsset:    { fontSize:11, fontWeight:'700', marginBottom:8, fontFamily:MONO, zIndex:1 },
  featDesc:     { fontSize:12, lineHeight:17, marginBottom:14, zIndex:1 },
  featFooter:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center', borderTopWidth:1, paddingTop:12 },
  openLabel:    { fontSize:12, fontWeight:'700' },
  openArrow:    { width:24, height:24, borderRadius:12, justifyContent:'center', alignItems:'center' },
  
  appCard:      { width:110, padding:12, borderRadius:18, marginRight:10, alignItems:'center', borderWidth:1, elevation:1, shadowOffset:{width:0,height:2}, shadowOpacity:0.03, shadowRadius:4 },
  appIconWrap:  { width:46, height:46, borderRadius:13, borderWidth:1, justifyContent:'center', alignItems:'center', marginBottom:8, overflow:'hidden' },
  appIcon:      { width:32, height:32, borderRadius:8 },
  appName:      { fontSize:12, fontWeight:'700', textAlign:'center', marginBottom:2 },
  appAsset:     { fontSize:10, textAlign:'center', marginBottom:6 },
  appApy:       { paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  appApyTxt:    { fontSize:10, fontWeight:'700', fontFamily:MONO },
  
  bmCard:       { borderRadius:16, marginBottom:8, borderWidth:1, elevation:1, shadowOffset:{width:0,height:2}, shadowOpacity:0.02, shadowRadius:3 },
  bmInner:      { flexDirection:'row', alignItems:'center', padding:12 },
  bmIconWrap:   { width:40, height:40, borderRadius:11, borderWidth:1, justifyContent:'center', alignItems:'center', marginRight:12, overflow:'hidden' },
  bmIcon:       { width:24, height:24, borderRadius:6 },
  bmInfo:       { flex:1, marginRight:8 },
  bmName:       { fontSize:14, fontWeight:'700', marginBottom:2 },
  bmUrl:        { fontSize:11 },
  bmChevron:    { width:24, height:24, borderRadius:12, borderWidth:1, justifyContent:'center', alignItems:'center' },
  addBmBtn:     { flexDirection:'row', alignItems:'center', padding:12, borderRadius:16, marginBottom:12, borderWidth:1, borderStyle:'dashed', gap:10 },
  addBmIcon:    { width:32, height:32, borderRadius:10, justifyContent:'center', alignItems:'center' },
  addBmTxt:     { fontSize:14, fontWeight:'700' },
  emptyState:   { padding:30, borderRadius:20, alignItems:'center', marginTop:4, borderWidth:1, gap:8 },
  emptyIcon:    { width:54, height:54, borderRadius:16, justifyContent:'center', alignItems:'center', marginBottom:2 },
  emptyTitle:   { fontSize:15, fontWeight:'800' },
  emptySub:     { fontSize:12, textAlign:'center', lineHeight:16 },
  
  sheetOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  sheet:        { borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom: Platform.OS==='ios'?36:20 },
  sheetHandle:  { width:36, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  sheetTitle:   { fontSize:18, fontWeight:'800', textAlign:'center', marginBottom:16 },
  inputRow:     { flexDirection:'row', alignItems:'center', borderRadius:12, borderWidth:1, marginBottom:10, height:46 },
  inputTxt:     { flex:1, paddingHorizontal:10, fontSize:14, height:'100%', paddingVertical: 0 },
  sheetBtns:    { flexDirection:'row', gap:10, marginTop:6 },
  sheetBtn:     { flex:1, flexDirection:'row', justifyContent:'center', alignItems:'center', paddingVertical:13, borderRadius:12 },
  sheetBtnTxt:  { fontSize:14, fontWeight:'800' },
});
