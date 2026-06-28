// WalletScreen.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  RefreshControl, TextInput, Modal, Dimensions, Animated,
  FlatList, Image, ActivityIndicator, Platform, KeyboardAvoidingView
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // حساب مسافات الأمان بدقة
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSolBalance, getTokenAccounts, getTokenBalance } from '../services/heliusService';
import { CORE_TOKENS, getJupiterMarketData, getCustomTokens } from '../services/jupiterMarketService';
import * as LocalAuthentication from 'expo-local-authentication';

const { width, height } = Dimensions.get('window');

const ACCOUNT_EMOJIS = [
  '🦁','🐯','🦊','🐺','🐻','🦝','🦄','🐲','🦅','🦋',
  '🌟','⚡','🔥','💎','🚀','🌙','☀️','🌊','🏔️','🎯',
  '💰','🏆','👑','🎭','🎨','🛡️','⚔️','🌈','🍀','🎸',
  '🤖','👻','🦸','🧙','🧊','🌋','🌺','🦩','🐬','🦖',
];

const EMOJIS_STORAGE_KEY = '@meco_account_emojis';

export default function WalletScreen() {
  const navigation   = useNavigation();
  const { t }        = useTranslation();
  const theme        = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';
  const insets       = useSafeAreaInsets(); // جلب أبعاد الحواف الآمنة

  const accounts           = useAppStore(state => state.accounts);
  const activeAccountIndex = useAppStore(state => state.activeAccountIndex);
  const switchAccount      = useAppStore(state => state.switchAccount);
  const addAccount         = useAppStore(state => state.addAccount);
  const renameAccount      = useAppStore(state => state.renameAccount);
  const deleteAccount      = useAppStore(state => state.deleteAccount);
  const walletPublicKey    = useAppStore(state => state.walletPublicKey);

  const colors = {
    background:    isDark ? '#07070F' : '#F4F5F9',
    card:          isDark ? '#111122' : '#FFFFFF',
    text:          isDark ? '#EEEEFF' : '#1C1C24',
    textSecondary: isDark ? '#7E7EAA' : '#8A8A9E',
    border:        isDark ? '#1E1E38' : '#E8E8F2',
    success:       '#10B981',
    error:         '#EF4444',
  };

  const [walletName,            setWalletName]            = useState('');
  const [walletAddress,         setWalletAddress]         = useState('');
  const [totalBalanceUSD,       setTotalBalanceUSD]       = useState(0);
  const [assets,                setAssets]                = useState([]);
  const [refreshing,            setRefreshing]            = useState(false);
  const [modalVisible,          setModalVisible]          = useState(false);
  const [tempWalletName,        setTempWalletName]        = useState('');
  const [loadingInitial,        setLoadingInitial]        = useState(true);
  const [isSwitchingAccount,    setIsSwitchingAccount]    = useState(false);
  const [editingAccountIndex,   setEditingAccountIndex]   = useState(null);
  const [accountsModalVisible,  setAccountsModalVisible]  = useState(false);
  const [addingAccount,         setAddingAccount]         = useState(false);
  const [accountUsdBalances,    setAccountUsdBalances]    = useState({});
  const [loadingAccountBalances,setLoadingAccountBalances]= useState(false);
  const [copyFeedback,          setCopyFeedback]          = useState(false);
  const [menuVisible,           setMenuVisible]           = useState(false);
  const [emojiPickerVisible,    setEmojiPickerVisible]    = useState(false);
  const [accountEmojis,         setAccountEmojis]         = useState({});

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const swipeableRefs        = useRef({});
  const accountSwipeableRefs = useRef({});

  useEffect(() => {
    AsyncStorage.getItem(EMOJIS_STORAGE_KEY)
      .then(stored => { if (stored) setAccountEmojis(JSON.parse(stored)); })
      .catch(() => {});
  }, []);

  const saveEmoji = async (publicKey, emoji) => {
    const updated = { ...accountEmojis, [publicKey]: emoji };
    setAccountEmojis(updated);
    await AsyncStorage.setItem(EMOJIS_STORAGE_KEY, JSON.stringify(updated));
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8,   useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8,   useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (accounts.length > 0 && activeAccountIndex < accounts.length) {
      const active = accounts[activeAccountIndex];
      setWalletName(active.name);
      setWalletAddress(active.publicKey);
    }
  }, [accounts, activeAccountIndex]);

  const loadWalletData = useCallback(async (publicKey) => {
    try {
      if (!publicKey) { setLoadingInitial(false); setIsSwitchingAccount(false); return; }
      setIsSwitchingAccount(true);
      const addr = typeof publicKey === 'string' ? publicKey : publicKey.toString();

      const [solBal, tokenAccounts, marketData, customTokensList] = await Promise.all([
        getSolBalance(true, addr).catch(() => 0),
        getTokenAccounts(addr).catch(() => []),
        getJupiterMarketData().catch(() => []),
        getCustomTokens().catch(() => []),
      ]);

      const priceMap = {};
      marketData.forEach(tk => { priceMap[tk.symbol] = tk.current_price || 0; });

      let calculatedTotalUSD = 0;

      const allAssets = CORE_TOKENS.map(asset => {
        let amount = 0;
        if (asset.symbol === 'SOL') {
          amount = solBal || 0;
        } else {
          const tokenData = tokenAccounts.find(tk => tk.mint === asset.mint);
          if (tokenData) amount = tokenData.amount || 0;
        }
        const price    = priceMap[asset.symbol] || 0;
        const valueUSD = amount * price;
        calculatedTotalUSD += valueUSD;
        return { ...asset, amount, price, valueUSD };
      });

      const filteredAssets = allAssets.filter(
        asset => asset.symbol === 'SOL' || asset.symbol === 'MECO' || asset.amount > 0
      );

      for (const customToken of customTokensList) {
        const tokenData = tokenAccounts.find(tk => tk.mint === customToken.mint);
        const amount    = tokenData?.amount || 0;
        if (amount > 0) {
          const price    = priceMap[customToken.symbol] || customToken.current_price || 0;
          const valueUSD = amount * price;
          calculatedTotalUSD += valueUSD;
          filteredAssets.push({ ...customToken, amount, price, valueUSD });
        }
      }

      filteredAssets.sort((a, b) => b.valueUSD - a.valueUSD);
      setAssets(filteredAssets);
      setTotalBalanceUSD(calculatedTotalUSD);
    } catch (error) {
      console.error('loadWalletData error:', error);
    } finally {
      setLoadingInitial(false);
      setIsSwitchingAccount(false);
    }
  }, []);

  useEffect(() => {
    if (walletPublicKey) loadWalletData(walletPublicKey);
  }, [walletPublicKey, loadWalletData]);

  const fetchAccountUsdBalances = useCallback(async () => {
    if (loadingAccountBalances) return;
    setLoadingAccountBalances(true);
    const balances = {};
    try {
      const marketData = await getJupiterMarketData().catch(() => []);
      const priceMap   = {};
      marketData.forEach(tk => { priceMap[tk.symbol] = tk.current_price || 0; });

      for (const acc of accounts) {
        try {
          if (acc.index === activeAccountIndex && totalBalanceUSD > 0) {
            balances[acc.publicKey] = totalBalanceUSD; continue;
          }
          const addr   = acc.publicKey;
          const solBal = await getSolBalance(true, addr).catch(() => 0) || 0;
          let mecoAmount = 0, usdcAmount = 0, usdtAmount = 0;
          try { mecoAmount = await getTokenBalance('7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i', true, addr); } catch (_) {}
          await new Promise(r => setTimeout(r, 200));
          try { usdcAmount = await getTokenBalance('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', true, addr); } catch (_) {}
          await new Promise(r => setTimeout(r, 200));
          try { usdtAmount = await getTokenBalance('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', true, addr); } catch (_) {}
          balances[acc.publicKey] =
            (solBal     * (priceMap['SOL']  || 0)) +
            (mecoAmount * (priceMap['MECO'] || 0)) +
            (usdcAmount * (priceMap['USDC'] || 0)) +
            (usdtAmount * (priceMap['USDT'] || 0));
        } catch (_) { balances[acc.publicKey] = 0; }
      }
    } catch (err) {
      console.error('fetchAccountUsdBalances error:', err);
    } finally {
      setAccountUsdBalances(balances);
      setLoadingAccountBalances(false);
    }
  }, [accounts, loadingAccountBalances, activeAccountIndex, totalBalanceUSD]);

  useEffect(() => {
    if (accountsModalVisible && accounts.length > 0) fetchAccountUsdBalances();
  }, [accountsModalVisible, accounts.length]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadWalletData(walletPublicKey);
    setRefreshing(false);
  };

  const copyAddress = async (addressToCopy = walletAddress) => {
    if (addressToCopy) {
      await Clipboard.setStringAsync(addressToCopy);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 600);
    }
  };

  const saveWalletName = async () => {
    if (tempWalletName.trim()) {
      const targetIndex = editingAccountIndex !== null ? editingAccountIndex : activeAccountIndex;
      await renameAccount(targetIndex, tempWalletName.trim());
      if (targetIndex === activeAccountIndex) setWalletName(tempWalletName.trim());
    }
    setModalVisible(false);
    setEditingAccountIndex(null);
  };

  const closeOtherSwipeables = (currentKey, refContainer) => {
    Object.keys(refContainer.current).forEach(key => {
      if (key !== String(currentKey) && refContainer.current[key]?.close) {
        refContainer.current[key].close();
      }
    });
  };

  const handleAddAccount = async () => {
    setAddingAccount(true);
    try {
      const newAccount = await addAccount(`${t('account')} ${accounts.length + 1}`);
      Alert.alert(t('success'), t('account_added', { name: newAccount.name }));
    } catch (_) {
      Alert.alert(t('error'), t('account_add_failed'));
    } finally { setAddingAccount(false); }
  };

  const handleSwitchAccount = async (index) => {
    if (index === activeAccountIndex) { setAccountsModalVisible(false); return; }
    setAccountsModalVisible(false);
    await switchAccount(index);
  };

  const handleDeleteAccount = (account) => {
    Alert.alert(
      t('delete_account'),
      t('delete_account_confirmation', { name: account.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: async () => await deleteAccount(account.index) },
      ]
    );
  };

  const authenticateWithPhonePasscode = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('passcode_prompt'), disableDeviceFallback: false, fallbackLabel: t('use_phone_passcode'),
      });
      return result.success;
    } catch (_) { return false; }
  };

  const handleExportPrivateKey = async (account) => {
    const authSuccess = await authenticateWithPhonePasscode();
    if (!authSuccess) { Alert.alert(t('error'), t('auth_failed')); return; }
    try {
      const privateKey = await useAppStore.getState().getPrivateKeyForAccount(account.index);
      if (!privateKey) { Alert.alert(t('error'), t('private_key_not_found')); return; }
      Alert.alert(
        t('key_warning_title'),
        t('key_warning_message', { key: privateKey }),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('copy_key'), onPress: () => { Clipboard.setStringAsync(privateKey); Alert.alert(t('success'), t('copied')); } },
        ]
      );
    } catch (_) { Alert.alert(t('error'), t('unexpected_error')); }
  };

  const activeAccount = accounts[activeAccountIndex];
  const activeEmoji   = activeAccount ? accountEmojis[activeAccount.publicKey] : null;

  const renderLeftActions = (progress, dragX, asset) => {
    const trans = dragX.interpolate({ inputRange: [0,50,100], outputRange: [-80,-40,0], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.leftAction, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity
          style={[styles.swipeActionBtn, { backgroundColor: primaryColor }]}
          onPress={() => { swipeableRefs.current[asset.symbol]?.close(); navigation.navigate('Swap', { fromToken: asset.symbol }); }}
        >
          <Ionicons name="swap-horizontal" size={20} color="#FFF" />
          <Text style={styles.swipeActionLabel}>{t('swap_title')}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRightActions = (progress, dragX, asset) => {
    const trans = dragX.interpolate({ inputRange: [-100,-50,0], outputRange: [0,40,80], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.rightAction, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity
          style={[styles.swipeActionBtn, { backgroundColor: colors.success }]}
          onPress={() => { swipeableRefs.current[asset.symbol]?.close(); navigation.navigate('Send', { preselectedToken: asset.symbol }); }}
        >
          <Ionicons name="paper-plane" size={20} color="#FFF" />
          <Text style={styles.swipeActionLabel}>{t('send')}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderAssetItem = ({ item, index }) => {
    return (
      <Animated.View style={[styles.assetItemWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }]}>
        <Swipeable
          ref={ref => (swipeableRefs.current[item.symbol] = ref)}
          friction={3} leftThreshold={60} rightThreshold={60}
          overshootLeft={false} overshootRight={false}
          renderLeftActions={(p,d)  => renderLeftActions(p,d,item)}
          renderRightActions={(p,d) => renderRightActions(p,d,item)}
          onSwipeableWillOpen={() => closeOtherSwipeables(item.symbol, swipeableRefs)}
        >
          <View style={[styles.assetItem, { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: index === assets.length - 1 ? 0 : 1 }]}>
            <View style={styles.assetLeft}>
              <View style={[styles.assetIconContainer, { backgroundColor: isDark ? '#171730' : '#ECECF4' }]}>
                <Image source={{ uri: item.image }} style={styles.assetIcon} />
                {item.symbol === 'SOL' && (
                  <View style={[styles.badgeDot, { backgroundColor: '#14F195', borderColor: colors.card }]} />
                )}
              </View>
              <View style={styles.assetInfo}>
                <Text style={[styles.assetSymbol, { color: colors.text }]}>{item.symbol}</Text>
                <Text style={[styles.assetName, { color: colors.textSecondary }]} numberOfLines={1}>{item.name}</Text>
              </View>
            </View>
            <View style={styles.assetRight}>
              <Text style={[styles.assetBalance, { color: colors.text }]}>
                {item.amount > 0 ? item.amount.toFixed(item.amount > 100 ? 2 : 4) : '0'}
              </Text>
              <Text style={[styles.assetValue, { color: colors.textSecondary }]}>
                {item.valueUSD > 0 ? `$${item.valueUSD.toFixed(2)}` : '$0.00'}
              </Text>
            </View>
            <View style={styles.assetChevron}>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
            </View>
          </View>
        </Swipeable>
      </Animated.View>
    );
  };

  const renderAccountLeftActions = (item) => {
    const isActive = item.index === activeAccountIndex;
    return (
      <View style={styles.accountActionContainer}>
        <TouchableOpacity
          style={[styles.accountActionBtn, { backgroundColor: '#6366F1', borderTopLeftRadius: 16, borderBottomLeftRadius: isActive ? 16 : 0 }]}
          onPress={() => {
            accountSwipeableRefs.current[item.index]?.close();
            setEditingAccountIndex(item.index);
            setTempWalletName(item.name);
            setAccountsModalVisible(false);
            setTimeout(() => setModalVisible(true), 300);
          }}
        >
          <Ionicons name="pencil" size={18} color="#FFF" />
          <Text style={styles.actionText}>{t('edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.accountActionBtn, { backgroundColor: '#F59E0B' }]}
          onPress={() => { accountSwipeableRefs.current[item.index]?.close(); handleExportPrivateKey(item); }}
        >
          <Ionicons name="key" size={18} color="#FFF" />
          <Text style={styles.actionText}>{t('export')}</Text>
        </TouchableOpacity>
        {!isActive && (
          <TouchableOpacity
            style={[styles.accountActionBtn, { backgroundColor: colors.error }]}
            onPress={() => { accountSwipeableRefs.current[item.index]?.close(); handleDeleteAccount(item); }}
          >
            <Ionicons name="trash" size={18} color="#FFF" />
            <Text style={styles.actionText}>{t('delete')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderAccountRightActions = (item) => (
    <View style={styles.accountActionContainer}>
      <TouchableOpacity
        style={[styles.accountActionBtn, { backgroundColor: colors.success, borderTopRightRadius: 16, borderBottomRightRadius: 16, width: 80 }]}
        onPress={() => { accountSwipeableRefs.current[item.index]?.close(); copyAddress(item.publicKey); }}
      >
        <Ionicons name="copy" size={18} color="#FFF" />
        <Text style={styles.actionText}>{t('copy')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAccountItem = ({ item }) => {
    const isActive   = item.index === activeAccountIndex;
    const usdBalance = accountUsdBalances[item.publicKey];
    const isLoading  = loadingAccountBalances && usdBalance === undefined;
    const emoji      = accountEmojis[item.publicKey];
    return (
      <View style={{ marginBottom: 8 }}>
        <Swipeable
          ref={ref => (accountSwipeableRefs.current[item.index] = ref)}
          friction={2} leftThreshold={40} rightThreshold={40}
          overshootLeft={false} overshootRight={false}
          renderLeftActions={() => renderAccountLeftActions(item)}
          renderRightActions={() => renderAccountRightActions(item)}
          onSwipeableWillOpen={() => closeOtherSwipeables(item.index, accountSwipeableRefs)}
        >
          <TouchableOpacity
            style={[styles.accountItem, { backgroundColor: colors.card }]}
            activeOpacity={0.7}
            onPress={() => handleSwitchAccount(item.index)}
          >
            <View style={styles.accountInfo}>
              <View style={[styles.accountAvatar, { backgroundColor: isActive ? primaryColor + '30' : primaryColor + '15' }]}>
                <Text style={emoji ? styles.accountAvatarEmoji : [styles.accountAvatarText, { color: primaryColor }]}>
                  {emoji || item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.accountName,    { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.accountAddress, { color: colors.textSecondary }]}>
                  {item.publicKey.slice(0,6)}...{item.publicKey.slice(-4)}
                </Text>
              </View>
            </View>
            <View style={styles.accountBalanceContainer}>
              {isActive && <Ionicons name="checkmark-circle" size={18} color={primaryColor} style={{ marginRight: 8 }} />}
              {isLoading
                ? <ActivityIndicator size="small" color={primaryColor} />
                : <Text style={[styles.accountBalance, { color: colors.text }]}>
                    ${usdBalance?.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) || '0.00'}
                  </Text>
              }
            </View>
          </TouchableOpacity>
        </Swipeable>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>

        {/* ✅ حل مشكلة التداخل: دفع البطاقة بالكامل أسفل منطقة الـ Status Bar */}
        <View style={{ height: Platform.OS === 'ios' ? insets.top : insets.top + 12 }} />

        {/* ── البطاقة العلوية المغلقة والعائمة باحترافية (Solflare Style Floating Card) ── */}
        <Animated.View style={[styles.headerCard, { 
          backgroundColor: colors.card, 
          opacity: fadeAnim, 
          transform: [{ translateY: slideAnim }], 
          borderColor: colors.border, 
          borderWidth: 1, 
          // تم إغلاق البطاقة بتدوير الحواف الأربعة بالكامل وإلغاء التداخل مع أشرطة الهاتف
          borderRadius: 24,
          marginHorizontal: 20,
          paddingTop: 18
        }]}>
          <View style={styles.topBar}>
            <View style={styles.walletInfoRow}>
              <TouchableOpacity
                onPress={() => setAccountsModalVisible(true)}
                style={[styles.walletIconWrapper, { backgroundColor: primaryColor + '15', borderColor: colors.border, borderWidth: 1 }]}
                activeOpacity={0.7}
              >
                {activeEmoji
                  ? <Text style={styles.walletIconEmoji}>{activeEmoji}</Text>
                  : <Ionicons name="wallet-outline" size={20} color={primaryColor} />
                }
              </TouchableOpacity>
              <View style={{ alignItems:'flex-start' }}>
                <View style={styles.walletNameRow}>
                  <Text style={[styles.walletName, { color: colors.text }]}>{walletName}</Text>
                  <TouchableOpacity onPress={() => copyAddress()} style={styles.inlineCopyBtn}>
                    <Ionicons
                      name={copyFeedback ? 'checkmark-circle' : 'copy-outline'}
                      size={14}
                      color={copyFeedback ? colors.success : primaryColor}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.accountsCount, { color: colors.textSecondary }]}>
                  {walletAddress.slice(0,6)}...{walletAddress.slice(-4)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              style={[styles.dotsButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
            >
              <Ionicons name="ellipsis-vertical" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.balanceSection}>
            <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('total_balance')}</Text>
            {loadingInitial || isSwitchingAccount ? (
              <View style={styles.loadingBalance}><ActivityIndicator color={primaryColor} /></View>
            ) : (
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Text style={[styles.balanceAmount, { color: colors.text }]}>
                  ${totalBalanceUSD.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}
                </Text>
              </Animated.View>
            )}
          </View>
        </Animated.View>

        {/* ── أزرار العمليات الأربعة الدائرية العائمة عريضة النسق عائمة بالأسفل ── */}
        <View style={styles.actionsGrid}>
          {[
            { icon:'arrow-up',        color:colors.success, screen:'Send',    label:t('send')              },
            { icon:'arrow-down',      color:'#6366F1',      screen:'Receive', label:t('receive')           },
            { icon:'swap-horizontal', color:'#F59E0B',      screen:'Swap',    label:t('swap_title')        },
            { icon:'trending-up',     color:'#EC4899',      screen:'Staking', label:t('staking.stake_tab') },
          ].map(btn => (
            <TouchableOpacity key={btn.screen} style={styles.actionBtn} onPress={() => navigation.navigate(btn.screen)}>
              <View style={[styles.actionCircle, { backgroundColor: btn.color + '12' }]}>
                <Ionicons name={btn.icon} size={22} color={btn.color} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Assets List */}
        <View style={styles.assetsSection}>
          <View style={styles.assetsHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('wallet_your_assets')}</Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={18} color={primaryColor} />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={assets}
            renderItem={renderAssetItem}
            keyExtractor={item => item.mint || item.symbol}
            contentContainerStyle={[styles.listContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} colors={[primaryColor]} />}
            ListEmptyComponent={(!loadingInitial && !isSwitchingAccount) && (
              <View style={styles.emptyContainer}>
                <Ionicons name="wallet-outline" size={36} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('loading_market_data')}</Text>
              </View>
            )}
          />
        </View>

        {/* ── قائمة الخيارات (Modal Menu) ── */}
        <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
            <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>

              {/* الإعدادات */}
              <TouchableOpacity
                style={[styles.menuItem, { borderBottomColor: colors.border }]}
                onPress={() => { setMenuVisible(false); navigation.navigate('Settings'); }}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: primaryColor + '15' }]}>
                  <Ionicons name="settings-outline" size={18} color={primaryColor} />
                </View>
                <Text style={[styles.menuItemText, { color: colors.text }]}>{t('settings')}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
              </TouchableOpacity>

              {/* تغيير الاسم */}
              <TouchableOpacity
                style={[styles.menuItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setMenuVisible(false);
                  setEditingAccountIndex(activeAccountIndex);
                  setTempWalletName(walletName);
                  setTimeout(() => setModalVisible(true), 200);
                }}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: 'rgba(99,102,241,0.15)' }]}>
                  <Ionicons name="pencil" size={18} color="#6366F1" />
                </View>
                <Text style={[styles.menuItemText, { color: colors.text }]}>{t('edit_wallet_name')}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
              </TouchableOpacity>

              {/* اختيار إيموجي */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setMenuVisible(false); setTimeout(() => setEmojiPickerVisible(true), 200); }}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: primaryColor + '15' }]}>
                  <Text style={{ fontSize: 18 }}>🎨</Text>
                </View>
                <Text style={[styles.menuItemText, { color: colors.text }]}>{t('change')}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
              </TouchableOpacity>

            </View>
          </TouchableOpacity>
        </Modal>

        {/* منتقي الإيموجي (Bottom Sheet) */}
        <Modal visible={emojiPickerVisible} transparent animationType="slide" onRequestClose={() => setEmojiPickerVisible(false)}>
          <View style={styles.modalOverlayBottom}>
            <View style={[styles.emojiPickerContent, { backgroundColor: colors.card }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={styles.emojiPickerHeader}>
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>🎨 {t('change')}</Text>
                <TouchableOpacity onPress={() => setEmojiPickerVisible(false)} style={[styles.closeBtn, { backgroundColor: colors.background }]}>
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
              {activeAccount && accountEmojis[activeAccount.publicKey] && (
                <TouchableOpacity
                  style={[styles.removeEmojiBtn, { borderColor: colors.error + '30' }]}
                  onPress={async () => {
                    if (activeAccount) {
                      const updated = { ...accountEmojis };
                      delete updated[activeAccount.publicKey];
                      setAccountEmojis(updated);
                      await AsyncStorage.setItem(EMOJIS_STORAGE_KEY, JSON.stringify(updated));
                    }
                    setEmojiPickerVisible(false);
                  }}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.error} />
                  <Text style={[styles.removeEmojiText, { color: colors.error }]}>{t('delete')}</Text>
                </TouchableOpacity>
              )}
              <FlatList
                data={ACCOUNT_EMOJIS}
                numColumns={8}
                keyExtractor={(item, index) => index.toString()}
                contentContainerStyle={styles.emojiGrid}
                renderItem={({ item }) => {
                  const isSelected = activeAccount && accountEmojis[activeAccount.publicKey] === item;
                  return (
                    <TouchableOpacity
                      style={[styles.emojiItem, isSelected && { backgroundColor: primaryColor + '20', borderRadius: 12 }]}
                      onPress={async () => {
                        if (activeAccount) await saveEmoji(activeAccount.publicKey, item);
                        setEmojiPickerVisible(false);
                      }}
                    >
                      <Text style={styles.emojiText}>{item}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </Modal>

        {/* تعديل الاسم (Modal Input) */}
        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => { setModalVisible(false); setEditingAccountIndex(null); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={styles.modalHeader}>
                <Ionicons name="create-outline" size={24} color={primaryColor} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('edit_wallet_name')}</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, paddingVertical: 0 }]}
                value={tempWalletName} onChangeText={setTempWalletName}
                autoFocus placeholder={t('enter_wallet_name')} placeholderTextColor={colors.textSecondary}
                autoCorrect={false}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalBtn, { borderColor: colors.border }]} onPress={() => { setModalVisible(false); setEditingAccountIndex(null); }}>
                  <Text style={{ color: colors.text }}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnPrimary, { backgroundColor: primaryColor }]} onPress={saveWalletName}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t('save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* منتقي الحسابات المطور (Bottom Sheet) */}
        <Modal visible={accountsModalVisible} transparent animationType="slide" onRequestClose={() => setAccountsModalVisible(false)}>
          <View style={styles.modalOverlayBottom}>
            <View style={[styles.accountsModalContent, { backgroundColor: colors.card }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={styles.accountsModalHeader}>
                <View style={styles.accountsHeaderLeft}>
                  <Ionicons name="layers" size={20} color={primaryColor} />
                  <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>{t('accounts')}</Text>
                </View>
                <TouchableOpacity onPress={() => setAccountsModalVisible(false)} style={[styles.closeBtn, { backgroundColor: colors.background }]}>
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={{ textAlign:'center', fontSize:11, color:colors.textSecondary, marginBottom:16 }}>
                {t('swipe_hint')}
              </Text>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <FlatList
                  data={accounts} renderItem={renderAccountItem}
                  keyExtractor={item => item.index.toString()}
                  style={{ flex:1 }} contentContainerStyle={{ paddingBottom:8 }}
                  showsVerticalScrollIndicator={false}
                />
              </GestureHandlerRootView>
              <View style={styles.addAccountButtons}>
                <TouchableOpacity style={[styles.addAccountBtn, { borderColor: primaryColor }]} onPress={handleAddAccount} disabled={addingAccount}>
                  {addingAccount
                    ? <ActivityIndicator size="small" color={primaryColor} />
                    : <><Ionicons name="add-circle" size={20} color={primaryColor} /><Text style={[styles.addAccountText, { color: primaryColor }]}>{t('add_account')}</Text></>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addAccountBtn, { borderColor: primaryColor }]}
                  onPress={() => { setAccountsModalVisible(false); navigation.navigate('ImportPrivateKey'); }}
                >
                  <Ionicons name="key" size={20} color={primaryColor} />
                  <Text style={[styles.addAccountText, { color: primaryColor }]}>{t('import_private_key.title')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container:    { flex:1 },
  headerCard:   { borderBottomLeftRadius:28, borderBottomRightRadius:28, paddingHorizontal:20, paddingBottom:20, elevation:4, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.04, shadowRadius:10, zIndex:10, borderWidth: 1 },
  topBar:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:18 },
  walletInfoRow:{ flexDirection:'row', alignItems:'center', gap:10 },
  walletIconWrapper: { width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center', borderWidth: 1 },
  walletIconEmoji:   { fontSize:22 },
  walletNameRow:{ flexDirection:'row', alignItems:'center', gap:4 },
  walletName:   { fontSize:18, fontWeight:'800' },
  inlineCopyBtn:{ padding:4 },
  accountsCount:{ fontSize:11, fontWeight:'500', marginTop:2 },
  dotsButton:   { width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center', borderWidth: 1 },
  balanceSection:{ alignItems:'center' },
  balanceLabel: { fontSize:13, fontWeight:'500', marginBottom:6 },
  balanceAmount:{ fontSize:36, fontWeight:'800', letterSpacing:-0.5 },
  loadingBalance:{ height:40, justifyContent:'center' },
  
  // شريط الأزرار الأربعة العائمة الدائرية بقطر كامل وتنسيق رائع
  actionsGrid:  { flexDirection:'row', justifyContent:'space-around', width: '100%', paddingHorizontal: 4, marginTop: 16, marginBottom: 12 },
  actionBtn:    { alignItems:'center', gap:6, flex: 1 },
  actionCircle: { width:48, height:48, borderRadius:24, justifyContent:'center', alignItems:'center', shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.05, shadowRadius:6, elevation:2 },
  actionLabel:  { fontSize:12, fontWeight:'600' },
  
  assetsSection:{ flex:1, paddingHorizontal:20, paddingTop:8 },
  assetsHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  sectionTitle: { fontSize:16, fontWeight:'800' },
  refreshBtn:   { width:36, height:36, borderRadius:12, justifyContent:'center', alignItems:'center' },
  listContainer:{ borderRadius:18, borderWidth:1, overflow:'hidden', paddingVertical:4 },
  assetItemWrapper:{},
  assetItem:    { flexDirection:'row', alignItems:'center', padding:12, borderBottomWidth:1 },
  assetLeft:    { flexDirection:'row', alignItems:'center', flex:1, gap:10 },
  assetIcon:   { width:36, height:36, borderRadius:18, justifyContent:'center', alignItems:'center' },
  tokenIconImg: { width:36, height:36, borderRadius:18 },
  tokenIconTxt: { fontSize:14, fontWeight:'bold' },
  assetInfo:   { flex:1 },
  assetSym:    { fontSize:14, fontWeight:'700' },
  assetAmt:    { fontSize:11, marginTop:2 },
  assetRight:  { alignItems:'flex-end' },
  assetUSD:    { fontSize:14, fontWeight:'700' },
  pnlRow:      { flexDirection:'row', alignItems:'center', gap:2, marginTop:2 },
  pnlText:     { fontSize:11, fontWeight:'600' },
  pnlUSD:      { fontSize:10 },
  badgeDot:     { position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:5, borderWidth:2 },
  leftAction:   { justifyContent:'center' },
  rightAction:  { justifyContent:'center' },
  swipeActionBtn:{ width:80, height:'100%', justifyContent:'center', alignItems:'center' },
  swipeActionLabel:{ color:'#FFF', fontSize:11, fontWeight:'600', marginTop:4 },
  emptyContainer:{ alignItems:'center', paddingVertical:50, gap:8 },
  emptyText:    { fontSize:13, marginTop:4 },
  
  menuOverlay:  { flex:1, backgroundColor:'rgba(0,0,0,0.2)', justifyContent:'flex-start', alignItems:'flex-end', paddingTop:Platform.OS==='ios'?100:80, paddingRight:20 },
  menuCard:     { width:210, borderRadius:16, overflow:'hidden', elevation:10, shadowOffset:{width:0,height:4}, shadowOpacity:0.1, shadowRadius:10 },
  menuItem:     { flexDirection:'row', alignItems:'center', padding:12, borderBottomWidth:1, gap:10 },
  menuItemIcon: { width:34, height:34, borderRadius:10, justifyContent:'center', alignItems:'center' },
  menuItemText: { flex:1, fontSize:14, fontWeight:'600' },
  emojiPickerContent:{ borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingTop:12, maxHeight:height*0.55 },
  emojiPickerHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  emojiGrid:    { paddingBottom:16 },
  emojiItem:    { flex:1, aspectRatio:1, justifyContent:'center', alignItems:'center', margin:4 },
  emojiText:    { fontSize:26 },
  removeEmojiBtn:{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:8, borderRadius:10, borderWidth:1, marginBottom:12 },
  removeEmojiText:{ fontSize:13, fontWeight:'600' },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center', padding:20 },
  modalOverlayBottom:{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end', padding:20 },
  modalContent: { width:'100%', padding:20, borderRadius:20, alignItems:'center' },
  modalHeader:  { marginBottom:12 },
  modalTitle:   { fontSize:18, fontWeight:'bold', marginBottom:16, textAlign:'center' },
  input:        { width:'100%', borderWidth:1.5, borderRadius:12, padding:12, fontSize:15, marginBottom:16, textAlign:'center', height:46 },
  modalButtons: { flexDirection:'row', gap:10, width:'100%' },
  modalBtn:     { flex:1, padding:14, borderRadius:12, alignItems:'center', borderWidth:1.5 },
  modalBtnPrimary:{ flex:1, padding:14, borderRadius:12, alignItems:'center' },
  accountsModalContent:{ width:'100%', maxHeight:height*0.8, padding:20, paddingTop:12, borderTopLeftRadius:24, borderTopRightRadius:24, flex:1 },
  modalHandle:  { width:36, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  accountsModalHeader:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  accountsHeaderLeft: { flexDirection:'row', alignItems:'center', gap:8 },
  closeBtn:     { width:36, height:36, borderRadius:10, justifyContent:'center', alignItems:'center' },
  accountItem:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:12, paddingHorizontal:12, borderRadius:14 },
  accountActionContainer:{ flexDirection:'row', height:'100%' },
  accountActionBtn:{ justifyContent:'center', alignItems:'center', width:80, height:'100%' },
  accountInfo:  { flexDirection:'row', alignItems:'center', flex:1, gap:10 },
  accountAvatar:{ width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center' },
  accountAvatarEmoji:{ fontSize:22 },
  accountAvatarText: { fontSize:18, fontWeight:'800' },
  accountName:  { fontSize:14, fontWeight:'600', marginBottom:2 },
  accountAddress:{ fontSize:11 },
  accountBalanceContainer:{ flexDirection:'row', alignItems:'center' },
  accountBalance:{ fontSize:14, fontWeight:'600' },
  addAccountButtons:{ gap:6, marginTop:12, paddingTop:12, borderTopWidth:1, borderTopColor:'rgba(128,128,128,0.15)' },
  addAccountBtn:{ flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:14, borderWidth:1.5, borderRadius:14, gap:8, marginBottom:2 },
  addAccountText:{ fontSize:14, fontWeight:'600' },
  actionText:   { color:'#FFF', fontSize:11, fontWeight:'600', marginTop:4 },
});
