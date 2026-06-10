// screens/TokenDetailsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Dimensions, Alert, Linking,
  Image, RefreshControl,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFullChartData } from '../services/priceChartService';

const { width } = Dimensions.get('window');
const WATCHLIST_KEY = '@meco_watchlist';
const FETCH_TIMEOUT = 8000;
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

const TIMEFRAMES = [
  { label:'1D',  days:1   },
  { label:'7D',  days:7   },
  { label:'30D', days:30  },
  { label:'90D', days:90  },
  { label:'1Y',  days:365 },
];

const COINGECKO_IDS = {
  SOL:'solana', USDT:'tether', USDC:'usd-coin',
  JUP:'jupiter-exchange-solana', RAY:'raydium', BONK:'bonk',
  WIF:'dogwifcoin', PYTH:'pyth-network', JTO:'jito-governance-token',
  HNT:'helium', ORCA:'orca', MNDE:'marinade',
  BOME:'book-of-meme', POPCAT:'popcat', MEW:'cat-in-a-dogs-world',
};

const fetchWT = (url, ms = FETCH_TIMEOUT) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal:ctrl.signal, headers:{ Accept:'application/json' } })
    .finally(() => clearTimeout(timer));
};

export default function TokenDetailsScreen() {
  const navigation   = useNavigation();
  const route        = useRoute();
  const { t }        = useTranslation();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';
  const { token }    = route.params || {};

  const C = {
    bg:      isDark ? '#0A0A0F' : '#F5F6FA',
    card:    isDark ? '#1A1A2E' : '#FFFFFF',
    card2:   isDark ? '#252540' : '#F0F4F8',
    text:    isDark ? '#FFFFFF' : '#1A1A2E',
    muted:   isDark ? '#A0A0B0' : '#6B7280',
    dim:     isDark ? '#6B7280' : '#9CA3AF',
    border:  isDark ? '#2A2A3E' : '#E5E7EB',
    success: '#10B981', error: '#EF4444',
    primary: primaryColor,
  };

  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [chartData,   setChartData]   = useState([]);
  const [sparkline,   setSparkline]   = useState([]);
  const [timeframe,   setTimeframe]   = useState(TIMEFRAMES[0]);
  const [metadata,    setMetadata]    = useState(null);
  const [watchlist,   setWatchlist]   = useState([]);
  const [stats,       setStats]       = useState({
    current:0, change:0, high:0, low:0, open:0,
    volume:0, cap:0, supply:0, maxSupply:0, ath:0, athChg:0, atl:0,
  });

  if (!token) { navigation.goBack(); return null; }

  const up = stats.change >= 0;

  useEffect(() => {
    AsyncStorage.getItem(WATCHLIST_KEY).then(s => { if (s) setWatchlist(JSON.parse(s)); }).catch(()=>{});
  }, []);

  const toggleWatch = async () => {
    const upd = watchlist.includes(token.symbol)
      ? watchlist.filter(s => s !== token.symbol)
      : [...watchlist, token.symbol];
    setWatchlist(upd);
    await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(upd));
  };

  // ─── جلب بيانات العملة (وصف، روابط، إحصائيات) ───────────────────────────
  const fetchCoinMeta = async (symbol) => {
    const coinId = COINGECKO_IDS[symbol];
    if (!coinId) {
      return {
        description: symbol === 'MECO' ? t('meco_description') : (token.description || ''),
        links: symbol === 'MECO' ? {
          website:'https://monycoin.github.io/meco-token/',
          twitter:'https://twitter.com/MoniCoinMECO',
          telegram:'https://t.me/monycoin1',
        } : {},
        rank:'N/A', cap:token?.market_cap||0, volume:0, high:0, low:0,
        ath:0, athChg:0, atl:0, supply: symbol==='MECO'?1_000_000_000:0, maxSupply: symbol==='MECO'?1_000_000_000:0,
      };
    }
    try {
      const res = await fetchWT(`${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d  = await res.json();
      const md = d.market_data || {};
      return {
        description: d.description?.en || '',
        links: {
          website:  d.links?.homepage?.[0] || null,
          twitter:  d.links?.twitter_screen_name ? `https://twitter.com/${d.links.twitter_screen_name}` : null,
          telegram: d.links?.telegram_channel_identifier ? `https://t.me/${d.links.telegram_channel_identifier}` : null,
        },
        rank:     d.market_cap_rank        || 'N/A',
        cap:      md.market_cap?.usd       || 0,
        volume:   md.total_volume?.usd     || 0,
        high:     md.high_24h?.usd         || 0,
        low:      md.low_24h?.usd          || 0,
        ath:      md.ath?.usd              || 0,
        athChg:   md.ath_change_percentage?.usd || 0,
        atl:      md.atl?.usd              || 0,
        supply:   md.circulating_supply    || 0,
        maxSupply:md.max_supply            || 0,
      };
    } catch (e) {
      console.warn(`[TokenDetails] Meta failed for ${symbol}:`, e.message);
      return null;
    }
  };

  // ─── جلب كل البيانات — الرسم البياني من priceChartService ────────────────
  const fetchAll = async (tf, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      // ✅ priceChartService يعامل MECO وكل العملات بنفس المنطق
      const [chartResult, meta] = await Promise.all([
        getFullChartData(token.symbol, tf.days, token.mint),
        fetchCoinMeta(token.symbol),
      ]);

      setMetadata(meta);

      const realPrice  = token?.current_price              || 0;
      const realChange = token?.price_change_percentage_24h || 0;

      if (chartResult?.data?.length > 0) {
        setChartData(chartResult.data);
        setSparkline(chartResult.sparklineData || []);
        setStats({
          current:   realPrice > 0 ? realPrice : (chartResult.stats?.currentPrice || 0),
          change:    realChange !== 0 ? realChange : (chartResult.stats?.periodChange || 0),
          open:      chartResult.stats?.openPrice || 0,
          high:      meta?.high || chartResult.stats?.high || 0,
          low:       meta?.low  || chartResult.stats?.low  || 0,
          volume:    meta?.volume || chartResult.stats?.volume24h || 0,
          cap:       meta?.cap   || 0,
          supply:    meta?.supply    || 0,
          maxSupply: meta?.maxSupply || 0,
          ath:       meta?.ath    || 0,
          athChg:    meta?.athChg || 0,
          atl:       meta?.atl    || 0,
        });
      } else {
        setChartData([]);
        setSparkline([]);
        setStats({
          current:   realPrice,
          change:    realChange,
          open:0, high:meta?.high||0, low:meta?.low||0,
          volume:meta?.volume||0, cap:meta?.cap||0,
          supply:meta?.supply||0, maxSupply:meta?.maxSupply||0,
          ath:meta?.ath||0, athChg:meta?.athChg||0, atl:meta?.atl||0,
        });
      }
    } catch (e) {
      console.warn('fetchAll error:', e.message);
    } finally {
      if (!isRefresh) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => { if (token?.symbol) fetchAll(timeframe); }, [timeframe, token?.symbol]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchAll(timeframe, true); }, [timeframe]);

  const copy    = async () => { if (token.mint) { await Clipboard.setStringAsync(token.mint); Alert.alert(t('success'), t('copied_to_clipboard')); } };
  const openExp = () => { if (token.mint) Linking.openURL(`https://solscan.io/token/${token.mint}`); };
  const openUrl = (url) => { if (url) Linking.openURL(url); };

  const fmtBig = (n) => {
    if (!n) return 'N/A';
    if (n>=1e12) return `$${(n/1e12).toFixed(2)}T`;
    if (n>=1e9)  return `$${(n/1e9).toFixed(2)}B`;
    if (n>=1e6)  return `$${(n/1e6).toFixed(2)}M`;
    if (n>=1e3)  return `$${(n/1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };
  const fmtPrice = (p) => {
    if (!p) return '$0.00';
    if (p<0.000001) return `$${p.toFixed(8)}`;
    if (p<0.0001) return `$${p.toFixed(6)}`;
    if (p<1)      return `$${p.toFixed(4)}`;
    return `$${p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  };
  const fmtPct = (n) => { if (!n&&n!==0) return '0%'; return `${n>=0?'+':''}${n.toFixed(2)}%`; };
  const fmtSupply = (n) => { if (!n) return 'N/A'; if (n>=1e9) return `${(n/1e9).toFixed(2)}B`; if (n>=1e6) return `${(n/1e6).toFixed(2)}M`; return n.toLocaleString(); };

  const chartH  = 180;
  const visible = chartData.slice(-60);
  const allH    = visible.map(d=>d.high),  allL = visible.map(d=>d.low);
  const cMax    = allH.length ? Math.max(...allH) * 1.01 : 1;
  const cMin    = allL.length ? Math.min(...allL) * 0.99 : 0;
  const cRange  = cMax - cMin || 1;

  return (
    <SafeAreaView style={[S.root, { backgroundColor:C.bg }]}>
      <ScrollView
        contentContainerStyle={S.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[S.iconBtn, { backgroundColor:C.primary+'18' }]}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <View style={S.tokenHead}>
            {token.image && <Image source={{ uri:token.image }} style={S.tokenImg} />}
            <View>
              <Text style={[S.sym, { color:C.text }]}>{token.symbol}</Text>
              <Text style={[S.nam, { color:C.muted }]}>{token.name}</Text>
            </View>
          </View>
          <View style={{ flexDirection:'row', gap:8 }}>
            <TouchableOpacity onPress={toggleWatch} style={[S.iconBtn, { backgroundColor:C.primary+'18' }]}>
              <Ionicons name={watchlist.includes(token.symbol)?'star':'star-outline'} size={22} color={watchlist.includes(token.symbol)?'#FFB800':C.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={copy} style={[S.iconBtn, { backgroundColor:C.primary+'18' }]}>
              <Ionicons name="copy-outline" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Price Card ── */}
        <View style={[S.card, { backgroundColor:C.card }]}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <Text style={[S.priceLabel, { color:C.muted }]}>{t('current_price')}</Text>
            <Text style={[S.rankTxt, { color:C.dim }]}>#{metadata?.rank || token.rank || 'N/A'}</Text>
          </View>
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <Text style={[S.price, { color:C.text }]}>{fmtPrice(stats.current)}</Text>
            <View style={[S.changePill, { backgroundColor: up?C.success+'20':C.error+'20' }]}>
              <Ionicons name={up?'trending-up':'trending-down'} size={14} color={up?C.success:C.error} />
              <Text style={[S.changeTxt, { color: up?C.success:C.error }]}>{fmtPct(stats.change)}</Text>
            </View>
          </View>
          {/* Sparkline mini */}
          {sparkline.length > 1 && (
            <View style={S.sparkWrap}>
              {sparkline.map((v, i) => {
                const mn = Math.min(...sparkline), mx = Math.max(...sparkline), rng = mx-mn||1;
                const h  = Math.max(((v-mn)/rng)*36, 2);
                const isUp = i===0 ? up : v >= sparkline[i-1];
                return <View key={i} style={[S.sparkBar, { height:h, backgroundColor: isUp?C.success:C.error }]} />;
              })}
            </View>
          )}
        </View>

        {/* ── Quick Actions ── */}
        <View style={S.actions}>
          <TouchableOpacity style={[S.actionBtn, { backgroundColor:C.primary }]} onPress={() => navigation.navigate('Send', { preselectedToken:token.symbol })}>
            <Ionicons name="send" size={18} color="#FFF" />
            <Text style={S.actionTxt}>{t('send')}</Text>
          </TouchableOpacity>
          {token.swapAvailable !== false && (
            <TouchableOpacity style={[S.actionBtn, { backgroundColor:C.success }]} onPress={() => navigation.navigate('Swap', { fromToken:token.symbol })}>
              <Ionicons name="swap-horizontal" size={18} color="#FFF" />
              <Text style={S.actionTxt}>{t('swap_title')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[S.actionBtn, { backgroundColor:C.card2 }]} onPress={openExp}>
            <Ionicons name="bar-chart-outline" size={18} color={C.text} />
            <Text style={[S.actionTxt, { color:C.text }]}>{t('explorer')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Timeframe ── */}
        <View style={[S.card, { backgroundColor:C.card }]}>
          <Text style={[S.secTitle, { color:C.text }]}>{t('chart_timeframe')}</Text>
          <View style={S.tfRow}>
            {TIMEFRAMES.map(tf => (
              <TouchableOpacity
                key={tf.label}
                style={[S.tfBtn, timeframe.label===tf.label && { backgroundColor:C.primary }]}
                onPress={() => setTimeframe(tf)}
              >
                <Text style={[S.tfTxt, { color: timeframe.label===tf.label?'#FFF':C.muted }]}>{tf.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Chart ── */}
        <View style={[S.card, { backgroundColor:C.card, minHeight:220 }]}>
          {loading ? (
            <View style={S.chartLoad}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={[{ fontSize:13, marginTop:8 }, { color:C.muted }]}>{t('loading')}</Text>
            </View>
          ) : chartData.length > 0 ? (
            <View style={[S.chartArea, { height:chartH }]}>
              {visible.map((pt, i) => {
                const green = pt.close >= pt.open;
                const color = green ? C.success : C.error;
                const bTop  = chartH - ((Math.max(pt.open,pt.close) - cMin)/cRange)*chartH;
                const bH    = Math.max(((Math.abs(pt.close-pt.open))/cRange)*chartH, 2);
                const wTop  = chartH - ((pt.high - cMin)/cRange)*chartH;
                const wH    = ((pt.high - pt.low)/cRange)*chartH;
                return (
                  <View key={i} style={S.candle}>
                    <View style={[S.wick, { top:wTop, height:Math.max(wH,1), backgroundColor:color, opacity:0.5 }]} />
                    <View style={[S.body, { top:bTop, height:bH, backgroundColor:color }]} />
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={S.chartLoad}>
              <Ionicons name="analytics-outline" size={44} color={C.dim} />
              <Text style={[{ fontSize:14, marginTop:8 }, { color:C.muted }]}>{t('no_chart_data')}</Text>
            </View>
          )}
        </View>

        {/* ── OHLC ── */}
        <View style={[S.card, { backgroundColor:C.card }]}>
          <Text style={[S.secTitle, { color:C.text }]}>{t('ohlc_stats')}</Text>
          <View style={S.grid}>
            {[
              { k:'ohlc_open',  v:fmtPrice(stats.open),    c:C.text    },
              { k:'ohlc_high',  v:fmtPrice(stats.high),    c:C.success },
              { k:'ohlc_low',   v:fmtPrice(stats.low),     c:C.error   },
              { k:'ohlc_close', v:fmtPrice(stats.current), c:C.text    },
            ].map(item => (
              <View key={item.k} style={[S.gridItem, { backgroundColor:C.primary+'0A' }]}>
                <Text style={[S.gridLabel, { color:C.muted }]}>{t(item.k)}</Text>
                <Text style={[S.gridValue, { color:item.c }]}>{item.v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Market Stats ── */}
        <View style={[S.card, { backgroundColor:C.card }]}>
          <Text style={[S.secTitle, { color:C.text }]}>{t('market_stats')}</Text>
          <View style={S.grid}>
            {[
              { k:'market_cap',       v:fmtBig(stats.cap)           },
              { k:'volume_24h_label', v:fmtBig(stats.volume)        },
              { k:'circulating_supply', v:fmtSupply(stats.supply)   },
              { k:'max_supply',       v:stats.maxSupply>0 ? fmtSupply(stats.maxSupply) : '∞' },
            ].map(item => (
              <View key={item.k} style={[S.gridItem, { backgroundColor:C.primary+'0A' }]}>
                <Text style={[S.gridLabel, { color:C.muted }]}>{t(item.k)}</Text>
                <Text style={[S.gridValue, { color:C.text }]}>{item.v}</Text>
              </View>
            ))}
          </View>
          {stats.ath > 0 && (
            <View style={[S.athRow, { borderTopColor:C.border }]}>
              <View style={S.athItem}>
                <Ionicons name="trophy" size={14} color="#FFB800" />
                <Text style={[S.athLabel, { color:C.muted }]}>{t('ath')}</Text>
                <Text style={[S.athVal, { color:C.text }]}>{fmtPrice(stats.ath)}</Text>
                <Text style={[S.athChg, { color:C.error }]}>{fmtPct(stats.athChg)}</Text>
              </View>
              <View style={[S.athDivider, { backgroundColor:C.border }]} />
              <View style={S.athItem}>
                <Ionicons name="flag" size={14} color={C.success} />
                <Text style={[S.athLabel, { color:C.muted }]}>{t('atl')}</Text>
                <Text style={[S.athVal, { color:C.text }]}>{fmtPrice(stats.atl)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Description ── */}
        {(metadata?.description || token.description) && (
          <View style={[S.card, { backgroundColor:C.card }]}>
            <Text style={[S.secTitle, { color:C.text }]}>{t('about_token')}</Text>
            <Text style={[S.desc, { color:C.muted }]}>
              {(metadata?.description || token.description || '').replace(/<[^>]+>/g,'').slice(0,400)}
              {(metadata?.description||'').length > 400 ? '...' : ''}
            </Text>
          </View>
        )}

        {/* ── Links ── */}
        {metadata?.links && Object.values(metadata.links).some(Boolean) && (
          <View style={[S.card, { backgroundColor:C.card }]}>
            <Text style={[S.secTitle, { color:C.text }]}>{t('official_links')}</Text>
            <View style={S.links}>
              {[
                { key:'website', icon:'globe-outline',      color:C.text,    label:t('website')  },
                { key:'twitter', icon:'logo-twitter',       color:'#1DA1F2', label:t('twitter')  },
                { key:'telegram',icon:'paper-plane-outline',color:'#0088CC', label:t('telegram') },
              ].filter(l => metadata.links[l.key]).map(l => (
                <TouchableOpacity key={l.key} style={[S.linkBtn, { backgroundColor:C.card2, borderColor:C.border }]} onPress={() => openUrl(metadata.links[l.key])}>
                  <Ionicons name={l.icon} size={16} color={l.color} />
                  <Text style={[S.linkTxt, { color:C.text }]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[S.linkBtn, { backgroundColor:C.card2, borderColor:C.border }]} onPress={openExp}>
                <Ionicons name="bar-chart-outline" size={16} color={C.primary} />
                <Text style={[S.linkTxt, { color:C.text }]}>Solscan</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Contract Address ── */}
        {token.mint && (
          <View style={[S.card, { backgroundColor:C.card }]}>
            <Text style={[S.mintLabel, { color:C.muted }]}>{t('contract_address')}</Text>
            <View style={S.mintRow}>
              <Text style={[S.mintAddr, { color:C.text }]} numberOfLines={1}>{token.mint}</Text>
              <TouchableOpacity onPress={copy} style={{ padding:8 }}>
                <Ionicons name="copy" size={16} color={C.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root:   { flex:1 },
  scroll: { padding:16, paddingBottom:50 },
  header: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:16 },
  iconBtn:{ padding:8, borderRadius:12 },
  tokenHead:{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10 },
  tokenImg: { width:36, height:36, borderRadius:18 },
  sym:  { fontSize:18, fontWeight:'800', textAlign:'center' },
  nam:  { fontSize:12, marginTop:1, textAlign:'center' },
  card: { borderRadius:20, padding:18, marginBottom:14, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:2 },
  priceLabel:{ fontSize:13, fontWeight:'500' },
  rankTxt:   { fontSize:12, fontWeight:'600' },
  price:     { fontSize:34, fontWeight:'900', letterSpacing:-1 },
  changePill:{ flexDirection:'row', alignItems:'center', paddingHorizontal:12, paddingVertical:7, borderRadius:20, gap:5 },
  changeTxt: { fontSize:14, fontWeight:'700' },
  sparkWrap: { flexDirection:'row', alignItems:'flex-end', height:40, marginTop:14, gap:2 },
  sparkBar:  { flex:1, borderRadius:1 },
  actions:   { flexDirection:'row', gap:10, marginBottom:14 },
  actionBtn: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:14, borderRadius:16, gap:7 },
  actionTxt: { fontSize:13, fontWeight:'700', color:'#FFF' },
  secTitle:  { fontSize:15, fontWeight:'700', marginBottom:14 },
  tfRow:     { flexDirection:'row', justifyContent:'space-between' },
  tfBtn:     { flex:1, paddingVertical:10, alignItems:'center', borderRadius:12, marginHorizontal:3 },
  tfTxt:     { fontSize:13, fontWeight:'600' },
  chartArea: { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:4, overflow:'hidden' },
  chartLoad: { alignItems:'center', justifyContent:'center', height:180, gap:8 },
  candle:    { flex:1, height:'100%', alignItems:'center' },
  wick:      { position:'absolute', width:1 },
  body:      { position:'absolute', width:'55%', borderRadius:1 },
  grid:      { flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', gap:10 },
  gridItem:  { width:'47%', paddingVertical:12, paddingHorizontal:14, borderRadius:14 },
  gridLabel: { fontSize:11, marginBottom:5 },
  gridValue: { fontSize:15, fontWeight:'700' },
  athRow:    { flexDirection:'row', alignItems:'center', marginTop:16, paddingTop:16, borderTopWidth:1 },
  athItem:   { flex:1, alignItems:'center', gap:4 },
  athDivider:{ width:1, height:50, marginHorizontal:12 },
  athLabel:  { fontSize:11 },
  athVal:    { fontSize:14, fontWeight:'700' },
  athChg:    { fontSize:11, fontWeight:'600' },
  desc:      { fontSize:14, lineHeight:22 },
  links:     { flexDirection:'row', flexWrap:'wrap', gap:10 },
  linkBtn:   { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:10, borderRadius:12, borderWidth:1, gap:7 },
  linkTxt:   { fontSize:13, fontWeight:'500' },
  mintLabel: { fontSize:12, marginBottom:8 },
  mintRow:   { flexDirection:'row', alignItems:'center' },
  mintAddr:  { flex:1, fontSize:12, fontFamily:'monospace' },
});
