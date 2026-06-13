// screens/TradingScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, ActivityIndicator, TextInput, Platform,
  Animated, FlatList, Image, SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { getFullChartData } from '../services/priceChartService';
import { getJupiterMarketData, CORE_TOKENS } from '../services/jupiterMarketService';

const { width, height } = Dimensions.get('window');
const CHART_H = Math.round(height * 0.40);

const TIMEFRAMES = [
  { label:'1D', days:1 },
  { label:'7D', days:7 },
  { label:'30D',days:30 },
  { label:'3M', days:90 },
  { label:'1Y', days:365 },
];

// ─── TradingView chart HTML ───────────────────────────────────────────────────
const buildChartHtml = (isDark, accentColor) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden;background:${isDark?'#0F0F1E':'#FFFFFF'}}
    #chart{width:100%;height:100vh}
    #tooltip{
      position:absolute;top:12px;left:12px;z-index:100;
      background:${isDark?'rgba(15,15,30,0.9)':'rgba(255,255,255,0.9)'};
      border:1px solid ${isDark?'#2A2A3E':'#E5E7EB'};
      border-radius:10px;padding:8px 12px;font-size:12px;
      color:${isDark?'#EEEEFF':'#0D0D1A'};display:none;
      font-family:-apple-system,sans-serif;
    }
    #tooltip span{display:block;margin:1px 0}
    .lbl{color:${isDark?'#6060A0':'#9090A8'};font-size:11px}
    .val{font-weight:700;font-size:13px}
    .up{color:#10B981}.dn{color:#EF4444}
  </style>
</head>
<body>
  <div id="chart"></div>
  <div id="tooltip">
    <span class="lbl" id="ttime"></span>
    <span class="val" id="topen"></span>
    <span class="val up" id="thigh"></span>
    <span class="val dn" id="tlow"></span>
    <span class="val" id="tclose"></span>
  </div>
<script>
const BG    = '${isDark?'#0F0F1E':'#FFFFFF'}';
const GRID  = '${isDark?'#1E1E38':'#F0F0F8'}';
const TEXT  = '${isDark?'#8080A0':'#9090A8'}';
const ACCENT= '${accentColor}';

const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  width:  window.innerWidth,
  height: window.innerHeight,
  layout: { background:{ type:'solid', color:BG }, textColor:TEXT, fontSize:11 },
  grid:   { vertLines:{ color:GRID }, horzLines:{ color:GRID } },
  crosshair: { mode:LightweightCharts.CrosshairMode.Normal,
    vertLine:{ color:ACCENT+'80', width:1, style:0, labelBackgroundColor:ACCENT },
    horzLine:{ color:ACCENT+'80', width:1, style:0, labelBackgroundColor:ACCENT },
  },
  rightPriceScale: { borderColor:GRID },
  timeScale:       { borderColor:GRID, timeVisible:true, secondsVisible:false },
  handleScroll:    { mouseWheel:true, pressedMouseMove:true, horzTouchDrag:true },
  handleScale:     { axisPressedMouseMove:true, mouseWheel:true, pinch:true },
});

const candles = chart.addCandlestickSeries({
  upColor:'#10B981', downColor:'#EF4444',
  borderUpColor:'#10B981', borderDownColor:'#EF4444',
  wickUpColor:'#10B981', wickDownColor:'#EF4444',
});

const volSeries = chart.addHistogramSeries({
  priceFormat:{ type:'volume' },
  priceScaleId:'vol',
  color:'#3B82F620',
});
chart.priceScale('vol').applyOptions({ scaleMargins:{ top:0.85, bottom:0 } });

const tooltip = document.getElementById('tooltip');
chart.subscribeCrosshairMove(param => {
  if (!param.time || !param.seriesData.size) { tooltip.style.display='none'; return; }
  const data = param.seriesData.get(candles);
  if (!data) return;
  const d = new Date(param.time*1000);
  document.getElementById('ttime').textContent  = d.toLocaleDateString();
  document.getElementById('topen').textContent  = 'O: '+data.open.toFixed(6);
  document.getElementById('thigh').textContent  = 'H: '+data.high.toFixed(6);
  document.getElementById('tlow').textContent   = 'L: '+data.low.toFixed(6);
  document.getElementById('tclose').textContent = 'C: '+data.close.toFixed(6);
  tooltip.style.display = 'block';
});

