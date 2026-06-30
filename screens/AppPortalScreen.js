// screens/AppPortalScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Image, Platform, ActivityIndicator,
  Modal, TextInput, Keyboard, TouchableWithoutFeedback, Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { initWalletConnect, pairWalletConnect } from '../services/walletConnectService';

const { width } = Dimensions.get('window');
const BOOKMARKS_KEY = '@meco_bookmarks';
const COLS     = 3;
const GAP      = 12;
const CARD_W   = (width - 40 - GAP * (COLS - 1)) / COLS;

const DAPPS = [
  { id:'marinade', name:'Marinade', icon:'https://assets.coingecko.com/coins/images/18612/large/mnde.png',      url:'https://marinade.finance/app/staking', category:'staking', badge:'8.5% APY'  },
  { id:'jito',     name:'Jito',     icon:'https://assets.coingecko.com/coins/images/33228/large/jto.png',       url:'https://jito.network/staking',         category:'staking', badge:'9.2% APY'  },
  { id:'jupiter',  name:'Jupiter',  icon:'https://jup.ag/favicon.ico',                                          url:'https://jup.ag',                       category:'trading', badge:'DEX'       },
  { id:'orca',     name:'Orca',     icon:'https://assets.coingecko.com/coins/images/17547/large/Orca_Logo.png', url:'https://www.orca.so/pools',            category:'pools',   badge:'Pools'     },
  { id:'raydium',  name:'Raydium',  icon:'https://assets.coingecko.com/coins/images/13928/large/PSym7VQ.png',   url:'https://raydium.io/liquidity/pools/',  category:'pools',   badge:'15.5% APY' },
  { id:'meteora',  name:'Meteora',  icon:'https://meteora.ag/favicon.ico',                                      url:'https://app.meteora.ag',               category:'defi',    badge:'20% APY'   },
  { id:'kamino',   name:'Kamino',   icon:'https://www.kamino.finance/favicon.ico',                              url:'https://app.kamino.finance/lend',      category:'defi',    badge:'8% APY'    },
  { id:'drift',    name:'Drift',    icon:'https://drift.foundation/favicon.ico',                                url:'https://app.drift.trade',              category:'trading', badge:'Perps'     },
  { id:'solend',   name:'Solend',   icon:'https://solend.fi/favicon.ico',                                       url:'https://solend.fi/dashboard',          category:'defi',    badge:'5% APY'    },
];

const CAT_COLOR = {
  staking: '#3B82F6',
  defi:    '#8B5CF6',
  trading: '#10B981',
  pools:   '#9945FF',
};

const SafeImg = ({ uri, size }) => {
  const [err, setErr] = useState(false);
  if (err || !uri) return (
    <View style={{ width:size, height:size, borderRadius:size*0.28,
      backgroundColor:'rgba(100,100,160,0.08)', justifyContent:'center', alignItems:'center' }}>
      <Ionicons name="globe-outline" size={size*0.45} color="rgba(100,100,160,0.35)" />
    </View>
  );
  return (
    <Image source={{ uri }}
      style={{ width:size, height:size, borderRadius:size*0.28 }}
      onError={() => setErr(true)} />
  );
};

