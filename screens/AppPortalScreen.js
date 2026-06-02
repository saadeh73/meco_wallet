import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Image, Platform, FlatList, ActivityIndicator,
  Modal, TextInput, Keyboard, TouchableWithoutFeedback,
  Animated, SafeAreaView, KeyboardAvoidingView
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { pairWalletConnect, initWalletConnect } from '../services/walletConnectService';

const { width, height } = Dimensions.get('window');
const BOOKMARKS_KEY = '@meco_bookmarks';

// ─── Protocol data ────────────────────────────────────────────────────────────
const EARNING_OPPORTUNITIES = [
  { id: 'marinade-sol',   protocol: 'Marinade Finance', protocolIcon: 'https://assets.coingecko.com/coins/images/18612/large/mnde.png',    asset: 'SOL',      apy: 8.5,  url: 'https://marinade.finance/app/staking', category: 'staking', featured: true,  descKey: 'desc_marinade' },
  { id: 'jito-sol',       protocol: 'Jito',             protocolIcon: 'https://assets.coingecko.com/coins/images/33228/large/jto.png',     asset: 'SOL',      apy: 9.2,  url: 'https://jito.network/staking',         category: 'staking', featured: true,  descKey: 'desc_jito'     },
  { id: 'meteora-lp',     protocol: 'Meteora',          protocolIcon: 'https://meteora.ag/favicon.ico',                                    asset: 'SOL/USDC', apy: 20.0, url: 'https://app.meteora.ag',               category: 'defi',    featured: true,  descKey: 'desc_meteora'  },
  { id: 'jupiter-swap',   protocol: 'Jupiter',          protocolIcon: 'https://jup.ag/favicon.ico',                                        asset: 'SOL',      apy: 0,    url: 'https://jup.ag',                       category: 'trading', featured: true,  descKey: 'desc_jupiter'  },
  { id: 'kamino-usdc',    protocol: 'Kamino',           protocolIcon: 'https://www.kamino.finance/favicon.ico',                            asset: 'USDC',     apy: 8.0,  url: 'https://app.kamino.finance/lend',      category: 'defi',    featured: false, descKey: 'desc_kamino'   },
  { id: 'drift-perps',    protocol: 'Drift Protocol',   protocolIcon: 'https://drift.foundation/favicon.ico',                              asset: 'SOL/USDC', apy: 12.0, url: 'https://app.drift.trade',              category: 'trading', featured: false, descKey: 'desc_drift'    },
  { id: 'solend-lending', protocol: 'Solend',           protocolIcon: 'https://solend.fi/favicon.ico',                                     asset: 'USDC',     apy: 5.0,  url: 'https://solend.fi/dashboard',          category: 'defi',    featured: false, descKey: 'desc_solend'   },
  { id: 'raydium',        protocol: 'Raydium',          protocolIcon: 'https://assets.coingecko.com/coins/images/13928/large/PSym7VQ.png', asset: 'SOL-USDC', apy: 15.5, url: 'https://raydium.io/liquidity/pools/',                category: 'pools',   featured: false, descKey: 'desc_raydium'  },
  { id: 'orca',           protocol: 'Orca',             protocolIcon: 'https://assets.coingecko.com/coins/images/17547/large/Orca_Logo.png', asset: 'SOL-USDC', apy: 12.0, url: 'https://www.orca.so/pools',               category: 'pools',   featured: false, descKey: 'desc_orca'     },
];

const CAT = {
  staking: { accent: '#3B82F6', bg: 'rgba(59,130,246,0.13)',  icon: 'layers-outline'          },
  defi:    { accent: '#8B5CF6', bg: 'rgba(139,92,246,0.13)',  icon: 'trending-up-outline'     },
  trading: { accent: '#10B981', bg: 'rgba(16,185,129,0.13)',  icon: 'swap-horizontal-outline' },
  pools:   { accent: '#F59E0B', bg: 'rgba(245,158,11,0.13)',  icon: 'water-outline'           },
};