window.setChartData = function(candleData, volData, priceDecimals) {
  if(!candleData||!candleData.length) return;
  candles.setData(candleData);
  if(volData&&volData.length) volSeries.setData(volData);
  candles.applyOptions({ priceFormat:{ type:'price', precision:priceDecimals||6, minMove: Math.pow(10,-(priceDecimals||6)) } });
  chart.timeScale().fitContent();
};

window.addEventListener('resize',()=>{ chart.resize(window.innerWidth, window.innerHeight); });
</script>
</body>
</html>
`;

// ─── SafeImage ────────────────────────────────────────────────────────────────
const SafeImage = ({ uri, size=32 }) => {
  const [err, setErr] = useState(false);
  if (err || !uri) return <View style={{ width:size,height:size,borderRadius:size/2,backgroundColor:'rgba(0,0,0,0.1)' }} />;
  return <Image source={{ uri }} style={{ width:size,height:size,borderRadius:size/2 }} onError={()=>setErr(true)} />;
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function TradingScreen() {
  const navigation   = useNavigation();
  const route        = useRoute();
  const { t }        = useTranslation();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';

  const C = {
    bg:      isDark ? '#07070F' : '#F5F6FA',
    card:    isDark ? '#0F0F1E' : '#FFFFFF',
    card2:   isDark ? '#161628' : '#F4F5FF',
    text:    isDark ? '#EEEEFF' : '#0D0D1A',
    muted:   isDark ? '#6060A0' : '#9090A8',
    border:  isDark ? '#1E1E38' : '#E4E4F0',
    success: '#10B981', error: '#EF4444',
  };

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedToken, setSelectedToken] = useState(route.params?.token || CORE_TOKENS.find(t=>t.symbol==='SOL'));
  const [timeframe,     setTimeframe]     = useState(TIMEFRAMES[0]);
  const [chartLoading,  setChartLoading]  = useState(true);
  const [marketLoading, setMarketLoading] = useState(true);
  const [tokens,        setTokens]        = useState([]);
  const [orderSide,     setOrderSide]     = useState('buy');
  const [orderAmount,   setOrderAmount]   = useState('');
  const [priceStats,    setPriceStats]    = useState({ current:0, change:0, high:0, low:0, volume:0, open:0 });

  const webviewRef  = useRef(null);
  const chartHtml   = buildChartHtml(isDark, primaryColor);
  const chartReady  = useRef(false);
  const pendingData = useRef(null);

  // ── جلب بيانات السوق ─────────────────────────────────────────────────────
  const fetchMarket = useCallback(async () => {
    try {
      setMarketLoading(true);
      const data = await getJupiterMarketData();
      setTokens(data.filter(t => CORE_TOKENS.find(c => c.mint === t.mint)));
      const tok = data.find(d => d.mint === selectedToken.mint);
      if (tok) {
        setPriceStats(prev => ({
          ...prev,
          current: tok.current_price || 0,
          change:  tok.price_change_percentage_24h || 0,
        }));
      }
    } catch (_) {}
    finally { setMarketLoading(false); }
  }, [selectedToken.mint]);

  // ── جلب بيانات الرسم البياني ──────────────────────────────────────────────
  const fetchChart = useCallback(async () => {
    try {
      setChartLoading(true);
      chartReady.current = false;
      const result = await getFullChartData(selectedToken.symbol, timeframe.days, selectedToken.mint);
      if (!result?.data?.length) { setChartLoading(false); return; }

      const price   = result.stats?.currentPrice || 0;
      const decimals = price > 1 ? 2 : price > 0.01 ? 4 : price > 0.0001 ? 6 : 8;

      setPriceStats(prev => ({
        ...prev,
        current: prev.current || price,
        open:    result.stats?.openPrice || 0,
        high:    result.stats?.high      || 0,
        low:     result.stats?.low       || 0,
        volume:  result.stats?.volume24h || 0,
        change:  prev.change || result.stats?.periodChange || 0,
      }));

      // تحويل البيانات لتنسيق TradingView (timestamp بالثواني)
      const candles = result.data.map(d => ({
        time:  Math.floor(d.timestamp / 1000),
        open:  d.open, high: d.high, low: d.low, close: d.close,
      })).sort((a,b) => a.time - b.time);

      const volumes = result.volumeData?.map(v => ({
        time:  Math.floor(v.timestamp / 1000),
        value: v.volume,
        color: '#3B82F620',
      })).sort((a,b) => a.time - b.time) || [];

      const js = `window.setChartData(${JSON.stringify(candles)},${JSON.stringify(volumes)},${decimals});true;`;

      if (chartReady.current) {
        webviewRef.current?.injectJavaScript(js);
      } else {
        pendingData.current = js;
      }
    } catch (_) {}
    finally { setChartLoading(false); }
  }, [selectedToken, timeframe]);

  useEffect(() => { fetchMarket(); }, [selectedToken]);
  useEffect(() => { fetchChart(); },  [selectedToken, timeframe]);

  // تحديث تلقائي كل دقيقة
  useEffect(() => {
    const iv = setInterval(() => { fetchMarket(); fetchChart(); }, 60000);
    return () => clearInterval(iv);
  }, [fetchMarket, fetchChart]);

  const onWebViewLoad = () => {
    chartReady.current = true;
    if (pendingData.current) {
      webviewRef.current?.injectJavaScript(pendingData.current);
      pendingData.current = null;
    }
  };

  // ── حساب تقدير الإجمالي ───────────────────────────────────────────────────
  const estimatedTotal = orderAmount && priceStats.current
    ? orderSide === 'buy'
      ? (parseFloat(orderAmount) / priceStats.current).toFixed(6)
      : (parseFloat(orderAmount) * priceStats.current).toFixed(2)
    : '0';

  const executeOrder = () => {
    if (!orderAmount || parseFloat(orderAmount) <= 0) return;
    navigation.navigate('Swap', {
      fromToken: orderSide === 'buy' ? 'USDC' : selectedToken.symbol,
      toToken:   orderSide === 'buy' ? selectedToken.symbol : 'USDC',
      amount:    orderAmount,
    });
  };

  const fmtPrice = (p) => {
    if (!p) return '$0.00';
    if (p > 1)      return `$${p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    if (p > 0.01)   return `$${p.toFixed(4)}`;
    if (p > 0.0001) return `$${p.toFixed(6)}`;
    return `$${p.toFixed(8)}`;
  };
  const fmtBig = (n) => {
    if (!n) return 'N/A';
    if (n>=1e9) return `$${(n/1e9).toFixed(2)}B`;
    if (n>=1e6) return `$${(n/1e6).toFixed(2)}M`;
    if (n>=1e3) return `$${(n/1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };

  const up = priceStats.change >= 0;

  return (
    <SafeAreaView style={[S.root, { backgroundColor:C.bg }]}>

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor:C.card, borderBottomColor:C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[S.iconBtn, { backgroundColor:C.card2 }]}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={S.headerCenter}>
          <SafeImage uri={selectedToken.image} size={28} />
          <View>
            <Text style={[S.headerSym, { color:C.text }]}>{selectedToken.symbol}/USDC</Text>
            <Text style={[S.headerName,  { color:C.muted }]}>{selectedToken.name}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[S.iconBtn, { backgroundColor:C.card2 }]}
          onPress={() => { fetchMarket(); fetchChart(); }}
        >
          <Ionicons name="refresh" size={20} color={primaryColor} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

        {/* ── Token Selector ── */}
        <FlatList
          data={tokens}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={i => i.mint}
          contentContainerStyle={S.tokenSelectorContent}
          renderItem={({ item }) => {
            const active = item.mint === selectedToken.mint;
            const tok    = CORE_TOKENS.find(c => c.mint === item.mint);
            return (
              <TouchableOpacity
                style={[S.tokenChip, active && { backgroundColor:primaryColor, borderColor:primaryColor }]}
                onPress={() => setSelectedToken(tok || item)}
              >
                <SafeImage uri={item.image} size={18} />
                <Text style={[S.tokenChipTxt, { color: active ? '#FFF' : C.text }]}>{item.symbol}</Text>
                <Text style={[S.tokenChipChg, { color: (item.price_change_percentage_24h||0)>=0 ? C.success : C.error }]}>
                  {(item.price_change_percentage_24h||0)>=0?'+':''}{(item.price_change_percentage_24h||0).toFixed(1)}%
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* ── Price Header ── */}
        <View style={[S.priceHeader, { backgroundColor:C.card }]}>
          <View>
            <Text style={[S.priceMain, { color:C.text }]}>
              {marketLoading ? '—' : fmtPrice(priceStats.current)}
            </Text>
            <View style={[S.changePill, { backgroundColor: up ? C.success+'20' : C.error+'20' }]}>
              <Ionicons name={up?'trending-up':'trending-down'} size={12} color={up?C.success:C.error} />
              <Text style={[S.changeTxt, { color: up?C.success:C.error }]}>
                {up?'+':''}{priceStats.change.toFixed(2)}%
              </Text>
            </View>
          </View>
          <View style={S.priceStats}>
            {[
              { label:'H',  value: fmtPrice(priceStats.high),   color: C.success },
              { label:'L',  value: fmtPrice(priceStats.low),    color: C.error   },
              { label:'Vol',value: fmtBig(priceStats.volume),   color: C.text    },
            ].map(s => (
              <View key={s.label} style={S.priceStat}>
                <Text style={[S.priceStatL, { color:C.muted }]}>{s.label}</Text>
                <Text style={[S.priceStatV, { color:s.color }]}>{s.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Chart ── */}
        <View style={[S.chartWrap, { height:CHART_H, backgroundColor:C.card }]}>
          {chartLoading && (
            <View style={[S.chartOverlay, { backgroundColor:C.card }]}>
              <ActivityIndicator size="large" color={primaryColor} />
              <Text style={[{ fontSize:13, marginTop:10, color:C.muted }]}>{t('loading')}</Text>
            </View>
          )}
          <WebView
            ref={webviewRef}
            source={{ html: chartHtml }}
            style={{ flex:1, backgroundColor:C.card }}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onLoad={onWebViewLoad}
            onError={() => setChartLoading(false)}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          />
        </View>

        {/* ── Timeframe ── */}
        <View style={[S.tfRow, { backgroundColor:C.card, borderTopColor:C.border }]}>
          {TIMEFRAMES.map(tf => (
            <TouchableOpacity
              key={tf.label}
              style={[S.tfBtn, timeframe.label===tf.label && { backgroundColor:primaryColor }]}
              onPress={() => setTimeframe(tf)}
            >
              <Text style={[S.tfTxt, { color: timeframe.label===tf.label ? '#FFF' : C.muted }]}>{tf.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Order Panel ── */}
        <View style={[S.orderPanel, { backgroundColor:C.card }]}>
          {/* Buy / Sell tabs */}
          <View style={[S.orderTabs, { backgroundColor:C.card2 }]}>
            <TouchableOpacity
              style={[S.orderTab, orderSide==='buy' && { backgroundColor:C.success }]}
              onPress={() => setOrderSide('buy')}
            >
              <Ionicons name="trending-up" size={16} color={orderSide==='buy'?'#FFF':C.muted} />
              <Text style={[S.orderTabTxt, { color:orderSide==='buy'?'#FFF':C.muted }]}>{t('buy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.orderTab, orderSide==='sell' && { backgroundColor:C.error }]}
              onPress={() => setOrderSide('sell')}
            >
              <Ionicons name="trending-down" size={16} color={orderSide==='sell'?'#FFF':C.muted} />
              <Text style={[S.orderTabTxt, { color:orderSide==='sell'?'#FFF':C.muted }]}>{t('sell')}</Text>
            </TouchableOpacity>
          </View>

          {/* السعر الحالي */}
          <View style={[S.currentPriceRow, { backgroundColor:C.card2, borderColor:C.border }]}>
            <Text style={[S.currentPriceL, { color:C.muted }]}>{t('current_price')}</Text>
            <Text style={[S.currentPriceV, { color: up?C.success:C.error }]}>
              {fmtPrice(priceStats.current)}
            </Text>
          </View>

          {/* حقل الكمية */}
          <Text style={[S.inputLabel, { color:C.muted }]}>
            {orderSide==='buy' ? t('amount_usdc','المبلغ بـ USDC') : `${t('amount','الكمية')} ${selectedToken.symbol}`}
          </Text>
          <View style={[S.inputWrap, { backgroundColor:C.card2, borderColor: orderSide==='buy'?C.success+'60':C.error+'60' }]}>
            <TextInput
              style={[S.input, { color:C.text }]}
              value={orderAmount}
              onChangeText={setOrderAmount}
              placeholder="0.00"
              placeholderTextColor={C.muted}
              keyboardType="decimal-pad"
            />
            <Text style={[S.inputCurrency, { color:C.muted }]}>
              {orderSide==='buy' ? 'USDC' : selectedToken.symbol}
            </Text>
          </View>

          {/* الإجمالي التقديري */}
          <View style={[S.estimateRow, { borderColor:C.border }]}>
            <Text style={[S.estimateL, { color:C.muted }]}>
              {orderSide==='buy' ? `${t('you_receive','ستحصل على')} ≈` : `${t('you_receive','ستحصل على USDC')} ≈`}
            </Text>
            <Text style={[S.estimateV, { color:C.text }]}>
              {estimatedTotal} {orderSide==='buy' ? selectedToken.symbol : 'USDC'}
            </Text>
          </View>

          {/* Quick amounts */}
          <View style={S.quickAmounts}>
            {['25','50','100','500'].map(amt => (
              <TouchableOpacity
                key={amt}
                style={[S.quickAmt, { backgroundColor:C.card2, borderColor:C.border }]}
                onPress={() => setOrderAmount(amt)}
              >
                <Text style={[S.quickAmtTxt, { color:C.text }]}>{amt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* زر التنفيذ */}
          <TouchableOpacity
            style={[
              S.executeBtn,
              { backgroundColor: orderSide==='buy' ? C.success : C.error },
              (!orderAmount || parseFloat(orderAmount)<=0) && { opacity:0.5 },
            ]}
            onPress={executeOrder}
            disabled={!orderAmount || parseFloat(orderAmount)<=0}
          >
            <Ionicons name={orderSide==='buy'?'trending-up':'trending-down'} size={20} color="#FFF" />
            <Text style={S.executeBtnTxt}>
              {orderSide==='buy' ? `${t('buy')} ${selectedToken.symbol}` : `${t('sell')} ${selectedToken.symbol}`}
            </Text>
          </TouchableOpacity>

          <Text style={[S.swapNote, { color:C.muted }]}>
            {t('powered_by_jupiter','يعمل بواسطة Jupiter Swap')}
          </Text>
        </View>

        {/* ── معلومات العملة ── */}
        <View style={[S.infoCard, { backgroundColor:C.card }]}>
          <Text style={[S.infoTitle, { color:C.text }]}>{t('market_stats')}</Text>
          <View style={S.infoGrid}>
            {[
              { label: t('ohlc_open'),           value: fmtPrice(priceStats.open)    },
              { label: t('ohlc_high'),            value: fmtPrice(priceStats.high)    },
              { label: t('ohlc_low'),             value: fmtPrice(priceStats.low)     },
              { label: t('volume_24h_label'),     value: fmtBig(priceStats.volume)    },
            ].map(item => (
              <View key={item.label} style={[S.infoItem, { backgroundColor:C.card2 }]}>
                <Text style={[S.infoItemL, { color:C.muted }]}>{item.label}</Text>
                <Text style={[S.infoItemV, { color:C.text }]}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height:40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:   { flex:1 },
  header: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  iconBtn:{ width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center' },
  headerCenter:{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10 },
  headerSym:   { fontSize:17, fontWeight:'800' },
  headerName:  { fontSize:11, marginTop:1 },

  tokenSelectorContent: { paddingHorizontal:16, paddingVertical:12, gap:8 },
  tokenChip:    { flexDirection:'row', alignItems:'center', paddingHorizontal:12, paddingVertical:8, borderRadius:20, borderWidth:1.5, borderColor:'rgba(128,128,128,0.2)', gap:6 },
  tokenChipTxt: { fontSize:13, fontWeight:'700' },
  tokenChipChg: { fontSize:11, fontWeight:'600' },

  priceHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:18, paddingVertical:14 },
  priceMain:   { fontSize:28, fontWeight:'900', letterSpacing:-0.5 },
  changePill:  { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:4, borderRadius:10, marginTop:6 },
  changeTxt:   { fontSize:13, fontWeight:'700' },
  priceStats:  { gap:6 },
  priceStat:   { flexDirection:'row', alignItems:'center', gap:6 },
  priceStatL:  { fontSize:11, width:24 },
  priceStatV:  { fontSize:12, fontWeight:'700' },

  chartWrap:    { position:'relative' },
  chartOverlay: { position:'absolute', top:0, left:0, right:0, bottom:0, justifyContent:'center', alignItems:'center', zIndex:10 },

  tfRow:  { flexDirection:'row', justifyContent:'space-around', paddingVertical:10, borderTopWidth:1 },
  tfBtn:  { paddingHorizontal:16, paddingVertical:8, borderRadius:12 },
  tfTxt:  { fontSize:13, fontWeight:'700' },

  orderPanel: { margin:16, borderRadius:24, padding:20, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.08, shadowRadius:12, elevation:4 },
  orderTabs:  { flexDirection:'row', borderRadius:16, padding:4, marginBottom:18 },
  orderTab:   { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:12, borderRadius:12, gap:7 },
  orderTabTxt:{ fontSize:15, fontWeight:'700' },

  currentPriceRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:12, borderRadius:14, borderWidth:1, marginBottom:16 },
  currentPriceL:   { fontSize:13, fontWeight:'500' },
  currentPriceV:   { fontSize:16, fontWeight:'800' },

  inputLabel: { fontSize:13, fontWeight:'600', marginBottom:8 },
  inputWrap:  { flexDirection:'row', alignItems:'center', borderRadius:14, borderWidth:1.5, paddingHorizontal:14, height:54, marginBottom:14 },
  input:      { flex:1, fontSize:20, fontWeight:'700' },
  inputCurrency:{ fontSize:14, fontWeight:'600' },

  estimateRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10, borderTopWidth:1, marginBottom:14 },
  estimateL:   { fontSize:13 },
  estimateV:   { fontSize:14, fontWeight:'700' },

  quickAmounts:{ flexDirection:'row', gap:8, marginBottom:18 },
  quickAmt:    { flex:1, paddingVertical:10, borderRadius:12, borderWidth:1, alignItems:'center' },
  quickAmtTxt: { fontSize:14, fontWeight:'700' },

  executeBtn:    { flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:18, borderRadius:18, gap:10, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.2, shadowRadius:8, elevation:6 },
  executeBtnTxt: { color:'#FFF', fontSize:17, fontWeight:'800' },
  swapNote:      { textAlign:'center', fontSize:11, marginTop:10 },

  infoCard:  { marginHorizontal:16, marginBottom:16, borderRadius:20, padding:18 },
  infoTitle: { fontSize:16, fontWeight:'700', marginBottom:14 },
  infoGrid:  { flexDirection:'row', flexWrap:'wrap', gap:10 },
  infoItem:  { width:(width-32-18*2-10)/2, padding:14, borderRadius:14 },
  infoItemL: { fontSize:11, marginBottom:5 },
  infoItemV: { fontSize:14, fontWeight:'700' },
});