export default function AppPortalScreen() {
  const { t }        = useTranslation();
  const navigation   = useNavigation();
  const route        = useRoute();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';
  const insets       = useSafeAreaInsets();

  const C = {
    bg:      isDark ? '#07070F' : '#F2F3F7',
    card:    isDark ? '#0F0F1E' : '#FFFFFF',
    text:    isDark ? '#EEEEFF' : '#0D0D1A',
    muted:   isDark ? '#6060A0' : '#9090A8',
    border:  isDark ? '#1E1E38' : '#E4E4F0',
    accent:  primaryColor,
    inputBg: isDark ? '#13132A' : '#EDEDF6',
  };

  const FILTERS = [
    { id:'all',     label: t('all', 'الكل')       },
    { id:'staking', label: t('category_staking', 'Staking')  },
    { id:'defi',    label: t('category_defi', 'DeFi')        },
    { id:'trading', label: t('category_trading', 'Trading')  },
    { id:'pools',   label: t('category_pools', 'Pools')      },
  ];

  const [filter,     setFilter]     = useState('all');
  const [view,       setView]       = useState('explore');
  const [search,     setSearch]     = useState('');
  const [bookmarks,  setBookmarks]  = useState([]);
  const [bmLoading,  setBmLoading]  = useState(true);
  const [addVisible, setAddVisible] = useState(false);
  const [newBm,      setNewBm]      = useState({ name:'', url:'' });
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue:1, duration:400, useNativeDriver:true }).start();
    loadBm();
    initWalletConnect().catch(() => {});
  }, []);

  // WalletConnect QR من DappBrowser
  useEffect(() => {
    const scanned = route.params?.scannedAddress;
    if (scanned?.startsWith('wc:')) {
      navigation.setParams({ scannedAddress: undefined });
      pairWalletConnect(scanned);
    }
  }, [route.params?.scannedAddress]);

  const loadBm = async () => {
    try {
      const s = await AsyncStorage.getItem(BOOKMARKS_KEY);
      if (s) setBookmarks(JSON.parse(s));
    } catch (_) {} finally { setBmLoading(false); }
  };

  // إعادة تحميل المفضلة عند العودة من DappBrowser
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadBm);
    return unsubscribe;
  }, [navigation]);

  const saveBm = async (list) => {
    try {
      await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
      setBookmarks(list);
    } catch (_) {}
  };

  const addBm = async () => {
    if (!newBm.name.trim() || !newBm.url.trim()) return;
    let url = newBm.url.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    await saveBm([{ id: Date.now().toString(), name: newBm.name.trim(), url }, ...bookmarks]);
    setNewBm({ name:'', url:'' });
    setAddVisible(false);
  };

  const openUrl = useCallback((url, name) => {
    navigation.navigate('DappBrowser', { url, name });
  }, [navigation]);

  const handleSearch = () => {
    const q = search.trim();
    if (!q) return;
    let url = q;
    if (!url.startsWith('http') && !url.includes('.'))
      url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    else if (!url.startsWith('http'))
      url = `https://${url}`;
    setSearch('');
    Keyboard.dismiss();
    openUrl(url, 'Web3');
  };

  const filtered = filter === 'all' ? DAPPS : DAPPS.filter(d => d.category === filter);
  const padTop   = Platform.OS === 'ios' ? insets.top + 10 : insets.top + 18;
  const padBot   = insets.bottom + 80;

  // ── بطاقة تطبيق موحدة ──────────────────────────────────────────────────────
  const DappCard = ({ item }) => {
    const color = CAT_COLOR[item.category] || C.accent;
    return (
      <TouchableOpacity
        style={[S.card, { backgroundColor:C.card, borderColor:C.border, width:CARD_W }]}
        onPress={() => openUrl(item.url, item.name)}
        activeOpacity={0.72}
      >
        <SafeImg uri={item.icon} size={46} />
        <Text style={[S.cardName, { color:C.text }]} numberOfLines={1}>{item.name}</Text>
        <View style={[S.cardBadge, { backgroundColor: color+'18' }]}>
          <Text style={[S.cardBadgeTxt, { color }]}>{item.badge}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── صف مفضلة ───────────────────────────────────────────────────────────────
  const BmRow = ({ item }) => (
    <TouchableOpacity
      style={[S.bmRow, { backgroundColor:C.card, borderColor:C.border }]}
      onPress={() => openUrl(item.url, item.name)}
      onLongPress={() => saveBm(bookmarks.filter(b => b.id !== item.id))}
      delayLongPress={600}
      activeOpacity={0.72}
    >
      <View style={[S.bmIco, { backgroundColor:C.accent+'18' }]}>
        <Ionicons name="globe-outline" size={20} color={C.accent} />
      </View>
      <View style={{ flex:1 }}>
        <Text style={[S.bmName, { color:C.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[S.bmUrl,  { color:C.muted }]} numberOfLines={1}>
          {item.url.replace(/^https?:\/\//, '')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={C.muted} />
    </TouchableOpacity>
  );

  return (
    <View style={[S.root, { backgroundColor:C.bg, paddingTop:padTop }]}>

      <Animated.View style={{ opacity:fadeAnim }}>
        {/* ── البوصلة + البحث ── */}
        <View style={S.searchRow}>
          <View style={[S.compassBtn, { backgroundColor:C.accent+'18', borderColor:C.accent+'35' }]}>
            <Ionicons name="compass" size={22} color={C.accent} />
          </View>
          <View style={[S.searchBar, { backgroundColor:C.card, borderColor:C.border }]}>
            <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginLeft:12 }} />
            <TextInput
              style={[S.searchInput, { color:C.text }]}
              placeholder={t('browser_search_placeholder', 'ابحث أو أدخل رابطاً...')}
              placeholderTextColor={C.muted}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={handleSearch}
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} style={{ marginRight:10 }}>
                <Ionicons name="close-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── تبويبات اكتشف / مفضلة ── */}
        <View style={[S.mainTabs, { backgroundColor:C.card, borderColor:C.border }]}>
          {[
            { id:'explore',   icon:'compass',  label: t('discover', 'اكتشف')    },
            { id:'bookmarks', icon:'bookmark', label: t('bookmarks', 'المفضلة') },
          ].map(tab => {
            const on = view === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[S.mainTab, on && { backgroundColor:C.accent }]}
                onPress={() => setView(tab.id)}
              >
                <Ionicons
                  name={on ? tab.icon : `${tab.icon}-outline`}
                  size={14} color={on ? '#FFF' : C.muted}
                />
                <Text style={[S.mainTabTxt, { color: on ? '#FFF' : C.muted }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      {view === 'explore' ? (
        <Animated.View style={{ flex:1, opacity:fadeAnim }}>
          {/* ── فلاتر الفئات ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={S.filterRow}
            style={{ maxHeight:44, marginBottom:12 }}
          >
            {FILTERS.map(f => {
              const on = filter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[S.filterBtn, {
                    backgroundColor: on ? C.accent      : C.card,
                    borderColor:     on ? C.accent      : C.border,
                  }]}
                  onPress={() => setFilter(f.id)}
                >
                  <Text style={[S.filterTxt, { color: on ? '#FFF' : C.muted }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── شبكة التطبيقات الموحدة ── */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[S.grid, { paddingBottom: padBot }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={S.gridWrap}>
              {filtered.map(item => <DappCard key={item.id} item={item} />)}
              {filtered.length % COLS !== 0 &&
                Array.from({ length: COLS - (filtered.length % COLS) }).map((_, i) => (
                  <View key={`ph${i}`} style={{ width:CARD_W }} />
                ))
              }
            </View>
          </ScrollView>
        </Animated.View>
      ) : (
        /* ── المفضلة ── */
        <Animated.ScrollView
          style={{ flex:1, opacity:fadeAnim }}
          contentContainerStyle={[S.bmList, { paddingBottom: padBot }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={[S.addBmBtn, { borderColor:C.accent+'40', backgroundColor:C.card }]}
            onPress={() => { setNewBm({ name:'', url:'' }); setAddVisible(true); }}
          >
            <View style={[S.addBmIco, { backgroundColor:C.accent+'18' }]}>
              <Ionicons name="add" size={20} color={C.accent} />
            </View>
            <Text style={[S.addBmTxt, { color:C.accent }]}>
              {t('add_bookmark', 'إضافة مفضلة')}
            </Text>
          </TouchableOpacity>

          {bmLoading
            ? <ActivityIndicator color={C.accent} style={{ marginTop:40 }} />
            : bookmarks.length
              ? bookmarks.map(b => <BmRow key={b.id} item={b} />)
              : (
                <View style={[S.empty, { backgroundColor:C.card, borderColor:C.border }]}>
                  <View style={[S.emptyIco, { backgroundColor:C.accent+'18' }]}>
                    <Ionicons name="bookmark-outline" size={30} color={C.accent} />
                  </View>
                  <Text style={[S.emptyTitle, { color:C.text }]}>
                    {t('no_bookmarks_yet', 'لا توجد مفضلة')}
                  </Text>
                  <Text style={[S.emptySub, { color:C.muted }]}>
                    {t('portal_no_bookmarks_hint', 'احفظ المواقع من المتصفح')}
                  </Text>
                </View>
              )
          }
        </Animated.ScrollView>
      )}

      {/* ── Modal إضافة مفضلة ── */}
      <Modal visible={addVisible} transparent animationType="slide"
        onRequestClose={() => setAddVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={S.overlay}>
            <View style={[S.sheet, { backgroundColor:C.card }]}>
              <View style={[S.handle, { backgroundColor:C.border }]} />
              <Text style={[S.sheetTitle, { color:C.text }]}>
                {t('add_bookmark', 'إضافة مفضلة')}
              </Text>
              {[
                { field:'name', icon:'text-outline', ph: t('bookmark_name_placeholder','الاسم'),   kb:'default' },
                { field:'url',  icon:'link-outline', ph: t('bookmark_url_placeholder', 'الرابط'), kb:'url'     },
              ].map(f => (
                <View key={f.field} style={[S.inp, { backgroundColor:C.inputBg, borderColor:C.border }]}>
                  <Ionicons name={f.icon} size={15} color={C.muted} style={{ marginLeft:14 }} />
                  <TextInput
                    style={[S.inpTxt, { color:C.text }]}
                    placeholder={f.ph}
                    placeholderTextColor={C.muted}
                    value={newBm[f.field]}
                    onChangeText={v => setNewBm(p => ({ ...p, [f.field]:v }))}
                    keyboardType={f.kb}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ))}
              <View style={S.sheetBtns}>
                <TouchableOpacity
                  style={[S.sheetBtn, { backgroundColor:C.inputBg }]}
                  onPress={() => setAddVisible(false)}>
                  <Text style={[S.sheetBtnTxt, { color:C.muted }]}>{t('cancel','إلغاء')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.sheetBtn, { backgroundColor:C.accent }]}
                  onPress={addBm}>
                  <Ionicons name="bookmark" size={14} color="#FFF" style={{ marginRight:6 }} />
                  <Text style={[S.sheetBtnTxt, { color:'#FFF' }]}>{t('save','حفظ')}</Text>
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
  root:        { flex:1 },

  // بحث
  searchRow:   { flexDirection:'row', alignItems:'center', paddingHorizontal:20, marginBottom:12, gap:10 },
  compassBtn:  { width:46, height:46, borderRadius:14, borderWidth:1, justifyContent:'center', alignItems:'center' },
  searchBar:   { flex:1, flexDirection:'row', alignItems:'center', borderRadius:14, borderWidth:1, height:46 },
  searchInput: { flex:1, fontSize:14, height:'100%', paddingRight:8 },

  // تبويبات رئيسية
  mainTabs:    { flexDirection:'row', marginHorizontal:20, borderRadius:14, borderWidth:1, padding:3, marginBottom:14, gap:3 },
  mainTab:     { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:10, borderRadius:11, gap:6 },
  mainTabTxt:  { fontSize:13, fontWeight:'700' },

  // فلاتر
  filterRow:   { paddingHorizontal:20, gap:8, alignItems:'center', paddingVertical:2 },
  filterBtn:   { paddingHorizontal:16, paddingVertical:8, borderRadius:20, borderWidth:1.5 },
  filterTxt:   { fontSize:12, fontWeight:'700' },

  // شبكة
  grid:        { paddingHorizontal:20 },
  gridWrap:    { flexDirection:'row', flexWrap:'wrap', gap:GAP },
  card:        { alignItems:'center', paddingVertical:16, paddingHorizontal:6,
                 borderRadius:18, borderWidth:1, gap:8,
                 shadowColor:'#000', shadowOffset:{width:0,height:2},
                 shadowOpacity:0.04, shadowRadius:6, elevation:2 },
  cardName:    { fontSize:12, fontWeight:'700', textAlign:'center' },
  cardBadge:   { paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  cardBadgeTxt:{ fontSize:10, fontWeight:'700' },

  // مفضلة
  bmList:      { paddingHorizontal:20, paddingTop:4 },
  addBmBtn:    { flexDirection:'row', alignItems:'center', padding:14, borderRadius:16,
                 marginBottom:14, borderWidth:1.5, borderStyle:'dashed', gap:10 },
  addBmIco:    { width:34, height:34, borderRadius:10, justifyContent:'center', alignItems:'center' },
  addBmTxt:    { fontSize:14, fontWeight:'700' },
  bmRow:       { flexDirection:'row', alignItems:'center', padding:14, borderRadius:16,
                 marginBottom:10, borderWidth:1, gap:12 },
  bmIco:       { width:42, height:42, borderRadius:13, justifyContent:'center', alignItems:'center' },
  bmName:      { fontSize:14, fontWeight:'700', marginBottom:2 },
  bmUrl:       { fontSize:11 },
  empty:       { alignItems:'center', padding:32, borderRadius:20, borderWidth:1, marginTop:10, gap:10 },
  emptyIco:    { width:58, height:58, borderRadius:17, justifyContent:'center', alignItems:'center' },
  emptyTitle:  { fontSize:16, fontWeight:'800' },
  emptySub:    { fontSize:12, textAlign:'center', lineHeight:18 },

  // Modal
  overlay:     { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  sheet:       { borderTopLeftRadius:24, borderTopRightRadius:24, padding:22,
                 paddingBottom:Platform.OS==='ios'?38:22 },
  handle:      { width:36, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  sheetTitle:  { fontSize:18, fontWeight:'800', textAlign:'center', marginBottom:16 },
  inp:         { flexDirection:'row', alignItems:'center', borderRadius:12, borderWidth:1,
                 marginBottom:10, height:46 },
  inpTxt:      { flex:1, paddingHorizontal:10, fontSize:14, height:'100%' },
  sheetBtns:   { flexDirection:'row', gap:10, marginTop:6 },
  sheetBtn:    { flex:1, flexDirection:'row', justifyContent:'center', alignItems:'center',
                 paddingVertical:14, borderRadius:12 },
  sheetBtnTxt: { fontSize:14, fontWeight:'800' },
});
