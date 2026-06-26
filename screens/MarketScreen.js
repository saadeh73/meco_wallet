// screens/MarketScreen.js
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, RefreshControl, SafeAreaView, ActivityIndicator,
  TextInput, Modal, Alert, Platform
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getJupiterMarketData, CORE_TOKENS,
  fetchCustomTokenByMint, saveCustomToken, deleteCustomToken,
} from '../services/jupiterMarketService';
import { getGlobalMarketData, getTopMovers } from '../services/marketOverviewService';
import { getSolBalance, getTokenBalance } from '../services/heliusService';

const WATCHLIST_KEY   = '@meco_watchlist';
const REFRESH_MS      = 60000; // تحديث كل دقيقة

// ─── دالة التنسيق الاحترافي لأسعار العملات (Solflare Style) ───────────────────
const fmtPrice = (p) => {
  if (p === undefined || p === null || p === 0) return '$0.00';
  if (p >= 1) {
    return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (p >= 0.001) {
    return `$${p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  }
  
  const pStr = p.toFixed(12);
  const leadingZerosMatch = pStr.match(/^0\.(0+)/);
  if (leadingZerosMatch) {
    const zeroCount = leadingZerosMatch[1].length;
    if (zeroCount >= 4) {
      const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
      const subStr = zeroCount.toString().split('').map(d => subscripts[parseInt(d)]).join('');
      const significantPart = pStr.slice(2 + zeroCount).slice(0, 4).replace(/0+$/, '');
      return `$0.0${subStr}${significantPart}`;
    }
  }
  return `$${p.toFixed(8).replace(/\.?0+$/, '')}`;
};

// ─── MarketOverviewCard ───────────────────────────────────────────────────────
const MarketOverviewCard = React.memo(({ data, isDark, primaryColor }) => {
  const { t } = useTranslation();
  const C = { text: isDark?'#FFF':'#1A1A2E', muted: isDark?'#7E7EAA':'#8A8A9E', success:'#10B981', error:'#EF4444' };
  const up = (data?.marketCapChange24h || 0) >= 0;
  return (
    <View style={[S.overviewCard, { backgroundColor: isDark ? '#111122' : '#FFFFFF', borderColor: isDark ? '#1E1E38' : '#E8E8F2' }]}>
      <View style={S.overviewRow}>
        {[
          { k:'market_cap_label', v: data?.totalMarketCapFormatted    || 'N/A' },
          { k:'market_volume',    v: data?.totalVolume24hFormatted     || 'N/A' },
          { k:'btc_dominance',    v: `${data?.btcDominance?.toFixed(1)||'0'}%` },
        ].map((item, i) => (
          <View key={item.k} style={[S.overviewItem, i===1 && S.overviewMid]}>
            <Text style={[S.overviewLabel, { color: C.muted }]}>{t(item.k)}</Text>
            <Text style={[S.overviewValue, { color: C.text }]}>{item.v}</Text>
          </View>
        ))}
      </View>
      <View style={[S.overviewBar, { backgroundColor: up ? 'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)' }]}>
        <Ionicons name={up?'trending-up':'trending-down'} size={13} color={up?C.success:C.error} />
        <Text style={[S.overviewBarTxt, { color: up?C.success:C.error }]}>
          {data?.marketCapChangeFormatted||'0%'} {t('time_24h')}
        </Text>
      </View>
    </View>
  );
});

// ─── TopMoversSection ─────────────────────────────────────────────────────────
const TopMoversSection = React.memo(({ gainers, losers, isDark }) => {
  const { t } = useTranslation();
  const C = { text: isDark?'#FFF':'#1C1C24', success:'#10B981', error:'#EF4444', border: isDark?'#1E1E38':'#E8E8F2' };
  const MoverChip = ({ item, green }) => (
    <View style={[S.moverChip, { backgroundColor: green?'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)', borderColor: C.border }]}>
      <Text style={[S.moverChipSym, { color: C.text }]}>{item.symbol}</Text>
      <Text style={[S.moverChipChg, { color: green?C.success:C.error }]}>
        {green?'+':''}{item.change24h?.toFixed(1)}%
      </Text>
    </View>
  );
  return (
    <View style={S.moversWrap}>
      {[{ label:'market_top_gainers', icon:'flame',  items:gainers, green:true },
        { label:'market_losers',      icon:'snow',   items:losers,  green:false }].map(row => (
        <View key={row.label} style={S.moverRow}>
          <View style={S.moverRowHead}>
            <Ionicons name={row.icon} size={12} color={row.green?C.success:C.error} />
            <Text style={[S.moverRowTitle, { color: row.green?C.success:C.error }]}>{t(row.label)}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:6, paddingRight:4 }}>
            {(row.items||[]).slice(0,5).map(item => <MoverChip key={item.symbol} item={item} green={row.green} />)}
          </ScrollView>
        </View>
      ))}
    </View>
  );
});

// ─── TokenListItem (تم إزالة شارت الـ Sparkline لتصميم نظيف وواسع كـ Solflare) ───
const TokenListItem = React.memo(({ token, onPress, onLongPress, isDark, primaryColor }) => {
  const C = { text: isDark?'#EEEEFF':'#1C1C24', muted: isDark?'#7E7EAA':'#8A8A9E', success:'#10B981', error:'#EF4444', border: isDark?'#1E1E38':'#E8E8F2' };
  const up    = (token.price_change_percentage_24h || 0) >= 0;
  const color = up ? C.success : C.error;

  return (
    <TouchableOpacity style={[S.tokenCard, { borderBottomColor: C.border }]} onPress={() => onPress(token)} onLongPress={() => onLongPress(token)} activeOpacity={0.7}>
      <View style={S.tokenLeft}>
        <View style={[S.tokenIcon, { backgroundColor: isDark ? '#171730' : '#ECECF4' }]}>
          {token.image
            ? <Image source={{ uri:token.image }} style={S.tokenIconImg} />
            : <Text style={[S.tokenIconTxt, { color:primaryColor }]}>{token.symbol?.charAt(0)}</Text>}
        </View>
        <View style={S.tokenInfo}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
            <Text style={[S.tokenSym, { color:C.text }]}>{token.symbol}</Text>
            {token.isCustom && <View style={[S.badge, { backgroundColor:primaryColor+'18' }]}><Text style={[S.badgeTxt, { color:primaryColor }]}>+</Text></View>}
          </View>
          <Text style={[S.tokenName, { color:C.muted }]} numberOfLines={1}>{token.name}</Text>
        </View>
      </View>

      <View style={S.tokenRight}>
        <Text style={[S.tokenPrice, { color:C.text }]}>{fmtPrice(token.current_price)}</Text>
        <View style={S.percentRow}>
          <Ionicons name={up?'caret-up':'caret-down'} size={8} color={color} />
          <Text style={[S.tokenBadgeTxt, { color }]}>
            {Math.abs(token.price_change_percentage_24h || 0).toFixed(2)}%
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
export default function MarketScreen() {
  const navigation   = useNavigation();
  const { t }        = useTranslation();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';
  const activeAccount = useAppStore(s => s.accounts?.[s.activeAccountIndex] ?? null);

  const C = {
    bg:      isDark ? '#07070F' : '#F4F5F9',
    card:    isDark ? '#111122' : '#FFFFFF',
    text:    isDark ? '#EEEEFF' : '#1C1C24',
    muted:   isDark ? '#7E7EAA' : '#8A8A9E',
    border:  isDark ? '#1E1E38' : '#E8E8F2',
    success: '#10B981', error: '#EF4444',
  };

  const [tokens,         setTokens]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [activeTab,      setActiveTab]      = useState('all');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchActive,   setSearchActive]   = useState(false);
  const [watchlist,      setWatchlist]      = useState([]);
  const [overview,       setOverview]       = useState(null);
  const [topMovers,      setTopMovers]      = useState({ gainers:[], losers:[] });
  const [portfolioUSD,   setPortfolioUSD]   = useState(0);
  const [sortBy,         setSortBy]         = useState('rank');
  const [addModal,       setAddModal]       = useState(false);
  const [mintInput,      setMintInput]      = useState('');
  const [fetching,       setFetching]       = useState(false);
  const [previewToken,   setPreviewToken]   = useState(null);
  const [fetchErr,       setFetchErr]       = useState('');

  const firstLoad = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem(WATCHLIST_KEY).then(s => { if (s) setWatchlist(JSON.parse(s)); }).catch(()=>{});
  }, []);

  const calcPortfolio = useCallback(async (tokenData, pubKey) => {
    if (!pubKey || !tokenData.length) return;
    try {
      const results = await Promise.all(
        CORE_TOKENS.map(async token => {
          const price = tokenData.find(tk => tk.symbol === token.symbol)?.current_price || 0;
          if (!price) return 0;
          const bal = token.symbol === 'SOL'
            ? await getSolBalance(true, pubKey).catch(() => 0)
            : await getTokenBalance(token.mint, true, pubKey).catch(() => 0);
          return (bal || 0) * price;
        })
      );
      setPortfolioUSD(results.reduce((s, v) => s + v, 0));
    } catch (_) {}
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [tokenData, ovData, moversData] = await Promise.all([
        getJupiterMarketData(),
        getGlobalMarketData(),
        getTopMovers(5),
      ]);
      setTokens(tokenData);
      setOverview(ovData);
      setTopMovers(moversData);
      if (activeAccount?.publicKey) {
        calcPortfolio(tokenData, activeAccount.publicKey);
      }
    } catch (err) {
      console.error('Market fetch:', err.message);
      if (!tokens.length) {
        setTokens(CORE_TOKENS.map((tk, i) => ({ ...tk, current_price:0, price_change_percentage_24h:0, rank:i+1 })));
      }
    }
  }, [activeAccount?.publicKey, calcPortfolio]);

  useEffect(() => {
    let mounted = true;
    fetchAll().finally(() => { if (mounted) setLoading(false); });
    const iv = setInterval(fetchAll, REFRESH_MS);
    return () => { mounted = false; clearInterval(iv); };
  }, [activeAccount?.publicKey]);

  useFocusEffect(useCallback(() => {
    if (firstLoad.current) { firstLoad.current = false; return; }
    fetchAll();
  }, [fetchAll]));

  const onRefresh = async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); };

  const toggleWatch = async (token) => {
    const upd = watchlist.includes(token.symbol)
      ? watchlist.filter(s => s !== token.symbol)
      : [...watchlist, token.symbol];
    setWatchlist(upd);
    await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(upd));
  };

  const handleFetch = async () => {
    if (!mintInput.trim()) return;
    setFetching(true); setFetchErr(''); setPreviewToken(null);
    try {
      setPreviewToken(await fetchCustomTokenByMint(mintInput.trim()));
    } catch (e) {
      setFetchErr(e.message?.includes('not found') ? t('token_not_found')
                : e.message?.includes('Invalid')    ? t('invalid_contract_address')
                : e.message || t('error'));
    } finally { setFetching(false); }
  };

  const handleSave = async () => {
    if (!previewToken) return;
    try {
      await saveCustomToken(previewToken);
      closeModal();
      await fetchAll();
      Alert.alert(t('success'), t('token_added_success', { symbol: previewToken.symbol }));
    } catch (e) {
      setFetchErr(e.message?.includes('already') ? t('token_already_added') : e.message);
    }
  };

  const handleDelete = (token) => {
    Alert.alert(t('delete'), t('delete_token_confirm', { symbol:token.symbol }), [
      { text:t('cancel'), style:'cancel' },
      { text:t('delete'), style:'destructive', onPress: async () => { await deleteCustomToken(token.mint); await fetchAll(); } },
    ]);
  };

  const closeModal = () => { setAddModal(false); setMintInput(''); setPreviewToken(null); setFetchErr(''); };

  const filtered = useMemo(() => {
    let list = tokens.filter(tk => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!tk.symbol?.toLowerCase().includes(q) && !tk.name?.toLowerCase().includes(q)) return false;
      }
      if (activeTab === 'watchlist') return watchlist.includes(tk.symbol);
      if (activeTab === 'gainers')   return (tk.price_change_percentage_24h||0) > 0;
      if (activeTab === 'losers')    return (tk.price_change_percentage_24h||0) < 0;
      return true;
    });
    list.sort((a,b) => {
      if (sortBy === 'price')  return (b.current_price||0) - (a.current_price||0);
      if (sortBy === 'change') return (b.price_change_percentage_24h||0) - (a.price_change_percentage_24h||0);
      return (a.rank||999) - (b.rank||999);
    });
    return list;
  }, [tokens, searchQuery, activeTab, watchlist, sortBy]);

  const TABS  = [{ id:'all',labelKey:'all_tokens' },{ id:'watchlist',labelKey:'watchlist' },{ id:'gainers',labelKey:'gainers' },{ id:'losers',labelKey:'market_losers' }];
  const SORTS = [{ id:'rank',labelKey:'rank' },{ id:'price',labelKey:'price' },{ id:'change',labelKey:'change' }];

  if (loading) return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
      <View style={S.loadWrap}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[S.loadTxt, { color:C.muted }]}>{t('loading')}</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>

      {/* ── شريط رأس الصفحة (Header) ── */}
      <View style={S.header}>
        <View>
          <Text style={[S.headerTitle, { color:C.text }]}>{t('market_title')}</Text>
          <Text style={[S.headerSub,   { color:C.muted }]}>{t('market_subtitle')}</Text>
        </View>
        <TouchableOpacity style={[S.headerBtn, { backgroundColor:C.card, borderColor:C.border, borderWidth:1 }]} onPress={() => setSearchActive(v => !v)}>
          <Ionicons name={searchActive?'close':'search'} size={18} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* ── مربع البحث المطور ── */}
      {searchActive && (
        <View style={[S.searchRow, { backgroundColor:C.bg }]}>
          <View style={[S.searchWrap, { backgroundColor:C.card, borderColor:C.border }]}>
            <Ionicons name="search" size={14} color={C.muted} style={{ marginLeft:12 }} />
            <TextInput
              style={[S.searchInput, { color:C.text }]}
              placeholder={t('market_search_placeholder')}
              placeholderTextColor={C.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding:10 }}>
                <Ionicons name="close-circle" size={14} color={C.muted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[S.addBtn, { backgroundColor:primaryColor }]} onPress={() => setAddModal(true)}>
              <Ionicons name="add" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchActive(false); }} style={S.cancelBtn}>
            <Text style={{ color:primaryColor, fontWeight:'600', fontSize:13 }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={S.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} colors={[primaryColor]} />}
        showsVerticalScrollIndicator={false}
      >
        {!searchActive && (
          <>
            <MarketOverviewCard data={overview} isDark={isDark} primaryColor={primaryColor} />

            {/* محفظتي الإجمالية */}
            {portfolioUSD > 0 && (
              <View style={[S.portfolioStrip, { backgroundColor:C.card, borderColor:C.border }]}>
                <View>
                  <Text style={[S.portfolioLabel, { color:C.muted }]}>{t('total_balance')}</Text>
                  <Text style={[S.portfolioValue, { color:C.text }]}>
                    ${portfolioUSD.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}
                  </Text>
                </View>
                <View style={[S.walletIconWrap, { backgroundColor: primaryColor+'18' }]}>
                  <Ionicons name="wallet-outline" size={20} color={primaryColor} />
                </View>
              </View>
            )}

            <TopMoversSection gainers={topMovers.gainers} losers={topMovers.losers} isDark={isDark} />
          </>
        )}

        {/* ── التبويبات الأنيقة ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom:12, gap:6 }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[S.tab, { backgroundColor: activeTab===tab.id ? primaryColor : C.card, borderColor: C.border }]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[S.tabTxt, { color: activeTab===tab.id ? '#FFF' : C.muted }]}>{t(tab.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── معايير الفرز النظيفة ── */}
        <View style={S.sortRow}>
          {SORTS.map(opt => (
            <TouchableOpacity
              key={opt.id}
              style={[S.sortBtn, { backgroundColor: sortBy===opt.id ? primaryColor+'15' : 'transparent', borderColor: sortBy===opt.id ? primaryColor+'35' : 'transparent' }]}
              onPress={() => setSortBy(opt.id)}
            >
              <Text style={[S.sortTxt, { color: sortBy===opt.id ? primaryColor : C.muted }]}>{t(opt.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── قائمة العملات (تصميم متكامل ناعم بملء المساحة) ── */}
        <View style={[S.listContainer, { backgroundColor:C.card, borderColor:C.border }]}>
          {filtered.length === 0 ? (
            <View style={S.empty}>
              <Ionicons name="search-outline" size={36} color={C.muted} />
              <Text style={[S.emptyTxt, { color:C.muted }]}>
                {activeTab==='watchlist' ? t('watchlist_empty') : t('no_results')}
              </Text>
            </View>
          ) : filtered.map((token) => (
            <TokenListItem
              key={token.mint||token.id}
              token={token}
              isDark={isDark}
              primaryColor={primaryColor}
              onPress={tk => navigation.navigate('TokenDetails', { token: tk })}
              onLongPress={tk => tk.isCustom ? handleDelete(tk) : toggleWatch(tk)}
            />
          ))}
        </View>
      </ScrollView>

      {/* ── نافذة إضافة عملة (Bottom Sheet) ── */}
      <Modal visible={addModal} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={S.modalOverlay}>
          <View style={[S.modalBox, { backgroundColor:C.card }]}>
            <View style={[S.modalHandle, { backgroundColor:C.border }]} />
            <View style={S.modalHeader}>
              <Text style={[S.modalTitle, { color:C.text }]}>{t('add_custom_token')}</Text>
              <TouchableOpacity onPress={closeModal} style={[S.modalClose, { backgroundColor:C.bg }]}>
                <Ionicons name="close" size={18} color={C.muted} />
              </TouchableOpacity>
            </View>

            <Text style={[S.modalLabel, { color:C.muted }]}>{t('custom_token_address')}</Text>
            <View style={[S.modalInput, { backgroundColor:C.bg, borderColor:C.border }]}>
              <TextInput
                style={{ flex:1, color:C.text, fontSize:14, paddingVertical: 0 }}
                placeholder={t('custom_token_placeholder')}
                placeholderTextColor={C.muted}
                value={mintInput}
                onChangeText={v => { setMintInput(v); setPreviewToken(null); setFetchErr(''); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {!!fetchErr && <Text style={[S.fetchErr, { color:C.error }]}>{fetchErr}</Text>}

            {!previewToken && (
              <TouchableOpacity
                style={[S.fetchBtn, { backgroundColor:primaryColor, opacity: (fetching||!mintInput.trim())?0.6:1 }]}
                onPress={handleFetch}
                disabled={fetching||!mintInput.trim()}
              >
                {fetching
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <><Ionicons name="search" size={16} color="#FFF" /><Text style={S.fetchBtnTxt}>{t('fetch_token_data')}</Text></>
                }
              </TouchableOpacity>
            )}

            {previewToken && (
              <View style={[S.preview, { backgroundColor:C.bg, borderColor:C.border }]}>
                <View style={S.previewTop}>
                  <View style={[S.previewIcon, { backgroundColor:primaryColor+'15' }]}>
                    {previewToken.image
                      ? <Image source={{ uri:previewToken.image }} style={{ width:40, height:40, borderRadius:20 }} />
                      : <Text style={{ color:primaryColor, fontSize:18, fontWeight:'bold' }}>{previewToken.symbol?.charAt(0)}</Text>}
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={[S.previewSym, { color:C.text }]}>{previewToken.symbol}</Text>
                    <Text style={[S.previewName, { color:C.muted }]}>{previewToken.name}</Text>
                  </View>
                  <View style={{ alignItems:'flex-end' }}>
                    <Text style={[S.previewPrice, { color:C.text }]}>{fmtPrice(previewToken.current_price)}</Text>
                    <Text style={{ color:(previewToken.price_change_percentage_24h||0)>=0?C.success:C.error, fontSize:12, fontWeight:'600', marginTop:2 }}>
                      {(previewToken.price_change_percentage_24h||0)>=0?'+':''}{(previewToken.price_change_percentage_24h||0).toFixed(2)}%
                    </Text>
                  </View>
                </View>
                <View style={S.previewBtns}>
                  <TouchableOpacity style={[S.previewCancel, { borderColor:C.border }]} onPress={() => { setPreviewToken(null); setMintInput(''); }}>
                    <Text style={{ color:C.muted, fontWeight:'600' }}>{t('research')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.previewAdd, { backgroundColor:primaryColor }]} onPress={handleSave}>
                    <Ionicons name="add-circle" size={18} color="#FFF" />
                    <Text style={S.previewAddTxt}>{t('add_custom_token')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  loadWrap:   { flex:1, justifyContent:'center', alignItems:'center', gap:12 },
  loadTxt:    { fontSize:14 },
  header:     { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:20, paddingVertical:14 },
  headerTitle:{ fontSize:28, fontWeight:'800', letterSpacing:-0.5 },
  headerSub:  { fontSize:13, marginTop:2 },
  headerBtn:  { width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center' },
  searchRow:  { flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingBottom:12 },
  searchWrap: { flex:1, flexDirection:'row', alignItems:'center', borderWidth:1, borderRadius:12, height:44 },
  searchInput:{ flex:1, paddingHorizontal:10, fontSize:14, paddingVertical: 0 },
  addBtn:     { width:32, height:32, borderRadius:8, justifyContent:'center', alignItems:'center', marginRight:4 },
  cancelBtn:  { paddingLeft:12, paddingVertical:10 },
  scroll:     { paddingHorizontal:20, paddingBottom:100 },
  
  overviewCard: { borderRadius:18, padding:16, marginBottom:12, borderWidth:1 },
  overviewRow:  { flexDirection:'row', justifyContent:'space-between' },
  overviewItem: { flex:1, alignItems:'center' },
  overviewMid:  { borderLeftWidth:1, borderRightWidth:1, borderColor:'rgba(128,128,128,0.15)' },
  overviewLabel:{ fontSize:11, marginBottom:4 },
  overviewValue:{ fontSize:15, fontWeight:'700' },
  overviewBar:  { flexDirection:'row', alignItems:'center', justifyContent:'center', marginTop:12, paddingVertical:6, borderRadius:12, gap:6 },
  overviewBarTxt:{ fontSize:13, fontWeight:'600' },
  
  portfolioStrip:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', borderRadius:16, padding:16, marginBottom:12, borderWidth:1 },
  portfolioLabel:{ fontSize:11, marginBottom:4 },
  portfolioValue:{ fontSize:24, fontWeight:'800' },
  walletIconWrap:{ width:36, height:36, borderRadius:18, justifyContent:'center', alignItems:'center' },
  
  moversWrap:   { marginBottom:16, gap:10 },
  moverRow:     { gap:6 },
  moverRowHead: { flexDirection:'row', alignItems:'center', gap:5 },
  moverRowTitle:{ fontSize:12, fontWeight:'700' },
  moverChip:    { paddingHorizontal:10, paddingVertical:6, borderRadius:10, alignItems:'center', gap:1, borderWidth:1 },
  moverChipSym: { fontSize:12, fontWeight:'700' },
  moverChipChg: { fontSize:11, fontWeight:'600' },
  
  tab:          { paddingHorizontal:14, paddingVertical:6, borderRadius:12, borderWidth:1 },
  tabTxt:       { fontSize:13, fontWeight:'600' },
  sortRow:      { flexDirection:'row', marginBottom:12, gap:6 },
  sortBtn:      { paddingHorizontal:10, paddingVertical:5, borderRadius:8, borderWidth:1, borderColor:'transparent' },
  sortTxt:      { fontSize:12, fontWeight:'600' },
  empty:        { alignItems:'center', justifyContent:'center', paddingVertical:40, gap:8 },
  emptyTxt:     { fontSize:14 },
  
  listContainer:{ borderRadius:18, borderWidth:1, overflow:'hidden', paddingVertical:4 },
  tokenCard:    { flexDirection:'row', alignItems:'center', padding:12, borderBottomWidth:1 },
  tokenLeft:    { flexDirection:'row', alignItems:'center', flex:1 },
  tokenIcon:    { width:36, height:36, borderRadius:18, justifyContent:'center', alignItems:'center', marginRight:10 },
  tokenIconImg: { width:36, height:36, borderRadius:18 },
  tokenIconTxt: { fontSize:14, fontWeight:'bold' },
  tokenInfo:    { flex:1 },
  tokenSym:     { fontSize:14, fontWeight:'700' },
  tokenName:    { fontSize:11, marginTop:1 },
  badge:        { paddingHorizontal:5, paddingVertical:1, borderRadius:4 },
  badgeTxt:     { fontSize:9, fontWeight:'800' },
  tokenRight:   { flex:1, alignItems:'flex-end' },
  tokenPrice:   { fontSize:14, fontWeight:'700' },
  percentRow:   { flexDirection:'row', alignItems:'center', marginTop:2, gap:2 },
  tokenBadgeTxt:{ fontSize:11, fontWeight:'600' },
  
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  modalBox:     { borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingTop:12, paddingBottom: Platform.OS==='ios'?36:20 },
  modalHandle:  { width:36, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  modalHeader:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  modalTitle:   { fontSize:18, fontWeight:'800' },
  modalClose:   { width:36, height:36, borderRadius:11, justifyContent:'center', alignItems:'center' },
  modalLabel:   { fontSize:12, fontWeight:'600', marginBottom:8 },
  modalInput:   { flexDirection:'row', alignItems:'center', borderWidth:1, borderRadius:12, paddingHorizontal:12, height:46, marginBottom:10 },
  fetchErr:     { fontSize:12, marginBottom:10, textAlign:'center' },
  fetchBtn:     { flexDirection:'row', alignItems:'center', justifyContent:'center', padding:14, borderRadius:12, gap:6, marginBottom:14 },
  fetchBtnTxt:  { color:'#FFF', fontSize:15, fontWeight:'700' },
  preview:      { borderWidth:1, borderRadius:14, padding:14, marginBottom:14 },
  previewTop:   { flexDirection:'row', alignItems:'center', gap:10, marginBottom:12 },
  previewIcon:  { width:40, height:40, borderRadius:20, justifyContent:'center', alignItems:'center' },
  previewSym:   { fontSize:15, fontWeight:'800' },
  previewName:  { fontSize:11, marginTop:2 },
  previewPrice: { fontSize:15, fontWeight:'700' },
  previewBtns:  { flexDirection:'row', gap:10 },
  previewCancel:{ flex:1, padding:12, borderRadius:10, alignItems:'center', borderWidth:1 },
  previewAdd:   { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', padding:12, borderRadius:10, gap:6 },
  previewAddTxt:{ color:'#FFF', fontSize:14, fontWeight:'700' },
});
