// screens/TokenDetailsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Dimensions, Alert, Linking,
  Image, RefreshControl, Platform
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

const fmtPrice = (p) => {
  if (p === undefined || p === null || p === 0) return '$0.00';
  if (p >= 1) return `$${p.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
  if (p >= 0.001) return `$${p.toLocaleString('en-US', { minimumFractionDigits:4, maximumFractionDigits:4 })}`;
  const pStr = p.toFixed(12);
  const leadingZerosMatch = pStr.match(/^0\.(0+)/);
  if (leadingZerosMatch) {
    const zeroCount = leadingZerosMatch[1].length;
    if (zeroCount >= 4) {
      const subscripts = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
      const subStr = zeroCount.toString().split('').map(d => subscripts[parseInt(d)]).join('');
      const significantPart = pStr.slice(2 + zeroCount).slice(0, 4).replace(/0+$/, '');
      return `$0.0${subStr}${significantPart}`;
    }
  }
  return `$${p.toFixed(8).replace(/\.?0+$/, '')}`;
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
    bg:      isDark ? '#07070F' : '#F4F5F9',
    card:    isDark ? '#111122' : '#FFFFFF',
    card2:   isDark ? '#171730' : '#ECECF4',
    text:    isDark ? '#EEEEFF' : '#1C1C24',
    muted:   isDark ? '#7E7EAA' : '#8A8A9E',
    dim:     isDark ? '#505070' : '#9CA3AF',
    border:  isDark ? '#1E1E38' : '#E8E8F2',
    success: '#10B981', error: '#EF4444',
    primary: primaryColor,
  };

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartData,  setChartData]  = useState([]);
  const [sparkline,  setSparkline]  = useState([]);
  const [timeframe,  setTimeframe]  = useState(TIMEFRAMES[0]);
  const [metadata,   setMetadata]   = useState(null);
  const [watchlist,  setWatchlist]  = useState([]);
  const [stats,      setStats]      = useState({
    current:0, change:0, high:0, low:0, open:0,
    volume:0, cap:0, supply:0, maxSupply:0, ath:0, athChg:0, atl:0,
  });

  if (!token) { navigation.goBack(); return null; }

  const up = stats.change >= 0;

  useEffect(() => {
    AsyncStorage.getItem(WATCHLIST_KEY)
      .then(s => { if (s) setWatchlist(JSON.parse(s)); })
      .catch(() => {});
  }, []);

  const toggleWatch = async () => {
    const upd = watchlist.includes(token.symbol)
      ? watchlist.filter(s => s !== token.symbol)
      : [...watchlist, token.symbol];
    setWatchlist(upd);
    await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(upd));
  };

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
        ath:0, athChg:0, atl:0,
        supply:   symbol==='MECO'?1_000_000_000:0,
        maxSupply:symbol==='MECO'?1_000_000_000:0,
      };
    }
    try {
      const res = await fetchWT(
        `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
      );
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
        rank:     d.market_cap_rank            || 'N/A',
        cap:      md.market_cap?.usd           || 0,
        volume:   md.total_volume?.usd         || 0,
        high:     md.high_24h?.usd             || 0,
        low:      md.low_24h?.usd              || 0,
        ath:      md.ath?.usd                  || 0,
        athChg:   md.ath_change_percentage?.usd|| 0,
        atl:      md.atl?.usd                  || 0,
        supply:   md.circulating_supply        || 0,
        maxSupply:md.max_supply                || 0,
      };
    } catch (e) {
      console.warn(`[TokenDetails] Meta failed for ${symbol}:`, e.message);
      return null;
    }
  };

  const fetchAll = async (tf, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [chartResult, meta] = await Promise.all([
        getFullChartData(token.symbol, tf.days, token.mint),
        fetchCoinMeta(token.symbol),
      ]);
      setMetadata(meta);
      const realPrice  = token?.current_price               || 0;
      const realChange = token?.price_change_percentage_24h || 0;
      if (chartResult?.data?.length > 0) {
        setChartData(chartResult.data);
        setSparkline(chartResult.sparklineData || []);
        setStats({
          current:   realPrice > 0 ? realPrice : (chartResult.stats?.currentPrice || 0),
          change:    realChange !== 0 ? realChange : (chartResult.stats?.periodChange || 0),
          open:      chartResult.stats?.openPrice || 0,
          high:      meta?.high   || chartResult.stats?.high      || 0,
          low:       meta?.low    || chartResult.stats?.low       || 0,
          volume:    meta?.volume || chartResult.stats?.volume24h || 0,
          cap:       meta?.cap    || 0,
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
          current:realPrice, change:realChange,
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll(timeframe, true);
  }, [timeframe]);

  const copy    = async () => {
    if (token.mint) { await Clipboard.setStringAsync(token.mint); Alert.alert(t('success'), t('copied_to_clipboard')); }
  };
  const openExp = () => { if (token.mint) Linking.openURL(`https://solscan.io/token/${token.mint}`); };
  const openUrl = (url) => { if (url) Linking.openURL(url); };

  const fmtBig = (n) => {
    if (!n) return 'N/A';
    if (n>=1e12) return `$${(n/1e12).toFixed(2)}T`;
    if (n>=1e9)  return `$${(n/1e9).toFixed(2)}B`;
    if (n>=1e6)  return `$${(n/1e6).toFixed(2)}M`;
    if (n>=1e3)  return `$${(n/1e3).toFixed(2)}K`;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
  };
  const fmtPct = (n) => {
    if (!n && n !== 0) return '0%';
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  };
  const fmtSupply = (n) => {
    if (!n) return 'N/A';
    if (n>=1e9) return `${(n/1e9).toFixed(2)}B`;
    if (n>=1e6) return `${(n/1e6).toFixed(2)}M`;
    return n.toLocaleString();
  };

  const chartH  = 180;
  const visible = chartData.slice(-60);
  const allH    = visible.map(d => d.high);
  const allL    = visible.map(d => d.low);
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
          <TouchableOpacity onPress={() => navigation.goBack()}
            style={[S.iconBtn, { backgroundColor:C.card, borderColor:C.border }]}>
            <Ionicons name="arrow-back" size={18} color={C.text} />
          </TouchableOpacity>
          <View style={S.tokenHead}>
            {token.image && <Image source={{ uri:token.image }} style={S.tokenImg} />}
            <View style={{ alignItems:'flex-start' }}>
              <Text style={[S.sym, { color:C.text }]}>{token.symbol}</Text>
              <Text style={[S.nam, { color:C.muted }]} numberOfLines={1}>{token.name}</Text>
            </View>
          </View>
          <View style={{ flexDirection:'row', gap:8 }}>
            <TouchableOpacity onPress={toggleWatch}
              style={[S.iconBtn, { backgroundColor:C.card, borderColor:C.border }]}>
              <Ionicons
                name={watchlist.includes(token.symbol) ? 'star' : 'star-outline'}
                size={18}
                color={watchlist.includes(token.symbol) ? '#FFB800' : C.text}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={copy}
              style={[S.iconBtn, { backgroundColor:C.card, borderColor:C.border }]}>
              <Ionicons name="copy-outline" size={18} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── السعر + Sparkline ── */}
        <View style={[S.card, { backgroundColor:C.card, borderColor:C.border }]}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <Text style={[S.priceLabel, { color:C.muted }]}>{t('current_price')}</Text>
            <Text style={[S.rankTxt, { color:C.dim }]}>#{metadata?.rank || token.rank || 'N/A'}</Text>
          </View>
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <Text style={[S.price, { color:C.text }]}>{fmtPrice(stats.current)}</Text>
            <View style={[S.changePill, { backgroundColor: up?'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)' }]}>
              <Ionicons name={up?'trending-up':'trending-down'} size={12} color={up?C.success:C.error} />
              <Text style={[S.changeTxt, { color: up?C.success:C.error }]}>{fmtPct(stats.change)}</Text>
            </View>
          </View>
          {sparkline.length > 1 && (
            <View style={S.sparkWrap}>
              {sparkline.map((v, i) => {
                const mn = Math.min(...sparkline), mx = Math.max(...sparkline), rng = mx-mn||1;
                const h  = Math.max(((v-mn)/rng)*30, 2);
                const isUp = i === 0 ? up : v >= sparkline[i-1];
                return <View key={i} style={[S.sparkBar, { height:h, backgroundColor: isUp?C.success:C.error }]} />;
              })}
            </View>
          )}
        </View>

        {/* ── أزرار العمليات ── */}
        <View style={S.actions}>
          {/* إرسال */}
          <TouchableOpacity
            style={[S.actionBtn, { backgroundColor:C.primary }]}
            onPress={() => navigation.navigate('Send', { preselectedToken:token.symbol })}
          >
            <Ionicons name="send" size={15} color="#FFF" />
            <Text style={S.actionTxt}>{t('send')}</Text>
          </TouchableOpacity>

          {/* ✅ شراء — يفتح شاشة التداول بدلاً من Swap */}
          {token.swapAvailable !== false && (
            <TouchableOpacity
              style={[S.actionBtn, { backgroundColor:C.success }]}
              onPress={() => navigation.navigate('Trading', { token })}
            >
              <Ionicons name="trending-up" size={15} color="#FFF" />
              <Text style={S.actionTxt}>{t('buy', 'شراء')}</Text>
            </TouchableOpacity>
          )}

          {/* مستكشف */}
          <TouchableOpacity
            style={[S.actionBtn, { backgroundColor: isDark?'#171730':'#ECECF4', borderColor:C.border, borderWidth:1 }]}
            onPress={openExp}
          >
            <Ionicons name="bar-chart-outline" size={15} color={C.text} />
            <Text style={[S.actionTxt, { color:C.text }]}>{t('explorer')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── التبويب الزمني ── */}
        <View style={[S.card, { backgroundColor:C.card, borderColor:C.border, padding:12 }]}>
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

        {/* ── الرسم البياني ── */}
        <View style={[S.card, { backgroundColor:C.card, borderColor:C.border, minHeight:220 }]}>
          {loading ? (
            <View style={S.chartLoad}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={[{ fontSize:12, marginTop:8 }, { color:C.muted }]}>{t('loading')}</Text>
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
                    <View style={[S.wick, { top:wTop, height:Math.max(wH,1), backgroundColor:color, opacity:0.3 }]} />
                    <View style={[S.body, { top:bTop, height:bH, backgroundColor:color }]} />
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={S.chartLoad}>
              <Ionicons name="analytics-outline" size={36} color={C.dim} />
              <Text style={[{ fontSize:13, marginTop:8 }, { color:C.muted }]}>{t('no_chart_data')}</Text>
            </View>
          )}
        </View>

        {/* ── OHLC ── */}
        <View style={[S.card, { backgroundColor:C.card, borderColor:C.border }]}>
          <Text style={[S.secTitle, { color:C.text }]}>{t('ohlc_stats')}</Text>
          <View style={S.grid}>
            {[
              { k:'ohlc_open',  v:fmtPrice(stats.open),    c:C.text    },
              { k:'ohlc_high',  v:fmtPrice(stats.high),    c:C.success },
              { k:'ohlc_low',   v:fmtPrice(stats.low),     c:C.error   },
              { k:'ohlc_close', v:fmtPrice(stats.current), c:C.text    },
            ].map(item => (
              <View key={item.k} style={[S.gridItem, { backgroundColor:C.bg, borderColor:C.border }]}>
                <Text style={[S.gridLabel, { color:C.muted }]}>{t(item.k)}</Text>
                <Text style={[S.gridValue, { color:item.c }]}>{item.v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── إحصائيات السوق ── */}
        <View style={[S.card, { backgroundColor:C.card, borderColor:C.border }]}>
          <Text style={[S.secTitle, { color:C.text }]}>{t('market_stats')}</Text>
          <View style={S.grid}>
            {[
              { k:'market_cap',         v:fmtBig(stats.cap)    },
              { k:'volume_24h_label',   v:fmtBig(stats.volume) },
              { k:'circulating_supply', v:fmtSupply(stats.supply)   },
              { k:'max_supply',         v:stats.maxSupply>0 ? fmtSupply(stats.maxSupply) : '∞' },
            ].map(item => (
              <View key={item.k} style={[S.gridItem, { backgroundColor:C.bg, borderColor:C.border }]}>
                <Text style={[S.gridLabel, { color:C.muted }]}>{t(item.k)}</Text>
                <Text style={[S.gridValue, { color:C.text }]}>{item.v}</Text>
              </View>
            ))}
          </View>
          {stats.ath > 0 && (
            <View style={[S.athRow, { borderTopColor:C.border }]}>
              <View style={S.athItem}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:4, marginBottom:4 }}>
                  <Ionicons name="trophy" size={13} color="#FFB800" />
                  <Text style={[S.athLabel, { color:C.muted }]}>{t('ath')}</Text>
                </View>
                <Text style={[S.athVal, { color:C.text }]}>{fmtPrice(stats.ath)}</Text>
                <Text style={[S.athChg, { color:C.error }]}>{fmtPct(stats.athChg)}</Text>
              </View>
              <View style={[S.athDivider, { backgroundColor:C.border }]} />
              <View style={S.athItem}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:4, marginBottom:4 }}>
                  <Ionicons name="flag" size={13} color={C.success} />
                  <Text style={[S.athLabel, { color:C.muted }]}>{t('atl')}</Text>
                </View>
                <Text style={[S.athVal, { color:C.text }]}>{fmtPrice(stats.atl)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── الوصف ── */}
        {(metadata?.description || token.description) && (
          <View style={[S.card, { backgroundColor:C.card, borderColor:C.border }]}>
            <Text style={[S.secTitle, { color:C.text }]}>{t('about_token')}</Text>
            <Text style={[S.desc, { color:C.muted }]}>
              {(metadata?.description || token.description || '').replace(/<[^>]+>/g,'').slice(0,400)}
              {(metadata?.description||'').length > 400 ? '...' : ''}
            </Text>
          </View>
        )}

        {/* ── الروابط ── */}
        {metadata?.links && Object.values(metadata.links).some(Boolean) && (
          <View style={[S.card, { backgroundColor:C.card, borderColor:C.border }]}>
            <Text style={[S.secTitle, { color:C.text }]}>{t('official_links')}</Text>
            <View style={S.links}>
              {[
                { key:'website', icon:'globe-outline',       color:C.text,    label:t('website')  },
                { key:'twitter', icon:'logo-twitter',        color:'#1DA1F2', label:t('twitter')  },
                { key:'telegram',icon:'paper-plane-outline', color:'#0088CC', label:t('telegram') },
              ].filter(l => metadata.links[l.key]).map(l => (
                <TouchableOpacity key={l.key}
                  style={[S.linkBtn, { backgroundColor:C.bg, borderColor:C.border }]}
                  onPress={() => openUrl(metadata.links[l.key])}>
                  <Ionicons name={l.icon} size={14} color={l.color} />
                  <Text style={[S.linkTxt, { color:C.text }]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[S.linkBtn, { backgroundColor:C.bg, borderColor:C.border }]} onPress={openExp}>
                <Ionicons name="bar-chart-outline" size={14} color={C.primary} />
                <Text style={[S.linkTxt, { color:C.text }]}>Solscan</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── عنوان العقد ── */}
        {token.mint && (
          <View style={[S.card, { backgroundColor:C.card, borderColor:C.border }]}>
            <Text style={[S.mintLabel, { color:C.muted }]}>{t('contract_address')}</Text>
            <View style={S.mintRow}>
              <Text style={[S.mintAddr, { color:C.text }]} numberOfLines={1}>{token.mint}</Text>
              <TouchableOpacity onPress={copy}
                style={[S.copyIconWrap, { backgroundColor:C.bg, borderColor:C.border }]}>
                <Ionicons name="copy" size={14} color={C.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root:       { flex:1 },
  scroll:     { padding:20, paddingBottom:60 },
  header:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:16 },
  iconBtn:    { width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center', borderWidth:1 },
  tokenHead:  { flex:1, flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:12 },
  tokenImg:   { width:34, height:34, borderRadius:17 },
  sym:        { fontSize:16, fontWeight:'800' },
  nam:        { fontSize:11, marginTop:1 },
  card:       { borderRadius:18, padding:16, marginBottom:12, borderWidth:1, elevation:1, shadowOffset:{width:0,height:2}, shadowOpacity:0.02, shadowRadius:4 },
  priceLabel: { fontSize:12, fontWeight:'600' },
  rankTxt:    { fontSize:11, fontWeight:'600' },
  price:      { fontSize:30, fontWeight:'800', letterSpacing:-0.5 },
  changePill: { flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:5, borderRadius:12, gap:4 },
  changeTxt:  { fontSize:12, fontWeight:'700' },
  sparkWrap:  { flexDirection:'row', alignItems:'flex-end', height:32, marginTop:14, gap:2 },
  sparkBar:   { flex:1, borderRadius:1 },
  actions:    { flexDirection:'row', gap:8, marginBottom:12 },
  actionBtn:  { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:12, borderRadius:14, gap:6 },
  actionTxt:  { fontSize:12, fontWeight:'700', color:'#FFF' },
  secTitle:   { fontSize:14, fontWeight:'800', marginBottom:12 },
  tfRow:      { flexDirection:'row', justifyContent:'space-between', width:'100%' },
  tfBtn:      { flex:1, paddingVertical:8, alignItems:'center', borderRadius:10, marginHorizontal:2 },
  tfTxt:      { fontSize:12, fontWeight:'700' },
  chartArea:  { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:4, overflow:'hidden' },
  chartLoad:  { alignItems:'center', justifyContent:'center', height:180, gap:8 },
  candle:     { flex:1, height:'100%', alignItems:'center' },
  wick:       { position:'absolute', width:1 },
  body:       { position:'absolute', width:'55%', borderRadius:1 },
  grid:       { flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', gap:8 },
  gridItem:   { width:'48%', paddingVertical:10, paddingHorizontal:12, borderRadius:12, borderWidth:1 },
  gridLabel:  { fontSize:11, marginBottom:4 },
  gridValue:  { fontSize:14, fontWeight:'700' },
  athRow:     { flexDirection:'row', alignItems:'center', marginTop:14, paddingTop:14, borderTopWidth:1 },
  athItem:    { flex:1, alignItems:'center', gap:2 },
  athDivider: { width:1, height:44, marginHorizontal:12 },
  athLabel:   { fontSize:11, fontWeight:'600' },
  athVal:     { fontSize:14, fontWeight:'700' },
  athChg:     { fontSize:11, fontWeight:'600' },
  desc:       { fontSize:13, lineHeight:18 },
  links:      { flexDirection:'row', flexWrap:'wrap', gap:8 },
  linkBtn:    { flexDirection:'row', alignItems:'center', paddingHorizontal:12, paddingVertical:8, borderRadius:12, borderWidth:1, gap:6 },
  linkTxt:    { fontSize:12, fontWeight:'600' },
  mintLabel:  { fontSize:11, marginBottom:6, fontWeight:'600' },
  mintRow:    { flexDirection:'row', alignItems:'center', gap:8 },
  mintAddr:   { flex:1, fontSize:11, fontFamily:'monospace' },
  copyIconWrap:{ width:32, height:32, borderRadius:8, justifyContent:'center', alignItems:'center', borderWidth:1 },
});
