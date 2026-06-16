// screens/TradingScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, ActivityIndicator, TextInput, Platform,
  FlatList, Image, SafeAreaView, Alert, Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { getFullChartData } from '../services/priceChartService';
import { getJupiterMarketData, CORE_TOKENS } from '../services/jupiterMarketService';
import { getSolBalance, getTokenBalance } from '../services/heliusService';
import {
  executeMarketSwap,
  executeLimitOrder,
  cancelLimitOrder,
  getOpenLimitOrders,
} from '../services/tradingService';

const { width, height } = Dimensions.get('window');
const CHART_H = Math.round(height * 0.36);

const TIMEFRAMES = [
  { label:'1D', days:1   },
  { label:'7D', days:7   },
  { label:'30D',days:30  },
  { label:'3M', days:90  },
  { label:'1Y', days:365 },
];

const QUOTE_TOKENS = [
  { symbol:'USDC', mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals:6, image:'https://assets.coingecko.com/coins/images/6319/large/usdc.png'  },
  { symbol:'USDT', mint:'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals:6, image:'https://assets.coingecko.com/coins/images/325/large/Tether.png'   },
  { symbol:'SOL',  mint:'So11111111111111111111111111111111111111112',   decimals:9, image:'https://assets.coingecko.com/coins/images/4128/large/solana.png'  },
];

// ─── Chart HTML ───────────────────────────────────────────────────────────────
const buildChartHtml = (isDark, accent) => `
<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:${isDark?'#0F0F1E':'#FFFFFF'}}#chart{width:100%;height:100vh}
#tt{position:absolute;top:12px;left:12px;z-index:100;background:${isDark?'rgba(15,15,30,.92)':'rgba(255,255,255,.92)'};border:1px solid ${isDark?'#2A2A3E':'#E5E7EB'};border-radius:10px;padding:8px 12px;font-size:12px;color:${isDark?'#EEEEFF':'#0D0D1A'};display:none;font-family:-apple-system,sans-serif}
#tt span{display:block;margin:1px 0}.l{color:${isDark?'#6060A0':'#9090A8'};font-size:11px}.v{font-weight:700;font-size:13px}.u{color:#10B981}.d{color:#EF4444}</style>
</head><body><div id="chart"></div>
<div id="tt"><span class="l" id="tt_t"></span><span class="v" id="tt_o"></span><span class="v u" id="tt_h"></span><span class="v d" id="tt_l"></span><span class="v" id="tt_c"></span></div>
<script>
const chart=LightweightCharts.createChart(document.getElementById('chart'),{
  width:window.innerWidth,height:window.innerHeight,
  layout:{background:{type:'solid',color:'${isDark?'#0F0F1E':'#FFFFFF'}'},textColor:'${isDark?'#8080A0':'#9090A8'}',fontSize:11},
  grid:{vertLines:{color:'${isDark?'#1E1E38':'#F0F0F8'}'},horzLines:{color:'${isDark?'#1E1E38':'#F0F0F8'}'}},
  crosshair:{mode:LightweightCharts.CrosshairMode.Normal,
    vertLine:{color:'${accent}80',width:1,style:0,labelBackgroundColor:'${accent}'},
    horzLine:{color:'${accent}80',width:1,style:0,labelBackgroundColor:'${accent}'}},
  rightPriceScale:{borderColor:'${isDark?'#1E1E38':'#F0F0F8'}'},
  timeScale:{borderColor:'${isDark?'#1E1E38':'#F0F0F8'}',timeVisible:true,secondsVisible:false},
  handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true},
  handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},
});
const candles=chart.addCandlestickSeries({upColor:'#10B981',downColor:'#EF4444',borderUpColor:'#10B981',borderDownColor:'#EF4444',wickUpColor:'#10B981',wickDownColor:'#EF4444'});
const vol=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'vol',color:'#3B82F620'});
chart.priceScale('vol').applyOptions({scaleMargins:{top:0.85,bottom:0}});
chart.subscribeCrosshairMove(p=>{
  if(!p.time||!p.seriesData.size){document.getElementById('tt').style.display='none';return;}
  const d=p.seriesData.get(candles);if(!d)return;
  const dt=new Date(p.time*1000);
  document.getElementById('tt_t').textContent=dt.toLocaleDateString();
  document.getElementById('tt_o').textContent='O: '+d.open.toFixed(6);
  document.getElementById('tt_h').textContent='H: '+d.high.toFixed(6);
  document.getElementById('tt_l').textContent='L: '+d.low.toFixed(6);
  document.getElementById('tt_c').textContent='C: '+d.close.toFixed(6);
  document.getElementById('tt').style.display='block';
});
window.setChartData=function(cd,vd,dec){
  if(!cd||!cd.length)return;
  candles.setData(cd);if(vd&&vd.length)vol.setData(vd);
  candles.applyOptions({priceFormat:{type:'price',precision:dec||6,minMove:Math.pow(10,-(dec||6))}});
  chart.timeScale().fitContent();
};
window.addEventListener('resize',()=>chart.resize(window.innerWidth,window.innerHeight));
</script></body></html>`;

const SafeImage = ({ uri, size=32 }) => {
  const [err, setErr] = useState(false);
  if (err||!uri) return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:'rgba(0,0,0,0.1)'}}/>;
  return <Image source={{uri}} style={{width:size,height:size,borderRadius:size/2}} onError={()=>setErr(true)}/>;
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function TradingScreen() {
  const navigation         = useNavigation();
  const route              = useRoute();
  const { t }              = useTranslation();
  const theme              = useAppStore(s => s.theme);
  const primaryColor       = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark             = theme === 'dark';
  const activeAccountIndex = useAppStore(s => s.activeAccountIndex);
  const walletPublicKey    = useAppStore(s => s.walletPublicKey);

  const C = {
    bg:      isDark?'#07070F':'#F5F6FA',
    card:    isDark?'#0F0F1E':'#FFFFFF',
    card2:   isDark?'#161628':'#F4F5FF',
    text:    isDark?'#EEEEFF':'#0D0D1A',
    muted:   isDark?'#6060A0':'#9090A8',
    border:  isDark?'#1E1E38':'#E4E4F0',
    success: '#10B981', error:'#EF4444', warning:'#F59E0B',
  };

  const [selectedToken, setSelectedToken] = useState(route.params?.token || CORE_TOKENS.find(t=>t.symbol==='SOL'));
  const [quoteToken,    setQuoteToken]    = useState(QUOTE_TOKENS[0]);
  const [quoteModal,    setQuoteModal]    = useState(false);
  const [timeframe,     setTimeframe]     = useState(TIMEFRAMES[0]);
  const [orderType,     setOrderType]     = useState('market');
  const [orderSide,     setOrderSide]     = useState('buy');
  const [orderAmount,   setOrderAmount]   = useState('');
  const [limitPrice,    setLimitPrice]    = useState('');
  const [chartLoading,  setChartLoading]  = useState(true);
  const [marketLoading, setMarketLoading] = useState(true);
  const [executing,     setExecuting]     = useState(false);
  const [tokens,        setTokens]        = useState([]);
  const [userBalance,   setUserBalance]   = useState({ base:0, quote:0 });
  const [openOrders,    setOpenOrders]    = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [priceStats,    setPriceStats]    = useState({ current:0, change:0, high:0, low:0, volume:0, open:0 });

  const webviewRef  = useRef(null);
  const chartHtml   = buildChartHtml(isDark, primaryColor);
  const chartReady  = useRef(false);
  const pendingData = useRef(null);

  // ── جلب الرصيد ──────────────────────────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    if (!walletPublicKey) return;
    try {
      const base = selectedToken.symbol==='SOL'
        ? await getSolBalance(true, walletPublicKey).catch(()=>0)
        : await getTokenBalance(selectedToken.mint, true, walletPublicKey).catch(()=>0);
      const quote = quoteToken.symbol==='SOL'
        ? await getSolBalance(true, walletPublicKey).catch(()=>0)
        : await getTokenBalance(quoteToken.mint, true, walletPublicKey).catch(()=>0);
      setUserBalance({ base, quote });
    } catch (_) {}
  }, [walletPublicKey, selectedToken, quoteToken]);

  // ── جلب أوامر Limit المفتوحة ────────────────────────────────────────────
  const fetchOpenOrders = useCallback(async () => {
    if (!walletPublicKey) return;
    try {
      setOrdersLoading(true);
      const orders = await getOpenLimitOrders(walletPublicKey);
      setOpenOrders(orders || []);
    } catch (_) { setOpenOrders([]); }
    finally { setOrdersLoading(false); }
  }, [walletPublicKey]);

  // ── جلب بيانات السوق ─────────────────────────────────────────────────────
  const fetchMarket = useCallback(async () => {
    try {
      setMarketLoading(true);
      const data = await getJupiterMarketData();
      setTokens(data.filter(t => CORE_TOKENS.find(c=>c.mint===t.mint)));
      const tok = data.find(d=>d.mint===selectedToken.mint);
      if (tok) {
        setPriceStats(prev=>({ ...prev, current:tok.current_price||0, change:tok.price_change_percentage_24h||0 }));
        if (!limitPrice) setLimitPrice((tok.current_price||0).toFixed(6));
      }
    } catch (_) {}
    finally { setMarketLoading(false); }
  }, [selectedToken.mint]);

  // ── جلب الرسم البياني ────────────────────────────────────────────────────
  const fetchChart = useCallback(async () => {
    try {
      setChartLoading(true); chartReady.current = false;
      const result = await getFullChartData(selectedToken.symbol, timeframe.days, selectedToken.mint);
      if (!result?.data?.length) { setChartLoading(false); return; }
      const price    = result.stats?.currentPrice || 0;
      const decimals = price>1?2:price>0.01?4:price>0.0001?6:8;
      setPriceStats(prev=>({
        ...prev,
        current: prev.current||price,
        open:    result.stats?.openPrice||0,
        high:    result.stats?.high||0,
        low:     result.stats?.low||0,
        volume:  result.stats?.volume24h||0,
        change:  prev.change||result.stats?.periodChange||0,
      }));
      const candleData = result.data.map(d=>({
        time:Math.floor(d.timestamp/1000), open:d.open, high:d.high, low:d.low, close:d.close,
      })).sort((a,b)=>a.time-b.time);
      const volData = result.volumeData?.map(v=>({
        time:Math.floor(v.timestamp/1000), value:v.volume, color:'#3B82F620',
      })).sort((a,b)=>a.time-b.time)||[];
      const js = `window.setChartData(${JSON.stringify(candleData)},${JSON.stringify(volData)},${decimals});true;`;
      if (chartReady.current) webviewRef.current?.injectJavaScript(js);
      else pendingData.current = js;
    } catch (_) {}
    finally { setChartLoading(false); }
  }, [selectedToken, timeframe]);

  useEffect(() => { fetchMarket(); fetchBalances(); fetchOpenOrders(); }, [selectedToken, quoteToken]);
  useEffect(() => { fetchChart(); }, [selectedToken, timeframe]);
  useEffect(() => {
    const iv = setInterval(() => { fetchMarket(); fetchBalances(); }, 60000);
    return () => clearInterval(iv);
  }, [fetchMarket, fetchBalances]);

  const onWebViewLoad = () => {
    chartReady.current = true;
    if (pendingData.current) {
      webviewRef.current?.injectJavaScript(pendingData.current);
      pendingData.current = null;
    }
  };

  // ── تنفيذ الأمر عبر tradingService ───────────────────────────────────────
  const handleExecute = async () => {
    if (!orderAmount || parseFloat(orderAmount)<=0) return;
    if (!walletPublicKey) { Alert.alert(t('error'), t('no_wallet')); return; }

    const amt        = parseFloat(orderAmount);
    const availBal   = orderSide==='buy' ? userBalance.quote : userBalance.base;
    if (amt > availBal) { Alert.alert(t('error'), t('insufficient_balance')); return; }

    const inputToken  = orderSide==='buy' ? quoteToken    : selectedToken;
    const outputToken = orderSide==='buy' ? selectedToken : quoteToken;
    const rawIn       = Math.round(amt * Math.pow(10, inputToken.decimals));

    let rawOut = 0;
    if (orderType==='limit') {
      if (!limitPrice || parseFloat(limitPrice)<=0) {
        Alert.alert(t('error'), t('enter_limit_price')); return;
      }
      const lp = parseFloat(limitPrice);
      rawOut = orderSide==='buy'
        ? Math.round((amt / lp) * Math.pow(10, outputToken.decimals))
        : Math.round((amt * lp) * Math.pow(10, outputToken.decimals));
    }

    const typeLabel = orderType==='market' ? t('market_order') : t('limit_order');
    const priceInfo = orderType==='limit' ? `\n${t('at_price')}: ${limitPrice} ${quoteToken.symbol}` : '';

    Alert.alert(
      `${typeLabel} — ${orderSide==='buy'?t('buy'):t('sell')}`,
      `${amt} ${inputToken.symbol} → ${outputToken.symbol}${priceInfo}`,
      [
        { text:t('cancel'), style:'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            try {
              setExecuting(true);
              let sig;

              if (orderType==='market') {
                // ✅ تنفيذ أمر السوق عبر tradingService
                sig = await executeMarketSwap({
                  inputMint:      inputToken.mint,
                  outputMint:     outputToken.mint,
                  amount:         rawIn,
                  walletPublicKey,
                  activeIndex:    activeAccountIndex,
                });
              } else {
                // ✅ تنفيذ أمر محدد السعر عبر tradingService
                sig = await executeLimitOrder({
                  inputMint:      inputToken.mint,
                  outputMint:     outputToken.mint,
                  inAmount:       rawIn,
                  outAmount:      rawOut,
                  walletPublicKey,
                  activeIndex:    activeAccountIndex,
                });
                await fetchOpenOrders();
              }

              setOrderAmount('');
              await fetchBalances();
              Alert.alert(
                t('success'),
                `✅ ${orderType==='limit' ? t('limit_order_placed') : t('trade_success')}\n${sig.slice(0,8)}...${sig.slice(-4)}`
              );
            } catch (e) {
              Alert.alert(t('error'), `${t('trade_failed')}: ${e.message}`);
            } finally {
              setExecuting(false);
            }
          },
        },
      ]
    );
  };

  // ── إلغاء أمر Limit ──────────────────────────────────────────────────────
  const handleCancelOrder = (order) => {
    Alert.alert(t('cancel_order'), t('cancel_order_confirm'), [
      { text:t('no'), style:'cancel' },
      {
        text:t('yes_cancel'), style:'destructive',
        onPress: async () => {
          try {
            await cancelLimitOrder({ orderPubkey:order.publicKey, walletPublicKey, activeIndex:activeAccountIndex });
            await fetchOpenOrders();
            Alert.alert(t('success'), t('order_cancelled'));
          } catch (e) { Alert.alert(t('error'), e.message); }
        },
      },
    ]);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmtPrice = (p) => {
    if (!p) return '$0.00';
    if (p>1)      return `$${p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    if (p>0.01)   return `$${p.toFixed(4)}`;
    if (p>0.0001) return `$${p.toFixed(6)}`;
    return `$${p.toFixed(8)}`;
  };
  const fmtBig = (n) => {
    if (!n) return 'N/A';
    if (n>=1e9) return `$${(n/1e9).toFixed(2)}B`;
    if (n>=1e6) return `$${(n/1e6).toFixed(2)}M`;
    if (n>=1e3) return `$${(n/1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };
  const fmtBal = (b) => b>0 ? b.toLocaleString(undefined,{maximumFractionDigits:4}) : '0';

  const up       = priceStats.change >= 0;
  const availBal = orderSide==='buy' ? userBalance.quote : userBalance.base;
  const availCur = orderSide==='buy' ? quoteToken.symbol : selectedToken.symbol;

  const estimatedTotal = () => {
    if (!orderAmount || !priceStats.current) return '0';
    const amt = parseFloat(orderAmount);
    const lp  = orderType==='limit' && limitPrice ? parseFloat(limitPrice) : priceStats.current;
    if (!lp) return '0';
    return orderSide==='buy'
      ? (amt/lp).toFixed(6)
      : (amt*lp).toFixed(4);
  };

  return (
    <SafeAreaView style={[S.root,{backgroundColor:C.bg}]}>

      {/* ── Header ── */}
      <View style={[S.header,{backgroundColor:C.card,borderBottomColor:C.border}]}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={[S.iconBtn,{backgroundColor:C.card2}]}>
          <Ionicons name="arrow-back" size={22} color={C.text}/>
        </TouchableOpacity>
        <View style={S.headerCenter}>
          <SafeImage uri={selectedToken.image} size={26}/>
          <Text style={[S.headerSym,{color:C.text}]}>{selectedToken.symbol}/{quoteToken.symbol}</Text>
        </View>
        <TouchableOpacity style={[S.iconBtn,{backgroundColor:C.card2}]}
          onPress={()=>{ fetchMarket(); fetchChart(); fetchBalances(); fetchOpenOrders(); }}>
          <Ionicons name="refresh" size={20} color={primaryColor}/>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

        {/* ── Token Selector ── */}
        <FlatList
          data={tokens} horizontal showsHorizontalScrollIndicator={false}
          keyExtractor={i=>i.mint} contentContainerStyle={S.tokenRow}
          renderItem={({item})=>{
            const active = item.mint===selectedToken.mint;
            const tok    = CORE_TOKENS.find(c=>c.mint===item.mint);
            return (
              <TouchableOpacity
                style={[S.tokenChip, active&&{backgroundColor:primaryColor,borderColor:primaryColor}]}
                onPress={()=>{ setSelectedToken(tok||item); setOrderAmount(''); setLimitPrice(''); }}
              >
                <SafeImage uri={item.image} size={16}/>
                <Text style={[S.chipSym,{color:active?'#FFF':C.text}]}>{item.symbol}</Text>
                <Text style={[S.chipChg,{color:(item.price_change_percentage_24h||0)>=0?C.success:C.error}]}>
                  {(item.price_change_percentage_24h||0)>=0?'+':''}{(item.price_change_percentage_24h||0).toFixed(1)}%
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* ── Price Header ── */}
        <View style={[S.priceHeader,{backgroundColor:C.card}]}>
          <View>
            <Text style={[S.priceMain,{color:C.text}]}>{marketLoading?'—':fmtPrice(priceStats.current)}</Text>
            <View style={[S.changePill,{backgroundColor:up?C.success+'20':C.error+'20'}]}>
              <Ionicons name={up?'trending-up':'trending-down'} size={12} color={up?C.success:C.error}/>
              <Text style={[S.changeTxt,{color:up?C.success:C.error}]}>
                {up?'+':''}{priceStats.change.toFixed(2)}%
              </Text>
            </View>
          </View>
          <View style={S.priceStats}>
            {[
              {l:'H',v:fmtPrice(priceStats.high), c:C.success},
              {l:'L',v:fmtPrice(priceStats.low),  c:C.error  },
              {l:'V',v:fmtBig(priceStats.volume),  c:C.text   },
            ].map(s=>(
              <View key={s.l} style={S.priceStat}>
                <Text style={[S.psL,{color:C.muted}]}>{s.l}</Text>
                <Text style={[S.psV,{color:s.c}]}>{s.v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Chart ── */}
        <View style={[S.chartWrap,{height:CHART_H,backgroundColor:C.card}]}>
          {chartLoading && (
            <View style={[S.chartOverlay,{backgroundColor:C.card}]}>
              <ActivityIndicator size="large" color={primaryColor}/>
            </View>
          )}
          <WebView
            ref={webviewRef} source={{html:chartHtml}}
            style={{flex:1,backgroundColor:C.card}}
            scrollEnabled={false} bounces={false}
            javaScriptEnabled domStorageEnabled
            onLoad={onWebViewLoad}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          />
        </View>

        {/* ── Timeframe ── */}
        <View style={[S.tfRow,{backgroundColor:C.card,borderTopColor:C.border}]}>
          {TIMEFRAMES.map(tf=>(
            <TouchableOpacity
              key={tf.label}
              style={[S.tfBtn, timeframe.label===tf.label&&{backgroundColor:primaryColor}]}
              onPress={()=>setTimeframe(tf)}
            >
              <Text style={[S.tfTxt,{color:timeframe.label===tf.label?'#FFF':C.muted}]}>{tf.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Order Panel ── */}
        <View style={[S.orderPanel,{backgroundColor:C.card}]}>

          {/* Market / Limit */}
          <View style={[S.typeTabs,{backgroundColor:C.card2}]}>
            {[
              {key:'market', label:t('market_order'), icon:'flash'        },
              {key:'limit',  label:t('limit_order'),  icon:'timer-outline'},
            ].map(item=>(
              <TouchableOpacity
                key={item.key}
                style={[S.typeTab, orderType===item.key&&{backgroundColor:primaryColor}]}
                onPress={()=>{
                  setOrderType(item.key);
                  if (item.key==='limit'&&priceStats.current) setLimitPrice(priceStats.current.toFixed(6));
                }}
              >
                <Ionicons name={item.icon} size={14} color={orderType===item.key?'#FFF':C.muted}/>
                <Text style={[S.typeTabTxt,{color:orderType===item.key?'#FFF':C.muted}]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Buy / Sell */}
          <View style={[S.orderTabs,{backgroundColor:C.card2}]}>
            {[
              {side:'buy', icon:'trending-up',   color:C.success, label:t('buy') },
              {side:'sell',icon:'trending-down',  color:C.error,   label:t('sell')},
            ].map(item=>(
              <TouchableOpacity
                key={item.side}
                style={[S.orderTab, orderSide===item.side&&{backgroundColor:item.color}]}
                onPress={()=>{ setOrderSide(item.side); setOrderAmount(''); }}
              >
                <Ionicons name={item.icon} size={16} color={orderSide===item.side?'#FFF':C.muted}/>
                <Text style={[S.orderTabTxt,{color:orderSide===item.side?'#FFF':C.muted}]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* عملة الاقتباس */}
          <View style={[S.quoteRow,{borderColor:C.border}]}>
            <Text style={[S.quoteLabel,{color:C.muted}]}>{t('quote_currency')}</Text>
            <TouchableOpacity style={[S.quotePicker,{backgroundColor:C.card2}]} onPress={()=>setQuoteModal(true)}>
              <SafeImage uri={quoteToken.image} size={20}/>
              <Text style={[S.quotePickerTxt,{color:C.text}]}>{quoteToken.symbol}</Text>
              <Ionicons name="chevron-down" size={14} color={C.muted}/>
            </TouchableOpacity>
          </View>

          {/* حقل السعر المحدد */}
          {orderType==='limit' && (
            <View style={S.limitPriceWrap}>
              <Text style={[S.inputLabel,{color:C.muted}]}>
                {t('limit_price')} ({quoteToken.symbol})
              </Text>
              <View style={[S.inputWrap,{backgroundColor:C.card2,borderColor:C.warning+'80'}]}>
                <Ionicons name="pricetag-outline" size={18} color={C.warning} style={{marginRight:8}}/>
                <TextInput
                  style={[S.input,{color:C.text}]}
                  value={limitPrice} onChangeText={setLimitPrice}
                  placeholder="0.000000" placeholderTextColor={C.muted}
                  keyboardType="decimal-pad"
                />
                <Text style={[S.inputCur,{color:C.muted}]}>{quoteToken.symbol}</Text>
              </View>
              {limitPrice && priceStats.current>0 && (
                <View style={[S.limitHint,{backgroundColor:parseFloat(limitPrice)<priceStats.current?C.success+'15':C.error+'15'}]}>
                  <Ionicons
                    name={parseFloat(limitPrice)<priceStats.current?'arrow-down':'arrow-up'}
                    size={12} color={parseFloat(limitPrice)<priceStats.current?C.success:C.error}
                  />
                  <Text style={[S.limitHintTxt,{color:parseFloat(limitPrice)<priceStats.current?C.success:C.error}]}>
                    {parseFloat(limitPrice)<priceStats.current ? t('below_market') : t('above_market')}
                    {` (${Math.abs(((parseFloat(limitPrice)-priceStats.current)/priceStats.current)*100).toFixed(2)}%)`}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* السعر الحالي — Market فقط */}
          {orderType==='market' && (
            <View style={[S.currentPriceRow,{backgroundColor:C.card2,borderColor:C.border}]}>
              <Text style={[S.cpL,{color:C.muted}]}>{t('current_price')}</Text>
              <Text style={[S.cpV,{color:up?C.success:C.error}]}>{fmtPrice(priceStats.current)}</Text>
            </View>
          )}

          {/* حقل الكمية */}
          <Text style={[S.inputLabel,{color:C.muted}]}>
            {orderSide==='buy'
              ? `${t('amount_in')} ${quoteToken.symbol}`
              : `${t('amount')} (${selectedToken.symbol})`}
          </Text>
          <View style={[S.inputWrap,{backgroundColor:C.card2,borderColor:orderSide==='buy'?C.success+'70':C.error+'70'}]}>
            <TextInput
              style={[S.input,{color:C.text}]}
              value={orderAmount} onChangeText={setOrderAmount}
              placeholder="0.00" placeholderTextColor={C.muted}
              keyboardType="decimal-pad"
            />
            <Text style={[S.inputCur,{color:C.muted}]}>
              {orderSide==='buy' ? quoteToken.symbol : selectedToken.symbol}
            </Text>
          </View>

          {/* الرصيد */}
          <TouchableOpacity
            style={[S.balanceRow,{borderColor:C.border}]}
            onPress={()=>setOrderAmount(availBal.toFixed(4))}
          >
            <Ionicons name="wallet-outline" size={14} color={C.muted}/>
            <Text style={[S.balanceLabel,{color:C.muted}]}>{t('available_balance')}</Text>
            <Text style={[S.balanceValue,{color:primaryColor}]}>{fmtBal(availBal)} {availCur}</Text>
            <Text style={[S.balanceMax,{color:primaryColor}]}>{t('max')}</Text>
          </TouchableOpacity>

          {/* الإجمالي التقديري */}
          <View style={[S.estimateRow,{borderColor:C.border}]}>
            <Text style={[S.estimateL,{color:C.muted}]}>{t('you_receive')} ≈</Text>
            <Text style={[S.estimateV,{color:C.text}]}>
              {estimatedTotal()} {orderSide==='buy' ? selectedToken.symbol : quoteToken.symbol}
            </Text>
          </View>

          {/* Quick % */}
          <View style={S.quickRow}>
            {['25%','50%','75%','MAX'].map(pct=>(
              <TouchableOpacity
                key={pct}
                style={[S.quickBtn,{backgroundColor:C.card2,borderColor:C.border}]}
                onPress={()=>{
                  const m = pct==='MAX'?1:pct==='75%'?.75:pct==='50%'?.5:.25;
                  setOrderAmount((availBal*m).toFixed(4));
                }}
              >
                <Text style={[S.quickBtnTxt,{color:C.text}]}>{pct}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* زر التنفيذ */}
          <TouchableOpacity
            style={[
              S.executeBtn,
              {backgroundColor: orderSide==='buy' ? C.success : C.error},
              (executing||!orderAmount||parseFloat(orderAmount)<=0) && {opacity:.6},
            ]}
            onPress={handleExecute}
            disabled={executing||!orderAmount||parseFloat(orderAmount)<=0}
          >
            {executing
              ? <ActivityIndicator color="#FFF" size="small"/>
              : <>
                  <Ionicons
                    name={orderType==='limit'?'timer-outline':orderSide==='buy'?'trending-up':'trending-down'}
                    size={20} color="#FFF"
                  />
                  <Text style={S.executeBtnTxt}>
                    {orderType==='limit'
                      ? t('place_limit_order')
                      : `${orderSide==='buy'?t('buy'):t('sell')} ${selectedToken.symbol}`
                    }
                  </Text>
                </>
            }
          </TouchableOpacity>

          <Text style={[S.swapNote,{color:C.muted}]}>{t('powered_by_jupiter')}</Text>
        </View>

        {/* ── الأوامر المفتوحة ── */}
        {openOrders.length > 0 && (
          <View style={[S.ordersCard,{backgroundColor:C.card}]}>
            <View style={S.ordersHeader}>
              <Text style={[S.ordersTitle,{color:C.text}]}>{t('open_orders')}</Text>
              <View style={[S.ordersBadge,{backgroundColor:C.warning+'25'}]}>
                <Text style={[S.ordersBadgeTxt,{color:C.warning}]}>{openOrders.length}</Text>
              </View>
            </View>
            {ordersLoading
              ? <ActivityIndicator color={primaryColor} style={{marginVertical:16}}/>
              : openOrders.map((order,i)=>(
                  <View key={i} style={[S.orderItem,{borderColor:C.border}]}>
                    <View style={[S.orderIcon,{backgroundColor:C.warning+'20'}]}>
                      <Ionicons name="timer-outline" size={14} color={C.warning}/>
                    </View>
                    <View style={S.orderInfo}>
                      <Text style={[S.orderPair,{color:C.text}]}>
                        {order.inputMint?.slice(0,4)}... → {order.outputMint?.slice(0,4)}...
                      </Text>
                      <Text style={[S.orderDetails,{color:C.muted}]}>
                        {order.inAmount} → {order.outAmount}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[S.cancelOrderBtn,{backgroundColor:C.error+'20',borderColor:C.error+'40'}]}
                      onPress={()=>handleCancelOrder(order)}
                    >
                      <Ionicons name="close" size={14} color={C.error}/>
                      <Text style={[S.cancelOrderTxt,{color:C.error}]}>{t('cancel')}</Text>
                    </TouchableOpacity>
                  </View>
                ))
            }
          </View>
        )}

        {/* ── إحصائيات السوق ── */}
        <View style={[S.statsCard,{backgroundColor:C.card}]}>
          <Text style={[S.statsTitle,{color:C.text}]}>{t('market_stats')}</Text>
          <View style={S.statsGrid}>
            {[
              {label:t('ohlc_open'),        value:fmtPrice(priceStats.open)  },
              {label:t('ohlc_high'),        value:fmtPrice(priceStats.high)  },
              {label:t('ohlc_low'),         value:fmtPrice(priceStats.low)   },
              {label:t('volume_24h_label'), value:fmtBig(priceStats.volume)  },
            ].map(item=>(
              <View key={item.label} style={[S.statItem,{backgroundColor:C.card2}]}>
                <Text style={[S.statL,{color:C.muted}]}>{item.label}</Text>
                <Text style={[S.statV,{color:C.text}]}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{height:40}}/>
      </ScrollView>

      {/* Modal عملة الاقتباس */}
      <Modal visible={quoteModal} transparent animationType="slide" onRequestClose={()=>setQuoteModal(false)}>
        <TouchableOpacity style={S.modalOverlay} activeOpacity={1} onPress={()=>setQuoteModal(false)}>
          <View style={[S.modalBox,{backgroundColor:C.card}]}>
            <View style={[S.modalHandle,{backgroundColor:C.border}]}/>
            <Text style={[S.modalTitle,{color:C.text}]}>{t('select_quote_currency')}</Text>
            {QUOTE_TOKENS.map(qt=>(
              <TouchableOpacity
                key={qt.symbol}
                style={[S.quoteOption,{borderColor:C.border},qt.symbol===quoteToken.symbol&&{borderColor:primaryColor,backgroundColor:primaryColor+'12'}]}
                onPress={()=>{ setQuoteToken(qt); setQuoteModal(false); setOrderAmount(''); setLimitPrice(''); }}
              >
                <SafeImage uri={qt.image} size={36}/>
                <Text style={[S.quoteOptionTxt,{color:C.text}]}>{qt.symbol}</Text>
                {qt.symbol===quoteToken.symbol&&<Ionicons name="checkmark-circle" size={22} color={primaryColor}/>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root:{flex:1},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingVertical:12,borderBottomWidth:1},
  iconBtn:{width:40,height:40,borderRadius:12,justifyContent:'center',alignItems:'center'},
  headerCenter:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  headerSym:{fontSize:17,fontWeight:'800'},
  tokenRow:{paddingHorizontal:16,paddingVertical:10,gap:8},
  tokenChip:{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:7,borderRadius:20,borderWidth:1.5,borderColor:'rgba(128,128,128,0.2)',gap:5},
  chipSym:{fontSize:13,fontWeight:'700'},chipChg:{fontSize:11,fontWeight:'600'},
  priceHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,paddingVertical:14},
  priceMain:{fontSize:28,fontWeight:'900',letterSpacing:-0.5},
  changePill:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,paddingVertical:4,borderRadius:10,marginTop:6},
  changeTxt:{fontSize:13,fontWeight:'700'},
  priceStats:{gap:6},priceStat:{flexDirection:'row',alignItems:'center',gap:6},
  psL:{fontSize:11,width:16},psV:{fontSize:12,fontWeight:'700'},
  chartWrap:{position:'relative'},
  chartOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,justifyContent:'center',alignItems:'center',zIndex:10},
  tfRow:{flexDirection:'row',justifyContent:'space-around',paddingVertical:10,borderTopWidth:1},
  tfBtn:{paddingHorizontal:16,paddingVertical:8,borderRadius:12},
  tfTxt:{fontSize:13,fontWeight:'700'},
  orderPanel:{margin:16,borderRadius:24,padding:20,shadowColor:'#000',shadowOffset:{width:0,height:4},shadowOpacity:0.08,shadowRadius:12,elevation:4},
  typeTabs:{flexDirection:'row',borderRadius:14,padding:4,marginBottom:14},
  typeTab:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',paddingVertical:10,borderRadius:10,gap:6},
  typeTabTxt:{fontSize:14,fontWeight:'700'},
  orderTabs:{flexDirection:'row',borderRadius:16,padding:4,marginBottom:16},
  orderTab:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',paddingVertical:12,borderRadius:12,gap:7},
  orderTabTxt:{fontSize:15,fontWeight:'700'},
  quoteRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:10,borderBottomWidth:1,marginBottom:14},
  quoteLabel:{fontSize:13},
  quotePicker:{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:8,borderRadius:12,gap:6},
  quotePickerTxt:{fontSize:14,fontWeight:'700'},
  limitPriceWrap:{marginBottom:14},
  limitHint:{flexDirection:'row',alignItems:'center',gap:5,padding:8,borderRadius:10,marginTop:6},
  limitHintTxt:{fontSize:12,fontWeight:'600'},
  currentPriceRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:12,borderRadius:14,borderWidth:1,marginBottom:14},
  cpL:{fontSize:13,fontWeight:'500'},cpV:{fontSize:16,fontWeight:'800'},
  inputLabel:{fontSize:13,fontWeight:'600',marginBottom:8},
  inputWrap:{flexDirection:'row',alignItems:'center',borderRadius:14,borderWidth:1.5,paddingHorizontal:14,height:54,marginBottom:8},
  input:{flex:1,fontSize:18,fontWeight:'700'},
  inputCur:{fontSize:14,fontWeight:'600'},
  balanceRow:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,marginBottom:12,gap:6},
  balanceLabel:{flex:1,fontSize:12},
  balanceValue:{fontSize:13,fontWeight:'700'},
  balanceMax:{fontSize:12,fontWeight:'800',paddingHorizontal:8,paddingVertical:3,borderRadius:6},
  estimateRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:10,borderTopWidth:1,marginBottom:14},
  estimateL:{fontSize:13},estimateV:{fontSize:14,fontWeight:'700'},
  quickRow:{flexDirection:'row',gap:8,marginBottom:18},
  quickBtn:{flex:1,paddingVertical:10,borderRadius:12,borderWidth:1,alignItems:'center'},
  quickBtnTxt:{fontSize:13,fontWeight:'700'},
  executeBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',paddingVertical:18,borderRadius:18,gap:10,shadowColor:'#000',shadowOffset:{width:0,height:4},shadowOpacity:0.2,shadowRadius:8,elevation:6},
  executeBtnTxt:{color:'#FFF',fontSize:17,fontWeight:'800'},
  swapNote:{textAlign:'center',fontSize:11,marginTop:10},
  ordersCard:{marginHorizontal:16,marginBottom:16,borderRadius:20,padding:18},
  ordersHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:14},
  ordersTitle:{fontSize:16,fontWeight:'700'},
  ordersBadge:{paddingHorizontal:8,paddingVertical:3,borderRadius:10},
  ordersBadgeTxt:{fontSize:12,fontWeight:'800'},
  orderItem:{flexDirection:'row',alignItems:'center',paddingVertical:12,borderBottomWidth:1,gap:12},
  orderIcon:{width:34,height:34,borderRadius:10,justifyContent:'center',alignItems:'center'},
  orderInfo:{flex:1},
  orderPair:{fontSize:14,fontWeight:'700'},
  orderDetails:{fontSize:11,marginTop:2},
  cancelOrderBtn:{flexDirection:'row',alignItems:'center',paddingHorizontal:10,paddingVertical:6,borderRadius:10,borderWidth:1,gap:4},
  cancelOrderTxt:{fontSize:12,fontWeight:'700'},
  statsCard:{marginHorizontal:16,marginBottom:16,borderRadius:20,padding:18},
  statsTitle:{fontSize:16,fontWeight:'700',marginBottom:14},
  statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  statItem:{width:(width-32-36-10)/2,padding:14,borderRadius:14},
  statL:{fontSize:11,marginBottom:5},statV:{fontSize:14,fontWeight:'700'},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'},
  modalBox:{borderTopLeftRadius:28,borderTopRightRadius:28,padding:24,paddingTop:12},
  modalHandle:{width:40,height:4,borderRadius:2,alignSelf:'center',marginBottom:18},
  modalTitle:{fontSize:18,fontWeight:'800',marginBottom:16},
  quoteOption:{flexDirection:'row',alignItems:'center',padding:16,borderRadius:16,borderWidth:1.5,marginBottom:10,gap:14},
  quoteOptionTxt:{flex:1,fontSize:16,fontWeight:'700'},
});
