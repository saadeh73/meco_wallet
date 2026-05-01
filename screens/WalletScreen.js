import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  RefreshControl, TextInput, Modal, Dimensions, Animated,
  FlatList, Image, ActivityIndicator, Platform, KeyboardAvoidingView
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { getSolBalance, getTokenAccounts, getTokenMarketPrice } from '../services/heliusService';
import { CORE_TOKENS } from '../services/jupiterMarketService';

const { width, height } = Dimensions.get('window');

// 1. دالة الإيقاف المؤقت
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 2. ★★★ الخوارزمية الجديدة: المحاولة المتكررة لتجاوز حظر السيرفر ★★★
const fetchWithRetry = async (apiCall, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await apiCall();
      return result;
    } catch (error) {
      if (i === retries - 1) throw error; // إذا فشل في آخر محاولة، ارمِ الخطأ
      await sleep(delay); // انتظر ثانية ثم أعد المحاولة
    }
  }
};

export default function WalletScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const accounts = useAppStore(state => state.accounts);
  const activeAccountIndex = useAppStore(state => state.activeAccountIndex);
  const switchAccount = useAppStore(state => state.switchAccount);
  const addAccount = useAppStore(state => state.addAccount);
  const renameAccount = useAppStore(state => state.renameAccount);
  const deleteAccount = useAppStore(state => state.deleteAccount);

  const walletPublicKey = useAppStore(state => state.walletPublicKey);

  const colors = {
    background: isDark ? '#0A0A0F' : '#F2F3F7',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#8E8E93',
    border: isDark ? '#2A2A3E' : '#E5E5EA',
    success: '#4CAF50',
    error: '#FF3B30'
  };

  const [walletName, setWalletName] = useState(t('my_wallet') || 'My Wallet');
  const [walletAddress, setWalletAddress] = useState('');
  const [totalBalanceUSD, setTotalBalanceUSD] = useState(0);
  const [assets, setAssets] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [tempWalletName, setTempWalletName] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [editingAccountIndex, setEditingAccountIndex] = useState(null);

  const [accountsModalVisible, setAccountsModalVisible] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);

  const [accountUsdBalances, setAccountUsdBalances] = useState({});
  const [loadingAccountBalances, setLoadingAccountBalances] = useState(false);

  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(30))[0];
  const swipeableRefs = useRef({});
  const accountSwipeableRefs = useRef({});

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 6, useNativeDriver: true }),
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
      if (!publicKey) {
        setLoadingInitial(false);
        setIsSwitchingAccount(false);
        return;
      }

      setIsSwitchingAccount(true);
      // تأمين العنوان كـ String نقي لتجنب أي أخطاء في الـ API
      const addr = String(publicKey).trim();

      // ★★★ استخدام fetchWithRetry هنا لضمان عدم فشل جلب الرصيد ★★★
      const solBal = await fetchWithRetry(() => getSolBalance(true, addr)).catch(() => 0) || 0;
      const tokenAccounts = await fetchWithRetry(() => getTokenAccounts(addr)).catch(() => []) || [];

      let calculatedTotalUSD = 0;
      
      const allAssetsPromise = await Promise.all(CORE_TOKENS.map(async (asset) => {
        let amount = 0;
        if (asset.symbol === 'SOL') {
          amount = solBal;
        } else {
          const tokenData = tokenAccounts.find(t => t.mint === asset.mint);
          if (tokenData) amount = tokenData.amount;
        }

        let price = 0;
        try {
          if (getTokenMarketPrice) {
             price = await fetchWithRetry(() => getTokenMarketPrice(asset.symbol), 2, 500) || 0;
          }
        } catch (priceError) {
          console.warn(`Could not fetch price for ${asset.symbol}`);
        }

        const valueUSD = amount * price;
        calculatedTotalUSD += valueUSD;
        return { ...asset, amount, price, valueUSD };
      }));

      const filteredAssets = allAssetsPromise.filter(asset => asset.symbol === 'SOL' || asset.symbol === 'MECO' || asset.amount > 0);
      filteredAssets.sort((a, b) => b.valueUSD - a.valueUSD);

      setAssets(filteredAssets);
      setTotalBalanceUSD(calculatedTotalUSD);
      
      // مزامنة رصيد الحساب النشط مع قائمة الحسابات فوراً
      setAccountUsdBalances(prev => ({ ...prev, [addr]: calculatedTotalUSD }));

    } catch (error) {
      console.error("Error in loadWalletData:", error); 
    } finally {
      setLoadingInitial(false);
      setIsSwitchingAccount(false);
    }
  }, []);

  useEffect(() => {
    if (walletPublicKey) loadWalletData(walletPublicKey);
  }, [walletPublicKey, loadWalletData]);

  const fetchAccountUsdBalances = useCallback(async () => {
    setLoadingAccountBalances(true);
    const balances = { ...accountUsdBalances }; // الاحتفاظ بالأرصدة السابقة لتجنب تحميلها مجدداً
    
    try {
      const prices = {
        SOL: await fetchWithRetry(() => getTokenMarketPrice('SOL'), 2).catch(() => 0) || 0,
        MECO: await fetchWithRetry(() => getTokenMarketPrice('MECO'), 2).catch(() => 0) || 0,
        USDT: await fetchWithRetry(() => getTokenMarketPrice('USDT'), 2).catch(() => 0) || 0,
        USDC: await fetchWithRetry(() => getTokenMarketPrice('USDC'), 2).catch(() => 0) || 0,
      };

      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const addr = String(acc.publicKey).trim(); // تنظيف العنوان

        try {
          // تخطي الحساب النشط (تم جلبه) وتخطي الحسابات التي جلبناها مسبقاً في نفس الجلسة
          if (acc.index === activeAccountIndex && totalBalanceUSD > 0) {
            balances[addr] = totalBalanceUSD;
            continue; 
          }
          if (balances[addr] && balances[addr] > 0) {
            continue; // الرصيد موجود بالفعل!
          }

          if (i > 0) await sleep(800); // إبطاء الطلبات بقوة لإرضاء سيرفرات Helius

          // استخدام fetchWithRetry لضمان جلب الرصيد الحقيقي وعدم السقوط كـ 0
          const solBal = await fetchWithRetry(() => getSolBalance(true, addr)).catch(() => 0) || 0;
          const tokenAccounts = await fetchWithRetry(() => getTokenAccounts(addr)).catch(() => []) || [];
          
          let accUsd = solBal * prices.SOL;
          
          for (const token of tokenAccounts) {
            let price = 0;
            if (token.mint === '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i') price = prices.MECO;
            else if (token.mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') price = prices.USDT;
            else if (token.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') price = prices.USDC;
            
            accUsd += (token.amount || 0) * price;
          }
          
          balances[addr] = accUsd;
          setAccountUsdBalances(prev => ({ ...prev, [addr]: accUsd }));

        } catch (accountError) {
          balances[addr] = balances[addr] || 0; // إذا فشل، حافظ على قيمته القديمة ولا تصفرها
        }
      }
    } catch (globalError) {
      console.error("Global error in fetchAccountUsdBalances:", globalError);
    } finally {
      setLoadingAccountBalances(false);
    }
    
  }, [accounts, activeAccountIndex, totalBalanceUSD, accountUsdBalances]);

  useEffect(() => {
    if (accountsModalVisible && accounts.length > 0) {
      fetchAccountUsdBalances();
    }
  }, [accountsModalVisible, accounts.length, fetchAccountUsdBalances]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadWalletData(walletPublicKey);
    setRefreshing(false);
  };

  const copyAddress = async (addressToCopy = walletAddress) => {
    if (addressToCopy) {
      await Clipboard.setStringAsync(addressToCopy);
      Alert.alert(t('success'), t('wallet_address_copied', 'تم نسخ العنوان بنجاح'));
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
      const newAccount = await addAccount(`الحساب ${accounts.length + 1}`);
      Alert.alert(t('success'), t('account_added', { name: newAccount.name }));
    } catch (error) {
      Alert.alert(t('error'), t('account_add_failed'));
    } finally {
      setAddingAccount(false);
    }
  };

  const handleSwitchAccount = async (index) => {
    if (index === activeAccountIndex) {
      setAccountsModalVisible(false);
      return;
    }
    setAccountsModalVisible(false);
    await switchAccount(index);
  };

  const handleDeleteAccount = (account) => {
    Alert.alert(
      t('delete_account'),
      t('delete_account_confirmation', { name: account.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: async () => await deleteAccount(account.index) }
      ]
    );
  };

  const renderRightActions = (asset) => (
    <TouchableOpacity style={[styles.rightAction, { backgroundColor: primaryColor }]} onPress={() => navigation.navigate('Send', { preselectedToken: asset.symbol })}>
      <Ionicons name="paper-plane-outline" size={24} color="#FFF" />
      <Text style={styles.actionText}>{t('send')}</Text>
    </TouchableOpacity>
  );

  const renderLeftActions = (asset) => (
    <TouchableOpacity style={[styles.leftAction, { backgroundColor: primaryColor + 'CC' }]} onPress={() => navigation.navigate('Swap', { fromToken: asset.symbol })}>
      <Ionicons name="swap-horizontal-outline" size={24} color="#FFF" />
      <Text style={styles.actionText}>{t('swap_title')}</Text>
    </TouchableOpacity>
  );

  const renderAssetItem = ({ item }) => (
    <Swipeable
      ref={ref => (swipeableRefs.current[item.symbol] = ref)}
      friction={2}
      leftThreshold={40} rightThreshold={40}
      renderLeftActions={() => renderLeftActions(item)}
      renderRightActions={() => renderRightActions(item)}
      onSwipeableWillOpen={() => closeOtherSwipeables(item.symbol, swipeableRefs)}
    >
      <TouchableOpacity style={[styles.assetItem, { backgroundColor: colors.card }]} activeOpacity={0.7}>
        <View style={styles.assetLeft}>
          <Image source={{ uri: item.image }} style={styles.assetIcon} defaultSource={null} />
          <View>
            <Text style={[styles.assetSymbol, { color: colors.text }]}>{item.symbol}</Text>
            <Text style={[styles.assetName, { color: colors.textSecondary }]}>{item.name}</Text>
          </View>
        </View>
        <View style={styles.assetRight}>
          <Text style={[styles.assetBalance, { color: colors.text }]}>{item.amount > 0 ? item.amount.toFixed(4) : '0'}</Text>
          <Text style={[styles.assetValue, { color: colors.textSecondary }]}>
            ${item.valueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  const renderAccountLeftActions = (item) => {
    const isActive = item.index === activeAccountIndex;
    return (
      <View style={styles.accountActionContainer}>
        <TouchableOpacity
          style={[styles.accountActionBtn, { backgroundColor: primaryColor, borderTopLeftRadius: 16, borderBottomLeftRadius: isActive ? 16 : 0 }]}
          onPress={() => {
            if (accountSwipeableRefs.current[item.index]?.close) accountSwipeableRefs.current[item.index].close();
            setEditingAccountIndex(item.index);
            setTempWalletName(item.name);
            setAccountsModalVisible(false);
            setTimeout(() => setModalVisible(true), 300);
          }}
        >
          <Ionicons name="pencil-outline" size={22} color="#FFF" />
          <Text style={styles.actionText}>{t('edit', 'تعديل')}</Text>
        </TouchableOpacity>

        {!isActive && (
          <TouchableOpacity
            style={[styles.accountActionBtn, { backgroundColor: colors.error, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
            onPress={() => {
              if (accountSwipeableRefs.current[item.index]?.close) accountSwipeableRefs.current[item.index].close();
              handleDeleteAccount(item);
            }}
          >
            <Ionicons name="trash-outline" size={22} color="#FFF" />
            <Text style={styles.actionText}>{t('delete', 'حذف')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderAccountRightActions = (item) => (
    <View style={styles.accountActionContainer}>
      <TouchableOpacity
        style={[styles.accountActionBtn, { backgroundColor: colors.success, borderTopRightRadius: 16, borderBottomRightRadius: 16, width: 80 }]}
        onPress={() => {
          if (accountSwipeableRefs.current[item.index]?.close) accountSwipeableRefs.current[item.index].close();
          copyAddress(item.publicKey);
        }}
      >
        <Ionicons name="copy-outline" size={22} color="#FFF" />
        <Text style={styles.actionText}>{t('copy', 'نسخ')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAccountItem = ({ item }) => {
    const isActive = item.index === activeAccountIndex;
    const usdBalance = accountUsdBalances[item.publicKey];
    const isLoading = loadingAccountBalances && usdBalance === undefined;

    return (
      <View style={{ marginBottom: 8 }}>
        <Swipeable
          ref={ref => (accountSwipeableRefs.current[item.index] = ref)}
          friction={2}
          leftThreshold={40}
          rightThreshold={40}
          overshootLeft={false}
          overshootRight={false}
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
              <View style={[styles.accountAvatar, { backgroundColor: primaryColor + '20' }]}>
                <Text style={[styles.accountAvatarText, { color: primaryColor }]}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.accountName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.accountAddress, { color: colors.textSecondary }]}>
                  {item.publicKey.slice(0, 6)}...{item.publicKey.slice(-4)}
                </Text>
              </View>
            </View>

            <View style={styles.accountBalanceContainer}>
              {isLoading ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <Text style={[styles.accountBalance, { color: colors.text }]}>
                  ${usdBalance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                </Text>
              )}
              {isActive && <Ionicons name="checkmark-circle" size={20} color={primaryColor} style={{ marginLeft: 8 }} />}
            </View>
          </TouchableOpacity>
        </Swipeable>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.headerSection, { backgroundColor: colors.card, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.topBar}>
            <View style={styles.walletInfo}>
              <Text style={[styles.walletName, { color: colors.text }]}>{walletName}</Text>
              <TouchableOpacity onPress={() => setAccountsModalVisible(true)} style={styles.accountsButton}>
                <Ionicons name="layers-outline" size={18} color={primaryColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.headerIcons}>
              <TouchableOpacity onPress={() => copyAddress()} style={[styles.iconBtn, { backgroundColor: isDark ? '#2A2A3E' : '#F2F2F7' }]}>
                <Ionicons name="copy-outline" size={20} color={primaryColor} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.balanceContainer}>
            <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('total_balance')}</Text>
            {loadingInitial || isSwitchingAccount ? (
              <ActivityIndicator color={primaryColor} size="large" style={{ marginTop: 10, height: 40 }} />
            ) : (
              <Text style={[styles.balanceAmount, { color: colors.text }]}>
                ${totalBalanceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            )}
          </View>
          <View style={styles.actionsRow}>
            <ActionButton icon="arrow-up" label={t('send')} onPress={() => navigation.navigate('Send')} colors={colors} primary={primaryColor} />
            <ActionButton icon="arrow-down" label={t('receive')} onPress={() => navigation.navigate('Receive')} colors={colors} primary={primaryColor} />
            <ActionButton icon="swap-horizontal" label={t('swap_title')} onPress={() => navigation.navigate('Swap')} colors={colors} primary={primaryColor} />
            <ActionButton icon="leaf" label={t('staking.stake_tab')} onPress={() => navigation.navigate('Staking')} colors={colors} primary={primaryColor} />
          </View>
        </Animated.View>

        <View style={styles.listContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('market_all_coins', 'الأصول')}</Text>
          <FlatList
            data={assets}
            renderItem={renderAssetItem}
            keyExtractor={item => item.symbol}
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
            ListEmptyComponent={(!loadingInitial && !isSwitchingAccount) && (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('loading_market_data')}</Text>
              </View>
            )}
          />
        </View>

        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => { setModalVisible(false); setEditingAccountIndex(null); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('edit_wallet_name')}</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} value={tempWalletName} onChangeText={setTempWalletName} autoFocus />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalBtn, { borderColor: colors.border }]} onPress={() => { setModalVisible(false); setEditingAccountIndex(null); }}><Text style={{ color: colors.text }}>{t('cancel')}</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={saveWalletName}><Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t('save')}</Text></TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* نافذة الحسابات */}
        <Modal visible={accountsModalVisible} transparent animationType="slide" onRequestClose={() => setAccountsModalVisible(false)}>
          <View style={styles.modalOverlayBottom}>
            <View style={[styles.accountsModalContent, { backgroundColor: colors.card }]}>
              <View style={styles.accountsModalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>{t('accounts', 'الحسابات')}</Text>
                <TouchableOpacity onPress={() => setAccountsModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={{ textAlign: 'center', fontSize: 12, color: colors.textSecondary, marginBottom: 15 }}>
                {t('swipe_hint', 'اسحب لليمين للتعديل، ولليسار لنسخ العنوان')}
              </Text>

              <GestureHandlerRootView style={{ flex: 1 }}>
                <FlatList
                  data={accounts}
                  renderItem={renderAccountItem}
                  keyExtractor={(item) => item.index.toString()}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator={false}
                />
              </GestureHandlerRootView>

              <TouchableOpacity
                style={[styles.addAccountButton, { borderColor: primaryColor, marginTop: 8, marginBottom: Platform.OS === 'ios' ? 10 : 0 }]}
                onPress={handleAddAccount}
                disabled={addingAccount}
              >
                {addingAccount ?
                  <ActivityIndicator size="small" color={primaryColor} /> :
                  <>
                    <Ionicons name="add-circle-outline" size={22} color={primaryColor} />
                    <Text style={[styles.addAccountText, { color: primaryColor }]}>{t('add_account', 'إضافة حساب')}</Text>
                  </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </GestureHandlerRootView>
  );
}

const ActionButton = ({ icon, label, onPress, colors, primary }) => (
  <TouchableOpacity style={styles.actionBtnContainer} onPress={onPress}>
    <View style={[styles.actionBtnCircle, { backgroundColor: primary + '15' }]}>
      <Ionicons name={icon} size={22} color={primary} />
    </View>
    <Text style={[styles.actionBtnLabel, { color: colors.text }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSection: { borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 20, paddingBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 5, zIndex: 10 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  walletInfo: { flexDirection: 'row', alignItems: 'center' },
  walletName: { fontSize: 18, fontWeight: '700' },
  accountsButton: { marginLeft: 8, padding: 4 },
  headerIcons: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  balanceContainer: { alignItems: 'center', marginBottom: 24 },
  balanceLabel: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', flexWrap: 'wrap', gap: 8 },
  actionBtnContainer: { alignItems: 'center', gap: 8, width: 70 },
  actionBtnCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  actionBtnLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  listContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  
  leftAction: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 20, borderTopLeftRadius: 16, borderBottomLeftRadius: 16, marginBottom: 12 },
  rightAction: { flex: 1, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20, borderTopRightRadius: 16, borderBottomRightRadius: 16, marginBottom: 12 },
  assetItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 12 },
  assetLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  assetIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F0F0' },
  assetSymbol: { fontSize: 16, fontWeight: '700' },
  assetName: { fontSize: 12 },
  assetRight: { alignItems: 'flex-end' },
  assetBalance: { fontSize: 16, fontWeight: '600' },
  assetValue: { fontSize: 12 },
  
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { marginTop: 10, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalOverlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 20 },
  modalContent: { width: '100%', padding: 24, borderRadius: 24, marginBottom: 20 },
  accountsModalContent: {
    width: '100%',
    maxHeight: height * 0.8,
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
  },
  accountsModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  actionText: { color: '#FFF', fontSize: 14, fontWeight: '600', marginTop: 4 },
  
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  accountActionContainer: {
    flexDirection: 'row',
    height: '100%',
  },
  accountActionBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountAvatarText: { fontSize: 18, fontWeight: '700' },
  accountName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  accountAddress: { fontSize: 12 },
  accountBalanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountBalance: {
    fontSize: 16,
    fontWeight: '600',
  },
  
  closeModalBtn: { width: '100%', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  addAccountButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 14, borderWidth: 1.5, borderRadius: 14, gap: 8 },
  addAccountText: { fontSize: 16, fontWeight: '600' },
});