const SafeImage = ({ uri, style, fallbackIcon = 'globe-outline', fallbackColor = '#606080' }) => {
  const [err, setErr] = useState(false);
  if (err || !uri)
    return (
      <View style={[style, { backgroundColor: 'rgba(0,0,0,0.1)', justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name={fallbackIcon} size={style.width * 0.55} color={fallbackColor} />
      </View>
    );
  return <Image source={{ uri }} style={style} onError={() => setErr(true)} />;
};

const Pressable = ({ onPress, style, children }) => {
  const sc = useRef(new Animated.Value(1)).current;
  const spring = v => Animated.spring(sc, { toValue: v, useNativeDriver: true, damping: 15, stiffness: 300 }).start();
  return (
    <TouchableOpacity onPress={onPress} onPressIn={() => spring(0.96)} onPressOut={() => spring(1)} activeOpacity={1}>
      <Animated.View style={[style, { transform: [{ scale: sc }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
};

const TickerStrip = ({ items, C }) => {
  const x = useRef(new Animated.Value(0)).current;
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
    <View style={[S.tickerWrap, { borderTopColor: C.border, borderBottomColor: C.border }]}>
      <Animated.View style={[S.tickerTrack, { transform: [{ translateX: x }] }]}>
        {doubled.map((item, i) => (
          <View key={i} style={S.tickerItem}>
            <Text style={[S.tickerName, { color: C.muted }]}>{item.protocol}</Text>
            <View style={[S.tickerDot, { backgroundColor: C.border2 }]} />
            {item.apy > 0
              ? <Text style={[S.tickerApy, { color: '#3DFFA0' }]}>+{item.apy}%</Text>
              : <Text style={[S.tickerApy, { color: C.accent }]}>DEX</Text>}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

// ✅ INJECTED_JAVASCRIPT محسّن لحل مشكلة 100vh والـ viewport بشكل شامل
const getInjectedJavaScript = (screenHeight) => {
  return `
  (function() {
    'use strict';
    
    // ─────────────────────────────────────────────────────────────
    // 1. إصلاح ViewportMeta - ضمان دعم full height
    // ─────────────────────────────────────────────────────────────
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    // نستخدم viewport-fit=cover للتعامل مع الشاشات اللي فيها notch
    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=10.0, user-scalable=yes, viewport-fit=cover';
    
    // ─────────────────────────────────────────────────────────────
    // 2. إصلاح مشكلة 100vh في iOS Safari / Android Chrome
    //    (المشكلة الأساسية - mobile browsers يعتبرون 100vh = full screen including address bar)
    // ─────────────────────────────────────────────────────────────
    function fixVH() {
      // حساب الارتفاع الفعلي بدون الـ browser chrome
      const documentHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.documentElement.clientHeight
      );
      
      // استخدام innerHeight إذا متاح (يعطي الارتفاع الفعلي للviewport)
      const viewportHeight = window.innerHeight || documentHeight;
      
      // نحسب 1vh كـ 1% من الارتفاع الفعلي
      const vh = viewportHeight * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
      document.documentElement.style.setProperty('--real-height', viewportHeight + 'px');
      
      // تطبيق على body
      document.body.style.minHeight = viewportHeight + 'px';
      document.body.style.height = viewportHeight + 'px';
      document.documentElement.style.minHeight = viewportHeight + 'px';
      document.documentElement.style.height = viewportHeight + 'px';
      
      // إصلاح العناصر اللي تستخدم 100vh
      const style = document.createElement('style');
      style.id = 'meco-vh-fix';
      style.innerHTML = [
        '.__meco_fixed_height { height: ' + viewportHeight + 'px !important; }',
        '[style*="100vh"] { height: ' + viewportHeight + 'px !important; }',
        '[style*="100vh"] { min-height: ' + viewportHeight + 'px !important; }',
        '[class*="min-h-screen"] { min-height: ' + viewportHeight + 'px !important; }',
        '[class*="h-screen"] { height: ' + viewportHeight + 'px !important; }',
        '[class*="h-full"] { height: ' + viewportHeight + 'px !important; }',
        '[class*="container"] { max-width: 100% !important; }',
        // إصلاح للـ Orca تحديداً
        '[class*="Pool"] { min-height: ' + viewportHeight + 'px !important; }',
        '[class*="Liquidity"] { min-height: ' + viewportHeight + 'px !important; }',
        '[id*="pool"] { min-height: ' + viewportHeight + 'px !important; }',
      ].join('\\n');
      
      const existing = document.getElementById('meco-vh-fix');
      if (existing) existing.remove();
      document.head.appendChild(style);
      
      // إصلاح inline styles على العناصر الرئيسية
      document.querySelectorAll('[style*="100vh"], [style*="100vh"]').forEach(el => {
        if (el.scrollHeight > viewportHeight) {
          el.style.minHeight = viewportHeight + 'px';
        }
      });
    }
    
    // ─────────────────────────────────────────────────────────────
    // 3. إصلاح scrolling - ضمان أن الصفحة قابلة للتمرير
    // ─────────────────────────────────────────────────────────────
    function fixScrolling() {
      document.body.style.overflowY = 'auto';
      document.body.style.overflowX = 'hidden';
      document.documentElement.style.overflowY = 'auto';
      document.documentElement.style.overflowX = 'hidden';
      document.documentElement.style.position = 'relative';
      document.body.style.position = 'relative';
      
      // إزالة fixed positioning من العناصر اللي بتسبب مشاكل
      document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]').forEach(el => {
        const style = el.getAttribute('style') || '';
        if (style.includes('top: 0') && style.includes('left: 0') && style.includes('right: 0')) {
          el.style.position = 'absolute';
        }
      });
    }
    
    // ─────────────────────────────────────────────────────────────
    // 4. إصلاح للعناصر الثابتة (fixed/sticky) اللي ممكن تعطل التفاعل
    // ─────────────────────────────────────────────────────────────
    function fixFixedElements() {
      // تحويل fixed overlays إلى relative إن أمكن
      document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        // إن كان العنصر يغطي كل الشاشة تقريباً (overlay)
        if (rect.width > window.innerWidth * 0.9 && rect.height > window.innerHeight * 0.9) {
          // نخليه position absolute بدل fixed
          // el.style.position = 'absolute'; // ⚠️ ممكن يكسر التصميم، نستخدم حل آخر
        }
      });
    }
    
    // ─────────────────────────────────────────────────────────────
    // 4.5 إصلاح شعارات MECO اللي تطلع غريبة في WebView
    //     (Lottie animations / SVGs / position: fixed elements)
    // ─────────────────────────────────────────────────────────────
    function fixMecoLogos() {
      // CSS قوي لإخفاء/احتواء الشعارات المعطوبة
      let mecoStyle = document.getElementById('meco-logo-fix');
      if (mecoStyle) mecoStyle.remove();
      
      mecoStyle = document.createElement('style');
      mecoStyle.id = 'meco-logo-fix';
      mecoStyle.innerHTML = [
        // إخفاء Lottie animations اللي بتسبب مشاكل
        'lottie-player, [class*="lottie"], [class*="Lottie"], [data-animation-type="lottie"] {',
        '  max-width: 100% !important;',
        '  max-height: 60px !important;',
        '  object-fit: contain !important;',
        '  overflow: hidden !important;',
        '  position: static !important;',
        '}',
        // إصلاح عناصر SVG الكبيرة
        'svg[width="100%"], svg[style*="width: 100%"] {',
        '  max-width: 100% !important;',
        '  max-height: 80px !important;',
        '  height: auto !important;',
        '}',
        // إصلاح صور الشعارات
        'img[src*="logo"], img[class*="logo"], img[alt*="logo" i], img[alt*="meco" i] {',
        '  max-width: 100% !important;',
        '  max-height: 60px !important;',
        '  object-fit: contain !important;',
        '  width: auto !important;',
        '  height: auto !important;',
        '}',
        // إصلاح الـ fixed divs اللي تحتوي على شعارات
        'div[style*="position: fixed"][style*="z-index"] {',
        '  max-width: 100vw !important;',
        '  max-height: 100vh !important;',
        '  overflow: hidden !important;',
        '}',
        // إخفاء عناصر الـ canvas الكبيرة
        'canvas {',
        '  max-width: 100% !important;',
        '  max-height: 80px !important;',
        '  object-fit: contain !important;',
        '}',
        // إصلاح خلفيات الـ SVG أو الـ div اللي تحتوي على meco
        '[class*="meco-logo"], [class*="MecoLogo"], [class*="brand"], [class*="Brand"] {',
        '  max-width: 100% !important;',
        '  max-height: 60px !important;',
        '  overflow: hidden !important;',
        '  display: block !important;',
        '  position: static !important;',
        '}',
      ].join('\\n');
      document.head.appendChild(mecoStyle);
      
      // تنظيف inline styles على الشعارات
      document.querySelectorAll('img, svg, lottie-player, canvas, div').forEach(el => {
        const src = (el.src || el.getAttribute('src') || '').toLowerCase();
        const alt = (el.alt || el.getAttribute('alt') || '').toLowerCase();
        const cls = (el.className || '').toString().toLowerCase();
        
        const isLogo = src.includes('logo') || alt.includes('meco') || alt.includes('logo') || 
                       cls.includes('logo') || cls.includes('meco') || cls.includes('brand') ||
                       cls.includes('lottie');
        
        if (isLogo) {
          el.style.maxWidth = '100%';
          el.style.maxHeight = '60px';
          el.style.width = 'auto';
          el.style.height = 'auto';
          el.style.objectFit = 'contain';
          el.style.overflow = 'hidden';
          if (el.style.position === 'fixed' || el.style.position === 'absolute') {
            el.style.position = 'static';
          }
        }
      });
    }
    
    // ─────────────────────────────────────────────────────────────
    // 5. Event Listeners للـ resize و orientation change
    // ─────────────────────────────────────────────────────────────
    window.addEventListener('resize', function() {
      fixVH();
      fixScrolling();
    });
    
    window.addEventListener('orientationchange', function() {
      setTimeout(function() {
        fixVH();
        fixScrolling();
      }, 100);
    });
    
    // ─────────────────────────────────────────────────────────────
    // 6. Touch handling - تحسين التفاعل مع العناصر القابلة للتمرير
    // ─────────────────────────────────────────────────────────────
    document.addEventListener('touchstart', function(e) {
      // السماح بالتمرير في أي مكان
      e.stopPropagation();
    }, { passive: true });
    
    document.addEventListener('touchmove', function(e) {
      // لا نمنع الـ touchmove للسماح بالتمرير
    }, { passive: true });
    
    // ─────────────────────────────────────────────────────────────
    // 7. تنفيذ الإصلاحات
    // ─────────────────────────────────────────────────────────────
    fixVH();
    fixScrolling();
    fixMecoLogos();
    
    // تنفيذ متكرر لضمان تطبيق الإصلاحات بعد تحميل كل شيء
    setTimeout(fixVH, 100);
    setTimeout(fixVH, 500);
    setTimeout(fixVH, 1000);
    setTimeout(fixVH, 2000);
    setTimeout(fixMecoLogos, 200);
    setTimeout(fixMecoLogos, 800);
    setTimeout(fixMecoLogos, 1500);
    setTimeout(fixMecoLogos, 3000);
    
    // MutationObserver لمراقبة التغييرات في DOM
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(function(mutations) {
        let shouldFix = false;
        mutations.forEach(function(mutation) {
          if (mutation.addedNodes.length > 0) {
            shouldFix = true;
          }
        });
        if (shouldFix) {
          setTimeout(fixVH, 50);
          setTimeout(fixMecoLogos, 50);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    
    console.log('[MECO] WebView viewport fix applied');
  })();
  true;
  `;
};

export default function AppPortalScreen() {
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
    shadow:   isDark ? '#000'    : '#C0C0D8',
  };

  const [bookmarks,        setBookmarks]        = useState([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(true);
  const [addModalVisible,  setAddModalVisible]  = useState(false);
  const [newBookmark,      setNewBookmark]       = useState({ name: '', url: '', iconUrl: '' });
  const [activeView,       setActiveView]        = useState('explore');
  const [tabs,             setTabs]              = useState([]);
  const [activeTabId,      setActiveTabId]       = useState(null);
  const [inputUrl,         setInputUrl]          = useState('');
  const [loadingWeb,       setLoadingWeb]        = useState(false);
  const [menuVisible,      setMenuVisible]       = useState(false);
  const [tabsOvVisible,    setTabsOvVisible]     = useState(false);
  const [screenHeight,     setScreenHeight]      = useState(height);

  const webviewRefs = useRef({});
  const headerY     = useRef(new Animated.Value(-18)).current;
  const headerOp    = useRef(new Animated.Value(0)).current;
  const bodyOp      = useRef(new Animated.Value(0)).current;
  const switchX     = useRef(new Animated.Value(0)).current;
  const contentWrapperRef = useRef(null);

  // ✅ تحديث screenHeight عند تغير الـ dimensions
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenHeight(window.height);
    });
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    Animated.stagger(70, [
      Animated.parallel([
        Animated.spring(headerY,  { toValue: 0, useNativeDriver: true, damping: 18 }),
        Animated.timing(headerOp, { toValue: 1, useNativeDriver: true, duration: 340 }),
      ]),
      Animated.timing(bodyOp, { toValue: 1, useNativeDriver: true, duration: 400 }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.spring(switchX, { toValue: activeView === 'explore' ? 0 : 1, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
  }, [activeView]);

  useEffect(() => { loadBookmarks(); }, []);

  useEffect(() => {
    initWalletConnect().catch(err => console.warn('WalletConnect init:', err.message));
  }, []);

  useEffect(() => {
    const scanned = route.params?.scannedAddress;
    if (scanned && scanned.startsWith('wc:')) {
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
    await saveBookmarks([{ id: Date.now().toString(), name: newBookmark.name.trim(), url, iconUrl: newBookmark.iconUrl.trim() || null }, ...bookmarks]);
    setNewBookmark({ name: '', url: '', iconUrl: '' });
    setAddModalVisible(false);
  };
  const handleDeleteBookmark = id => saveBookmarks(bookmarks.filter(b => b.id !== id));

  const openNewTab = url => {
    const id = Date.now().toString();
    setTabs(prev => [...prev, { id, url, title: t('loading_page'), canGoBack: false, canGoForward: false }]);
    setActiveTabId(id); setInputUrl(url); setTabsOvVisible(false);
  };
  const closeTab = id => {
    const next = tabs.filter(t => t.id !== id);
    setTabs(next);
    if (activeTabId === id) {
      if (next.length) { setActiveTabId(next[next.length - 1].id); setInputUrl(next[next.length - 1].url); }
      else { setActiveTabId(null); setInputUrl(''); setTabsOvVisible(false); }
    }
  };
  const switchTab = id => {
    const tab = tabs.find(t => t.id === id);
    if (tab) { setActiveTabId(id); setInputUrl(tab.url); setTabsOvVisible(false); }
  };
  const handleSearch = () => {
    let url = inputUrl.trim();
    if (!url) return;
    if (!url.startsWith('http') && !url.includes('.')) url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    else if (!url.startsWith('http')) url = `https://${url}`;
    Keyboard.dismiss();
    if (activeTabId) setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, url } : t));
    else openNewTab(url);
  };

  const activeTab  = tabs.find(t => t.id === activeTabId);
  const featured   = EARNING_OPPORTUNITIES.filter(a => a.featured);
  const categories = [
    { id: 'staking', titleKey: 'category_staking' },
    { id: 'defi',    titleKey: 'category_defi'    },
    { id: 'trading', titleKey: 'category_trading'  },
    { id: 'pools',   titleKey: 'category_pools'    },
  ].map(c => ({ ...c, data: EARNING_OPPORTUNITIES.filter(a => a.category === c.id) })).filter(c => c.data.length);

  const FeaturedCard = ({ item }) => {
    const cat = CAT[item.category] || CAT.staking;
    return (
      <Pressable onPress={() => openNewTab(item.url)} style={[S.featCard, { backgroundColor: C.surface, shadowColor: C.shadow }]}>
        <View style={[S.featBlob, { backgroundColor: cat.accent + '12' }]} pointerEvents="none" />
        <View style={S.featTop}>
          <View style={[S.featIconWrap, { backgroundColor: cat.bg, borderColor: cat.accent + '35' }]}>
            <SafeImage uri={item.protocolIcon} style={S.featIcon} fallbackIcon="business-outline" fallbackColor={cat.accent} />
          </View>
          {item.apy > 0 ? (
            <View style={[S.apyPill, { backgroundColor: cat.bg, borderColor: cat.accent + '40' }]}>
              <Text style={[S.apySmall, { color: cat.accent }]}>{t('up_to')}</Text>
              <Text style={[S.apyBig,   { color: cat.accent }]}>{item.apy}%</Text>
              <Text style={[S.apySmall, { color: cat.accent }]}>{t('portal_apy_label')}</Text>
            </View>
          ) : (
            <View style={[S.apyPill, { backgroundColor: C.inputBg, borderColor: C.border2 }]}>
              <Ionicons name={cat.icon} size={13} color={C.muted} />
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
            <Ionicons name="arrow-forward" size={14} color={cat.accent} />
          </View>
        </View>
      </Pressable>
    );
  };

  const AppCard = ({ item }) => {
    const cat = CAT[item.category] || CAT.staking;
    return (
      <Pressable onPress={() => openNewTab(item.url)} style={[S.appCard, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadow }]}>
        <View style={[S.appIconWrap, { backgroundColor: cat.bg }]}>
          <SafeImage uri={item.protocolIcon} style={S.appIcon} fallbackIcon="globe-outline" fallbackColor={cat.accent} />
        </View>
        <Text style={[S.appName,  { color: C.text }]} numberOfLines={1}>{item.protocol}</Text>
        <Text style={[S.appAsset, { color: C.muted }]} numberOfLines={1}>{item.asset}</Text>
        {item.apy > 0 && (
          <View style={[S.appApy, { backgroundColor: cat.bg }]}>
            <Text style={[S.appApyTxt, { color: cat.accent }]}>{item.apy}%</Text>
          </View>
        )}
      </Pressable>
    );
  };

  const BookmarkRow = ({ item }) => (
    <View style={[S.bmCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      <TouchableOpacity
        onPress={() => openNewTab(item.url)}
        onLongPress={() => handleDeleteBookmark(item.id)}
        delayLongPress={600}
        style={S.bmInner}
        activeOpacity={0.7}
      >
        <View style={[S.bmIconWrap, { backgroundColor: C.accent + '18' }]}>
          <SafeImage uri={item.iconUrl} style={S.bmIcon} fallbackIcon="link-outline" fallbackColor={C.accent} />
        </View>
        <View style={S.bmInfo}>
          <Text style={[S.bmName, { color: C.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[S.bmUrl,  { color: C.muted }]} numberOfLines={1}>{item.url.replace(/^https?:\/\//, '')}</Text>
        </View>
        <View style={[S.bmChevron, { backgroundColor: C.border }]}>
          <Ionicons name="chevron-forward" size={13} color={C.muted} />
        </View>
      </TouchableOpacity>
    </View>
  );

  const SectionHead = ({ titleKey, catId }) => {
    const cat = catId ? CAT[catId] : null;
    return (
      <View style={S.secHead}>
        {cat && <View style={[S.secDot, { backgroundColor: cat.accent, shadowColor: cat.accent }]} />}
        <Text style={[S.secTitle, { color: C.text }]}>{t(titleKey)}</Text>
      </View>
    );
  };

  // ✅ دالة render الـ WebView منفصلة لاستخدامها بحالتين
  const renderWebView = (tab) => (
    <View key={tab.id} style={S.webViewWrapper}>
      {loadingWeb && tab.id === activeTabId && (
        <View style={[S.webLoader, { backgroundColor: C.bg }]}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      )}
      <WebView
        ref={el => (webviewRefs.current[tab.id] = el)}
        source={{ uri: tab.url }}
        style={S.webView}
        containerStyle={S.webViewContainer}
        injectedJavaScript={getInjectedJavaScript(screenHeight)}
        scalesPageToFit={true}
        bounces={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        pullToRefreshEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={true}
        startInLoadingState={false}
        onLoadStart={() => { if (tab.id === activeTabId) setLoadingWeb(true); }}
        onLoadEnd={()   => { if (tab.id === activeTabId) setLoadingWeb(false); }}
        onNavigationStateChange={nav => {
          setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, url: nav.url, title: nav.title || t.title, canGoBack: nav.canGoBack, canGoForward: nav.canGoForward } : t));
          if (tab.id === activeTabId) setInputUrl(nav.url);
        }}
        onMessage={event => {
          // Handle messages from web if needed
          console.log('[WebView] Message:', event.nativeEvent.data);
        }}
        onError={syntheticEvent => {
          const { nativeEvent } = syntheticEvent;
          console.warn('[WebView] Error:', nativeEvent.description);
        }}
      />
    </View>
  );

  return (
    // ✅ Root View بـ flex: 1 و background صريح
    <View style={[S.root, { backgroundColor: C.bg, flex: 1 }]}>
      
      {/* ✅ SafeAreaView للشريط العلوي فقط */}
      <SafeAreaView style={[S.safeAreaTop, { backgroundColor: C.bg }]} edges={['top']}>
        
        {/* ── Address bar ── */}
        <Animated.View style={[S.addrRow, { opacity: headerOp, transform: [{ translateY: headerY }] }]}>
          <TouchableOpacity
            style={[S.homeBtn, { backgroundColor: activeTabId ? C.inputBg : C.accent + '25', borderColor: activeTabId ? C.border : C.accent + '50' }]}
            onPress={() => setActiveTabId(null)}
          >
            <Ionicons name={activeTabId ? 'home-outline' : 'home'} size={20} color={activeTabId ? C.muted : C.accent} />
          </TouchableOpacity>

          <View style={[S.urlBar, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            <Ionicons name="search" size={14} color={C.muted} style={{ marginLeft: 13 }} />
            <TextInput
              style={[S.urlInput, { color: C.text }]}
              placeholder={t('browser_search_placeholder')}
              placeholderTextColor={C.muted}
              value={inputUrl}
              onChangeText={setInputUrl}
              onSubmitEditing={handleSearch}
              autoCapitalize="none"
              keyboardType="url"
              returnKeyType="go"
            />
            {activeTabId && (
              <TouchableOpacity onPress={() => setMenuVisible(true)} style={S.dotsBtn}>
                <Ionicons name="ellipsis-vertical" size={18} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[S.qrBtn, { backgroundColor: C.accent + '20', borderColor: C.accent + '50' }]}
            onPress={() => navigation.navigate('QRScanner')}
          >
            <Ionicons name="qr-code-outline" size={20} color={C.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[S.tabsBtn, { backgroundColor: tabs.length ? C.accent + '20' : C.inputBg, borderColor: tabs.length ? C.accent + '55' : C.border }]}
            onPress={() => tabs.length && setTabsOvVisible(true)}
          >
            <Text style={[S.tabsBadge, { color: tabs.length ? C.accent : C.muted }]}>{tabs.length}</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      {/* ── Browser menu ── */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
          <View style={{ flex: 1 }}>
            <View style={[S.menu, { backgroundColor: C.surface2, borderColor: C.border2, top: Platform.OS === 'ios' ? 96 : 76 }]}>
              {[
                { icon: 'arrow-back',    key: 'browser_back',    enabled: activeTab?.canGoBack,    action: () => { setMenuVisible(false); if (activeTab?.canGoBack) webviewRefs.current[activeTabId]?.goBack(); } },
                { icon: 'arrow-forward', key: 'browser_forward', enabled: activeTab?.canGoForward, action: () => { setMenuVisible(false); if (activeTab?.canGoForward) webviewRefs.current[activeTabId]?.goForward(); } },
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

      {/* ── Tabs overview ── */}
      <Modal visible={tabsOvVisible} animationType="slide" onRequestClose={() => setTabsOvVisible(false)}>
        <View style={[S.tabsOvRoot, { backgroundColor: C.bg }]}>
          <View style={[S.tabsOvHeader, { borderBottomColor: C.border }]}>
            <View>
              <Text style={[S.tabsOvTitle, { color: C.text }]}>{t('open_tabs')}</Text>
              <Text style={[S.tabsOvSub,   { color: C.muted }]}>{tabs.length} {t('portal_tabs_label')}</Text>
            </View>
            <TouchableOpacity style={[S.closeBtn, { backgroundColor: C.border }]} onPress={() => { setTabsOvVisible(false); if (!activeTabId && tabs.length) setActiveTabId(tabs[0].id); }}>
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
                  <Text style={[S.tabPreviewUrl, { color: C.muted }]} numberOfLines={2}>{item.url.replace(/^https?:\/\//, '').substring(0, 32)}</Text>
                </TouchableOpacity>
              </View>
            )}
          />
          <TouchableOpacity style={[S.newTabBtn, { backgroundColor: C.accent }]} onPress={() => { setTabsOvVisible(false); setActiveTabId(null); setInputUrl(''); }}>
            <Ionicons name="add" size={22} color="#FFF" />
            <Text style={S.newTabTxt}>{t('new_tab')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Main content ── */}
      {/* ✅ contentWrapper يملأ المساحة المتبقية بالكامل */}
      <View style={S.contentWrapper} ref={contentWrapperRef} collapsable={false}>
        {activeTabId ? (
          // ✅ WebView يملأ كامل المساحة المتبقية
          tabs.map(tab => (
            tab.id === activeTabId ? renderWebView(tab) : null
          ))
        ) : (
          // ✅ ScrollView للمحتوى الاستكشافي
          <Animated.ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={{ paddingBottom: 60, flexGrow: 1 }} 
            style={{ opacity: bodyOp }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={S.hero}>
              <View style={[S.heroBadge, { backgroundColor: C.accent + '18', borderColor: C.accent + '40' }]}>
                <View style={[S.heroPulse, { backgroundColor: C.accent }]} />
                <Text style={[S.heroBadgeTxt, { color: C.accent }]}>{t('portal_badge_label')}</Text>
              </View>
              <Text style={[S.heroTitle, { color: C.text }]}>{t('explore_web3')}</Text>
              <Text style={[S.heroSub,   { color: C.muted }]}>{t('explore_desc')}</Text>
            </View>

            <TickerStrip items={EARNING_OPPORTUNITIES} C={C} />

            <View style={[S.switcher, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Animated.View style={[S.switchThumb, {
                backgroundColor: C.accent,
                width: (width - 62) / 2,
                shadowColor: C.accent,
                transform: [{ translateX: switchX.interpolate({ inputRange: [0, 1], outputRange: [3, (width - 62) / 2 + 3] }) }],
              }]} />
              {[
                { id: 'explore',   activeIcon: 'compass',   idleIcon: 'compass-outline',  key: 'discover'  },
                { id: 'bookmarks', activeIcon: 'bookmark',  idleIcon: 'bookmark-outline', key: 'bookmarks' },
              ].map(tab => {
                const active = activeView === tab.id;
                return (
                  <TouchableOpacity key={tab.id} style={S.switchBtn} onPress={() => setActiveView(tab.id)}>
                    <Ionicons name={active ? tab.activeIcon : tab.idleIcon} size={16} color={active ? '#FFF' : C.muted} style={{ marginRight: 6 }} />
                    <Text style={[S.switchTxt, { color: active ? '#FFF' : C.muted }]}>{t(tab.key)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeView === 'explore' ? (
              <>
                <View style={S.section}>
                  <SectionHead titleKey="featured_apps" />
                  <FlatList
                    data={featured} horizontal showsHorizontalScrollIndicator={false}
                    keyExtractor={i => i.id}
                    renderItem={({ item }) => <FeaturedCard item={item} />}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
                    decelerationRate="fast"
                    snapToInterval={width * 0.75 + 16}
                    snapToAlignment="start"
                  />
                </View>
                {categories.map(cat => (
                  <View key={cat.id} style={S.section}>
                    <SectionHead titleKey={cat.titleKey} catId={cat.id} />
                    <FlatList
                      data={cat.data} horizontal showsHorizontalScrollIndicator={false}
                      keyExtractor={i => i.id}
                      renderItem={({ item }) => <AppCard item={item} />}
                      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
                    />
                  </View>
                ))}
              </>
            ) : (
              <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                <TouchableOpacity
                  style={[S.addBmBtn, { backgroundColor: C.surface, borderColor: C.accent + '45' }]}
                  onPress={() => { setNewBookmark({ name: '', url: '', iconUrl: '' }); setAddModalVisible(true); }}
                >
                  <View style={[S.addBmIcon, { backgroundColor: C.accent + '20' }]}>
                    <Ionicons name="add" size={20} color={C.accent} />
                  </View>
                  <Text style={[S.addBmTxt, { color: C.accent }]}>{t('add_bookmark')}</Text>
                </TouchableOpacity>

                {loadingBookmarks ? (
                  <ActivityIndicator size="small" color={C.accent} style={{ marginTop: 48 }} />
                ) : bookmarks.length ? (
                  bookmarks.map(item => <BookmarkRow key={item.id} item={item} />)
                ) : (
                  <View style={[S.emptyState, { backgroundColor: C.surface, borderColor: C.border }]}>
                    <View style={[S.emptyIcon, { backgroundColor: C.accent + '18' }]}>
                      <Ionicons name="bookmark-outline" size={30} color={C.accent} />
                    </View>
                    <Text style={[S.emptyTitle, { color: C.text }]}>{t('no_bookmarks_yet')}</Text>
                    <Text style={[S.emptySub,   { color: C.muted }]}>{t('portal_no_bookmarks_hint')}</Text>
                  </View>
                )}
              </View>
            )}
          </Animated.ScrollView>
        )}
      </View>

      {/* ── Add bookmark sheet ── */}
      <Modal visible={addModalVisible} transparent animationType="slide" onRequestClose={() => setAddModalVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={S.sheetOverlay}>
            <View style={[S.sheet, { backgroundColor: C.surface2 }]}>
              <View style={[S.sheetHandle, { backgroundColor: C.border2 }]} />
              <Text style={[S.sheetTitle, { color: C.text }]}>{t('add_bookmark')}</Text>
              {[
                { field: 'name', icon: 'text-outline', placeholderKey: 'bookmark_name_placeholder', kbType: 'default' },
                { field: 'url',  icon: 'link-outline', placeholderKey: 'bookmark_url_placeholder',  kbType: 'url'     },
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

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

const S = StyleSheet.create({
  // ✅ Root - يملأ كل المساحة مع flex: 1
  root: { 
    flex: 1,
    // ✅ إضافة padding للأمان في الأسفل (home indicator)
    paddingBottom: Platform.OS === 'ios' ? 34 : 0,
  },
  
  // ✅ SafeArea للشريط العلوي فقط
  safeAreaTop: {
    width: '100%',
    zIndex: 10,
  },
  
  // ✅ contentWrapper - يملأ المساحة المتبقية
  contentWrapper: { 
    flex: 1,
    width: '100%',
  },
  
  // ✅ WebView wrapper - يملأ كامل المساحة
  webViewWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  
  // ✅ WebView style و container
  webView: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  
  webViewContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  
  addrRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  homeBtn:  { width: 42, height: 42, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  urlBar:   { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 13, borderWidth: 1, height: 44 },
  urlInput: { flex: 1, paddingHorizontal: 10, fontSize: 14, height: '100%' },
  dotsBtn:  { paddingHorizontal: 11, height: '100%', justifyContent: 'center' },
  qrBtn:    { width: 42, height: 42, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  tabsBtn:  { width: 42, height: 42, borderRadius: 13, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  tabsBadge:{ fontSize: 14, fontWeight: '800' },
  hero:        { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 16 },
  heroBadge:   { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, gap: 7, marginBottom: 14 },
  heroPulse:   { width: 7, height: 7, borderRadius: 4 },
  heroBadgeTxt:{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, fontFamily: MONO },
  heroTitle:   { fontSize: 32, fontWeight: '900', letterSpacing: -0.8, marginBottom: 6, lineHeight: 38 },
  heroSub:     { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  tickerWrap:  { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 10, overflow: 'hidden', marginBottom: 2 },
  tickerTrack: { flexDirection: 'row' },
  tickerItem:  { width: 140, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16 },
  tickerName:  { fontFamily: MONO, fontSize: 11, fontWeight: '600' },
  tickerDot:   { width: 3, height: 3, borderRadius: 2 },
  tickerApy:   { fontFamily: MONO, fontSize: 11, fontWeight: '700' },
  switcher:    { flexDirection: 'row', marginHorizontal: 20, borderRadius: 18, borderWidth: 1, padding: 3, marginTop: 18, marginBottom: 24, height: 50, position: 'relative' },
  switchThumb: { position: 'absolute', top: 3, bottom: 3, borderRadius: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  switchBtn:   { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  switchTxt:   { fontSize: 14, fontWeight: '700' },
  section:  { marginBottom: 28 },
  secHead:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, marginBottom: 14, gap: 9 },
  secDot:   { width: 9, height: 9, borderRadius: 5, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  secTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  featCard: { width: width * 0.75, borderRadius: 26, padding: 20, marginRight: 16, overflow: 'hidden', elevation: 5, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 16 },
  featBlob:     { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: -60, right: -50 },
  featTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, zIndex: 1 },
  featIconWrap: { width: 60, height: 60, borderRadius: 20, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  featIcon:     { width: 44, height: 44, borderRadius: 12 },
  apyPill:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, borderWidth: 1, gap: 3 },
  apySmall:     { fontSize: 11, fontWeight: '700', fontFamily: MONO },
  apyBig:       { fontSize: 16, fontWeight: '900', fontFamily: MONO },
  featName:     { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4, zIndex: 1 },
  featAsset:    { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 10, fontFamily: MONO, zIndex: 1 },
  featDesc:     { fontSize: 13, lineHeight: 19, marginBottom: 16, zIndex: 1 },
  featFooter:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 14 },
  openLabel:    { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  openArrow:    { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  appCard: { width: 114, padding: 14, borderRadius: 22, marginRight: 12, alignItems: 'center', borderWidth: 1, elevation: 2, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 6 },
  appIconWrap: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 10, overflow: 'hidden' },
  appIcon:     { width: 38, height: 38, borderRadius: 11 },
  appName:     { fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 3 },
  appAsset:    { fontSize: 11, textAlign: 'center', marginBottom: 7 },
  appApy:      { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9 },
  appApyTxt:   { fontSize: 11, fontWeight: '800', fontFamily: MONO },
  vpnBadge:    { position: 'absolute', top: 9, right: 9, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(245,158,11,0.18)', justifyContent: 'center', alignItems: 'center' },
  bmCard:    { borderRadius: 18, marginBottom: 10, borderWidth: 1, elevation: 1, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
  bmInner:   { flexDirection: 'row', alignItems: 'center', padding: 14 },
  bmIconWrap:{ width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 14, overflow: 'hidden' },
  bmIcon:    { width: 28, height: 28, borderRadius: 8 },
  bmInfo:    { flex: 1, marginRight: 8 },
  bmName:    { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  bmUrl:     { fontSize: 12 },
  bmChevron: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  addBmBtn:  { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, marginBottom: 16, borderWidth: 1.5, borderStyle: 'dashed', gap: 12 },
  addBmIcon: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  addBmTxt:  { fontSize: 15, fontWeight: '700' },
  emptyState: { padding: 36, borderRadius: 24, alignItems: 'center', marginTop: 6, borderWidth: 1, gap: 10 },
  emptyIcon:  { width: 62, height: 62, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  webLoader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  tabsOvRoot:      { flex: 1, paddingTop: Platform.OS === 'ios' ? 52 : 20 },
  tabsOvHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  tabsOvTitle:     { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  tabsOvSub:       { fontSize: 13 },
  closeBtn:        { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  tabPreview:      { flex: 1, margin: 8, borderRadius: 20, borderWidth: 2, height: 175, overflow: 'hidden' },
  tabPreviewTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottomWidth: 1 },
  tabPreviewTitle: { flex: 1, fontSize: 12, fontWeight: '700', marginRight: 6 },
  tabCloseBtn:     { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  tabPreviewBody:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  tabFavicon:      { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  tabPreviewUrl:   { fontSize: 11, textAlign: 'center', paddingHorizontal: 8 },
  newTabBtn:       { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30, elevation: 6, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10 },
  newTabTxt:       { color: '#FFF', fontWeight: '800', fontSize: 16, marginLeft: 8 },
  menu:       { position: 'absolute', right: 62, width: 188, borderRadius: 18, borderWidth: 1, elevation: 10, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 14 },
  menuRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  menuTxt:    { fontSize: 14, fontWeight: '600' },
  menuDivider:{ height: 1, marginHorizontal: 10 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:   { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 20 },
  inputRow:     { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginBottom: 12, height: 52 },
  inputTxt:     { flex: 1, paddingHorizontal: 12, fontSize: 15, height: '100%' },
  sheetBtns:    { flexDirection: 'row', gap: 12, marginTop: 8 },
  sheetBtn:     { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, borderRadius: 14 },
  sheetBtnTxt:  { fontSize: 15, fontWeight: '800' },
});
