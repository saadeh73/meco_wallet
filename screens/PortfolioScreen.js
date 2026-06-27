// screens/PortfolioScreen.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, RefreshControl,
  Dimensions, Image, Platform, Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { getSolBalance, getTokenAccounts } from '../services/heliusService';
import { getJupiterMarketData, CORE_TOKENS, getCustomTokens } from '../services/jupiterMarketService';

const { width } = Dimensions.get('window');
const PIE_SIZE  = 180;
const PIE_R     = 76;
const PIE_CX    = PIE_SIZE / 2;
const PIE_CY    = PIE_SIZE / 2;

// ── ألوان الأصول ─────────────────────────────────────────────────────────────
const ASSET_COLORS = [
  '#6C63FF','#10B981','#F59E0B','#EF4444','#3B82F6',
  '#8B5CF6','#EC4899','#14B8A6','#F97316','#84CC16',
  '#06B6D4','#A855F7','#64748B','#0EA5E9','#22C55E',
];

// ── Pie Chart المطور بالفواصل المتناسقة مع الثيم ──────────────────────────────
function PieChart({ slices, total, isDark }) {
  const bgStroke = isDark ? '#07070F' : '#F4F5F9';

  if (!slices?.length || total === 0) return (
    <View style={[S.pieWrap, { width:PIE_SIZE, height:PIE_SIZE }]}>
      <Svg width={PIE_SIZE} height={PIE_SIZE}>
        <Circle cx={PIE_CX} cy={PIE_CY} r={PIE_R} fill="rgba(128,128,128,0.1)" />
        <Circle cx={PIE_CX} cy={PIE_CY} r={46} fill="transparent" />
      </Svg>
    </View>
  );

  let startAngle = -Math.PI / 2;
  const paths    = [];

  slices.forEach((slice, i) => {
    const pct   = slice.value / total;
    const angle = pct * 2 * Math.PI;
    const x1    = PIE_CX + PIE_R * Math.cos(startAngle);
    const y1    = PIE_CY + PIE_R * Math.sin(startAngle);
    const x2    = PIE_CX + PIE_R * Math.cos(startAngle + angle);
    const y2    = PIE_CY + PIE_R * Math.sin(startAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    const d     = `M${PIE_CX},${PIE_CY} L${x1},${y1} A${PIE_R},${PIE_R} 0 ${large},1 ${x2},${y2} Z`;
    paths.push({ d, color: slice.color });
    startAngle += angle;
  });

  return (
    <View style={{ width:PIE_SIZE, height:PIE_SIZE, alignItems:'center', justifyContent:'center' }}>
      <Svg width={PIE_SIZE} height={PIE_SIZE}>
        <G>
          {paths.map((p, i) => <Path key={i} d={p.d} fill={p.color} stroke={bgStroke} strokeWidth={2} />)}
          <Circle cx={PIE_CX} cy={PIE_CY} r={48} fill="transparent" />
        </G>
      </Svg>
    </View>
  );
}

// ── PortfolioScreen ───────────────────────────────────────────────────────────
export default function PortfolioScreen() {
  const navigation   = useNavigation();
  const { t }        = useTranslation();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';
  const walletPublicKey = useAppStore(s => s.walletPublicKey);

  const C = {
    bg:      isDark ? '#07070F' : '#F4F5F9',
    card:    isDark ? '#111122' : '#FFFFFF',
    card2:   isDark ? '#171730' : '#ECECF4',
    text:    isDark ? '#EEEEFF' : '#1C1C24',
    muted:   isDark ? '#7E7EAA' : '#8A8A9E',
    border:  isDark ? '#1E1E38' : '#E8E8F2',
    success: '#10B981', error: '#EF4444', warning: '#F59E0B',
  };

  const [assets,      setAssets]      = useState([]);
  const [totalUSD,    setTotalUSD]    = useState(0);
  const [change24h,   setChange24h]   = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [selected,    setSelected]    = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const loadData = useCallback(async () => {
    if (!walletPublicKey) { setLoading(false); return; }
    try {
      const [solBal, tokenAccounts, marketData, customList] = await Promise.all([
        getSolBalance(true, walletPublicKey).catch(() => 0),
        getTokenAccounts(walletPublicKey).catch(() => []),
        getJupiterMarketData().catch(() => []),
        getCustomTokens().catch(() => []),
      ]);

      const priceMap = {}, changeMap = {};
      marketData.forEach(tk => {
        priceMap[tk.symbol]  = tk.current_price || 0;
        changeMap[tk.symbol] = tk.price_change_percentage_24h || 0;
      });

      let total = 0, weightedChange = 0;
      const allAssets = [];

      // Core Tokens
      CORE_TOKENS.forEach((token, i) => {
        let amount = 0;
        if (token.symbol === 'SOL') {
          amount = solBal || 0;
        } else {
          const found = tokenAccounts.find(tk => tk.mint === token.mint);
          if (found) amount = found.amount || 0;
        }
        const price    = priceMap[token.symbol] || 0;
        const valueUSD = amount * price;
        const change   = changeMap[token.symbol] || 0;
        if (valueUSD > 0 || token.symbol === 'SOL' || token.symbol === 'MECO') {
          total         += valueUSD;
          weightedChange += valueUSD * change;
          allAssets.push({ ...token, amount, price, valueUSD, change24h: change, color: ASSET_COLORS[i % ASSET_COLORS.length] });
        }
      });

      // Custom Tokens
      customList.forEach((token, i) => {
        const found  = tokenAccounts.find(tk => tk.mint === token.mint);
        const amount = found?.amount || 0;
        if (amount > 0) {
          const price    = priceMap[token.symbol] || token.current_price || 0;
          const valueUSD = amount * price;
          const change   = changeMap[token.symbol] || token.price_change_percentage_24h || 0;
          total         += valueUSD;
          weightedChange += valueUSD * change;
          allAssets.push({ ...token, amount, price, valueUSD, change24h: change, color: ASSET_COLORS[(CORE_TOKENS.length + i) % ASSET_COLORS.length] });
        }
      });

      allAssets.sort((a, b) => b.valueUSD - a.valueUSD);
      setAssets(allAssets);
      setTotalUSD(total);
      setChange24h(total > 0 ? weightedChange / total : 0);
    } catch (e) {
      console.error('Portfolio load error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      Animated.timing(fadeAnim, { toValue:1, duration:500, useNativeDriver:true }).start();
    }
  }, [walletPublicKey]);

  useEffect(() => { loadData(); }, [walletPublicKey]);
  const onRefresh = async () => { setRefreshing(true); await loadData(); };

  const pieSlices = assets
    .filter(a => a.valueUSD > 0.01)
    .map(a => ({ symbol: a.symbol, value: a.valueUSD, color: a.color, pct: totalUSD > 0 ? (a.valueUSD/totalUSD)*100 : 0 }));

  const up = change24h >= 0;

  const fmtUSD = (n) => {
    if (!n && n !== 0) return '$0.00';
    if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n/1e3).toFixed(2)}K`;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
  };
  const fmtAmt = (n, sym) => {
    if (!n || n === 0) return `0 ${sym}`;
    if (n < 0.0001) return `${n.toExponential(2)} ${sym}`;
    return `${n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 4 : 2 })} ${sym}`;
  };

  return (
    <SafeAreaView style={[S.root, { backgroundColor: C.bg }]}>

      {/* شريط العنوان المطور */}
       <View style={S.header}>
            <TouchableOpacity style={[S.backBtn, { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 }]} onPress={() => navigation.goBack()}>
                 <Ionicons name="arrow-back" size={18} color={C.text} />
            </TouchableOpacity>
            <Text style={[S.headerTitle, { color: C.text }]}>{t('portfolio', 'محفظتي')}</Text>
            <View style={{ width: 40 }} />
       </View>

      {loading ? (
        <View style={S.loadCenter}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[{ fontSize:13, marginTop:12 }, { color: C.muted }]}>{t('loading')}</Text>
        </View>
      ) : (
        <Animated.ScrollView
          style={{ opacity: fadeAnim }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={S.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} colors={[primaryColor]} />}
        >
          {/* ── إجمالي المحفظة المتناسق ── */}
          <View style={[S.totalCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[S.totalLabel, { color: C.muted }]}>{t('total_balance')}</Text>
            <Text style={[S.totalAmount, { color: C.text }]}>{fmtUSD(totalUSD)}</Text>
            <View style={[S.changePill, { backgroundColor: up ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)' }]}>
              <Ionicons name={up ? 'trending-up' : 'trending-down'} size={12} color={up ? C.success : C.error} />
              <Text style={[S.changeText, { color: up ? C.success : C.error }]}>
                {up ? '+' : ''}{change24h.toFixed(2)}% {t('time_24h')}
              </Text>
            </View>
          </View>

          {/* ── الرسم الدائري الأنيق ── */}
          {pieSlices.length > 0 && (
            <View style={[S.pieCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[S.sectionTitle, { color: C.text }]}>{t('asset_distribution', 'توزيع الأصول')}</Text>
              <View style={S.pieRow}>
                
                {/* الحاوي الدائري */}
                <View style={S.pieContainer}>
                  <PieChart slices={pieSlices} total={totalUSD} isDark={isDark} />
                  
                  {/* قيم المنتصف المتفاعلة */}
                  <View style={S.pieCenter}>
                    <Text style={[S.pieCenterAmt, { color: C.text }]}>
                      {selected ? fmtUSD(selected.value) : fmtUSD(totalUSD)}
                    </Text>
                    <Text style={[S.pieCenterLabel, { color: C.muted }]}>
                      {selected ? selected.symbol : t('total', 'الإجمالي')}
                    </Text>
                  </View>
                </View>

                {/* دليل الألوان الجانبي */}
                <View style={S.legend}>
                  {pieSlices.slice(0, 5).map((slice, i) => (
                    <TouchableOpacity
                      key={slice.symbol}
                      style={[S.legendItem, selected?.symbol === slice.symbol && { backgroundColor: C.bg, borderColor: C.border, borderWidth: 1 }]}
                      onPress={() => setSelected(selected?.symbol === slice.symbol ? null : slice)}
                    >
                      <View style={[S.legendDot, { backgroundColor: slice.color }]} />
                      <View style={S.legendInfo}>
                        <Text style={[S.legendSym, { color: C.text }]}>{slice.symbol}</Text>
                        <Text style={[S.legendPct, { color: C.muted }]}>{slice.pct.toFixed(1)}%</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ── قائمة الأصول (تصميم مسطح موحد كالمحترفين) ── */}
          <View style={[S.assetsCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[S.sectionTitle, { color: C.text }]}>{t('wallet_your_assets')}</Text>
            {assets.map((asset, i) => {
              const assetUp = asset.change24h >= 0;
              const pnlToday = asset.valueUSD * (asset.change24h / 100);
              return (
                <TouchableOpacity
                  key={asset.mint || asset.symbol}
                  style={[S.assetRow, i < assets.length-1 && { borderBottomWidth:1, borderBottomColor: C.border }]}
                  onPress={() => navigation.navigate('TokenDetails', { token: asset })}
                  activeOpacity={0.7}
                >
                  {/* أيقونة الأصل */}
                  <View style={[S.assetIcon, { backgroundColor: isDark ? '#171730' : '#ECECF4' }]}>
                    {asset.image
                      ? <Image source={{ uri: asset.image }} style={{ width:32, height:32, borderRadius:16 }} />
                      : <Text style={{ fontSize:14, fontWeight:'800', color: asset.color }}>{asset.symbol.charAt(0)}</Text>
                    }
                  </View>

                  {/* تفاصيل الرصيد */}
                  <View style={S.assetInfo}>
                    <Text style={[S.assetSym, { color: C.text }]}>{asset.symbol}</Text>
                    <Text style={[S.assetAmt, { color: C.muted }]}>{fmtAmt(asset.amount, asset.symbol)}</Text>
                  </View>

                  {/* القيمة المالية و P&L */}
                  <View style={S.assetRight}>
                    <Text style={[S.assetUSD, { color: C.text }]}>{fmtUSD(asset.valueUSD)}</Text>
                    <View style={S.pnlRow}>
                      <Ionicons name={assetUp?'caret-up':'caret-down'} size={9} color={assetUp?C.success:C.error} />
                      <Text style={[S.pnlText, { color: assetUp ? C.success : C.error }]}>
                        {assetUp?'+':''}{asset.change24h.toFixed(2)}%
                      </Text>
                      <Text style={[S.pnlUSD, { color: assetUp ? C.success : C.error }]}>
                        ({assetUp?'+':''}{pnlToday >= 0 ? fmtUSD(pnlToday) : `-${fmtUSD(Math.abs(pnlToday))}`})
                      </Text>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={14} color={C.muted} style={{ marginLeft:4 }} />
                </TouchableOpacity>
              );
            })}

            {assets.length === 0 && (
              <View style={S.empty}>
                <Ionicons name="pie-chart-outline" size={36} color={C.muted} />
                <Text style={[S.emptyText, { color: C.muted }]}>{t('no_assets', 'لا توجد أصول بعد')}</Text>
              </View>
            )}
          </View>

          {/* ── ملخص الأداء المطور والمقسم برقة ── */}
          {totalUSD > 0 && (
            <View style={[S.pnlCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[S.sectionTitle, { color: C.text }]}>{t('pnl_summary', 'ملخص الأرباح والخسائر')}</Text>
              <View style={S.pnlGrid}>
                {[
                  { label: t('pnl_today', 'اليوم P&L'),      value: totalUSD * (change24h/100),    isGain: up },
                  { label: t('best_asset', 'أفضل أصل'),
                    value: assets.filter(a=>a.valueUSD>0).sort((a,b)=>b.change24h-a.change24h)[0]?.symbol || '—',
                    isText: true,
                    color: C.success,
                  },
                  { label: t('assets_count', 'عدد الأصول'),  value: assets.filter(a=>a.valueUSD>0.01).length, isCount: true },
                  { label: t('largest_position', 'أكبر مركز'), value: assets[0]?.symbol || '—', isText: true, color: primaryColor },
                ].map(item => (
                  <View key={item.label} style={[S.pnlItem, { backgroundColor: C.bg, borderColor: C.border }]}>
                    <Text style={[S.pnlItemLabel, { color: C.muted }]}>{item.label}</Text>
                    {item.isText
                      ? <Text style={[S.pnlItemValue, { color: item.color || C.text }]}>{item.value}</Text>
                      : item.isCount
                      ? <Text style={[S.pnlItemValue, { color: C.text }]}>{item.value}</Text>
                      : <Text style={[S.pnlItemValue, { color: item.isGain ? C.success : C.error }]}>
                          {item.isGain ? '+' : ''}{fmtUSD(Math.abs(item.value))}
                        </Text>
                    }
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root:        { flex:1 },
  header:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:20, paddingVertical:14 },
  headerTitle: { fontSize:28, fontWeight:'800', letterSpacing:-0.5 },
  backBtn:     { width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center', borderWidth: 1 },
  loadCenter:  { flex:1, justifyContent:'center', alignItems:'center' },
  scroll:      { padding:20 },
  
  totalCard:   { borderRadius:18, padding:20, alignItems:'center', marginBottom:12, borderWidth: 1, elevation:1, shadowOffset:{width:0,height:2}, shadowOpacity:0.02, shadowRadius:4 },
  totalLabel:  { fontSize:12, fontWeight:'600', marginBottom:6 },
  totalAmount: { fontSize:36, fontWeight:'800', letterSpacing:-0.5, marginBottom:8 },
  changePill:  { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:10, paddingVertical:5, borderRadius:12 },
  changeText:  { fontSize:12, fontWeight:'700' },
  
  pieCard:     { borderRadius:18, padding:16, marginBottom:12, borderWidth:1, elevation:1, shadowOffset:{width:0,height:2}, shadowOpacity:0.02, shadowRadius:4 },
  sectionTitle:{ fontSize:14, fontWeight:'800', marginBottom:14 },
  pieRow:      { flexDirection:'row', alignItems:'center', gap:16, justifyContent: 'space-between' },
  pieContainer:{ position:'relative', alignItems:'center', justifyContent:'center', width: PIE_SIZE },
  pieCenter:   { position:'absolute', alignItems:'center' },
  pieCenterAmt:{ fontSize:11, fontWeight:'800' },
  pieCenterLabel:{ fontSize:10, marginTop:1 },
  legend:      { flex:1, gap:6, paddingLeft: 4 },
  legendItem:  { flexDirection:'row', alignItems:'center', gap:6, padding:6, borderRadius:8, borderWidth: 1, borderColor: 'transparent' },
  legendDot:   { width:8, height:8, borderRadius:4 },
  legendInfo:  { flex:1 },
  legendSym:   { fontSize:12, fontWeight:'700' },
  legendPct:   { fontSize:10, marginTop:1 },
  
  assetsCard:  { borderRadius:18, padding:16, marginBottom:12, borderWidth:1, elevation:1, shadowOffset:{width:0,height:2}, shadowOpacity:0.02, shadowRadius:4 },
  assetRow:    { flexDirection:'row', alignItems:'center', paddingVertical:12, gap:10 },
  assetIcon:   { width:36, height:36, borderRadius:18, justifyContent:'center', alignItems:'center' },
  assetInfo:   { flex:1 },
  assetSym:    { fontSize:14, fontWeight:'700' },
  assetAmt:    { fontSize:11, marginTop:1 },
  assetRight:  { alignItems:'flex-end' },
  assetUSD:    { fontSize:14, fontWeight:'700' },
  pnlRow:      { flexDirection:'row', alignItems:'center', gap:2, marginTop:2 },
  pnlText:     { fontSize:10, fontWeight:'600' },
  pnlUSD:      { fontSize:10 },
  empty:       { alignItems:'center', paddingVertical:30, gap:8 },
  emptyText:   { fontSize:14 },
  
  pnlCard:     { borderRadius:18, padding:16, marginBottom:12, borderWidth:1, elevation:1, shadowOffset:{width:0,height:2}, shadowOpacity:0.02, shadowRadius:4 },
  pnlGrid:     { flexDirection:'row', flexWrap:'wrap', gap:8 },
  pnlItem:     { width:(width-40-32-8)/2, padding:12, borderRadius:14, borderWidth: 1 },
  pnlItemLabel:{ fontSize:11, marginBottom:4, fontWeight: '600' },
  pnlItemValue:{ fontSize:15, fontWeight:'800' },
});
