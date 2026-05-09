// WalletScreen.js - محسن (مصحح) مع تأثير النسخ البصري ودالة الأرصدة المحسّنة
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
import { getSolBalance, getTokenAccounts, getTokenMarketPrice, getTokenBalance } from '../services/heliusService';
import { CORE_TOKENS } from '../services/jupiterMarketService';
import * as LocalAuthentication from 'expo-local-authentication';

const { width, height } = Dimensions.get('window');

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

  const [walletName, setWalletName] = useState('');
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
  const [copyFeedback, setCopyFeedback] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const swipeableRefs = useRef({});
  const accountSwipeableRefs = useRef({});

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 6, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
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
      const addr = typeof publicKey === 'string' ? publicKey : publicKey.toString();

      const solBal = await getSolBalance(true, addr) || 0;
      const tokenAccounts = await getTokenAccounts(addr) || [];

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
          if (getTokenMarketPrice) price = await getTokenMarketPrice(asset.symbol) || 0;
        } catch (e) {}

        const valueUSD = amount * price;
        calculatedTotalUSD += valueUSD;
        return { ...asset, amount, price, valueUSD };
      }));

      const filteredAssets = allAssetsPromise.filter(asset => asset.symbol === 'SOL' || asset.symbol === 'MECO' || asset.amount > 0);
      filteredAssets.sort((a, b) => b.valueUSD - a.valueUSD);

      setAssets(filteredAssets);
      setTotalBalanceUSD(calculatedTotalUSD);
    } catch (error) {
    } finally {
      setLoadingInitial(false);
      setIsSwitchingAccount(false);
    }
  }, []);

  useEffect(() => {
    if (walletPublicKey) loadWalletData(walletPublicKey);
  }, [walletPublicKey, loadWalletData]);

  // ★★★ الدالة الجديدة المحسّنة لجلب أرصدة الحسابات ★★★
  const fetchAccountUsdBalances = useCallback(async () => {
    if (loadingAccountBalances) return;
    setLoadingAccountBalances(true);

    const balances = {};

    try {
      const marketPrices = {};
      await Promise.all(CORE_TOKENS.map(async (asset) => {
        try {
          if (getTokenMarketPrice) {
            marketPrices[asset.symbol] = await getTokenMarketPrice(asset.symbol) || 0;
          }
        } catch (e) {
          marketPrices[asset.symbol] = 0;
        }
      }));

      for (const acc of accounts) {
        try {
          const addr = acc.publicKey;

          if (acc.index === activeAccountIndex && totalBalanceUSD > 0) {
            balances[addr] = totalBalanceUSD;
            continue;
          }

          const solBal = await getSolBalance(true, addr).catch(() => 0) || 0;

          let mecoAmount = 0, usdcAmount = 0, usdtAmount = 0;
          
          try { mecoAmount = await getTokenBalance('7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i', true, addr); } catch(e) {}
          await new Promise(resolve => setTimeout(resolve, 200));
          
          try { usdcAmount = await getTokenBalance('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', true, addr); } catch(e) {}
          await new Promise(resolve => setTimeout(resolve, 200));
          
          try { usdtAmount = await getTokenBalance('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', true, addr); } catch(e) {}

          let accUsd = (solBal * (marketPrices['SOL'] || 0)) +
                       (mecoAmount * (marketPrices['MECO'] || 0)) +
                       (usdcAmount * (marketPrices['USDC'] || 0)) +
                       (usdtAmount * (marketPrices['USDT'] || 0));

          balances[addr] = accUsd;
          
        } catch (accountError) {
          balances[acc.publicKey] = 0;
        }
      }
    } catch (globalError) {
      console.error("Error in fetchAccountUsdBalances:", globalError);
    } finally {
      setAccountUsdBalances(balances);
      setLoadingAccountBalances(false);
    }
  }, [accounts, loadingAccountBalances, activeAccountIndex, totalBalanceUSD]);

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

  const authenticateWithPhonePasscode = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('passcode_prompt'),
        disableDeviceFallback: false,
        fallbackLabel: t('use_phone_passcode'),
      });
      return result.success;
    } catch (e) {
      return false;
    }
  };

  const handleExportPrivateKey = async (account) => {
    const authSuccess = await authenticateWithPhonePasscode();
    if (!authSuccess) {
      Alert.alert(t('error'), t('auth_failed'));
      return;
    }

    try {
      const privateKey = await useAppStore.getState().getPrivateKeyForAccount(account.index);
      if (!privateKey) {
        Alert.alert(t('error'), t('private_key_not_found'));
        return;
      }

      Alert.alert(
        t('key_warning_title'),
        t('key_warning_message', { key: privateKey }),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('copy_key'), onPress: () => { Clipboard.setStringAsync(privateKey); Alert.alert(t('success'), t('copied')); } },
        ]
      );
    } catch (error) {
      Alert.alert(t('error'), t('unexpected_error'));
    }
  };

  const renderLeftActions = (progress, dragX, asset) => {
    const trans = dragX.interpolate({
      inputRange: [0, 50, 100],
      outputRange: [-80, -40, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.leftAction, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity
          style={[styles.swipeActionBtn, { backgroundColor: '#6366F1' }]}
          onPress={() => {
            swipeableRefs.current[asset.symbol]?.close();
            navigation.navigate('Swap', { fromToken: asset.symbol });
          }}
        >
          <Ionicons name="swap-horizontal" size={24} color="#FFF" />
          <Text style={styles.swipeActionLabel}>{t('swap_title')}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRightActions = (progress, dragX, asset) => {
    const trans = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [0, 40, 80],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.rightAction, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity
          style={[styles.swipeActionBtn, { backgroundColor: '#10B981' }]}
          onPress={() => {
            swipeableRefs.current[asset.symbol]?.close();
            navigation.navigate('Send', { preselectedToken: asset.symbol });
          }}
        >
          <Ionicons name="paper-plane" size={24} color="#FFF" />
          <Text style={styles.swipeActionLabel}>{t('send')}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderAssetItem = ({ item }) => {
    const isPositive = item.valueUSD > 0;
    const cardColor = colors.card;

    return (
      <Animated.View
        style={[
          styles.assetItemWrapper,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          },
        ]}
      >
        <Swipeable
          ref={ref => (swipeableRefs.current[item.symbol] = ref)}
          friction={3}
          leftThreshold={60}
          rightThreshold={60}
          overshootLeft={false}
          overshootRight={false}
          renderLeftActions={(progress, dragX) => renderLeftActions(progress, dragX, item)}
          renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
          onSwipeableWillOpen={() => closeOtherSwipeables(item.symbol, swipeableRefs)}
        >
          <TouchableOpacity
            style={[styles.assetItem, { backgroundColor: cardColor }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('TokenDetails', { token: item })}
          >
            <View style={styles.assetLeft}>
              <View style={[styles.assetIconContainer, { backgroundColor: primaryColor + '15' }]}>
                <Image source={{ uri: item.image }} style={styles.assetIcon} />
                {item.symbol === 'SOL' && (
                  <View style={[styles.badgeDot, { backgroundColor: '#14F195', borderColor: cardColor }]} />
                )}
              </View>
              <View style={styles.assetInfo}>
                <Text style={[styles.assetSymbol, { color: colors.text }]}>{item.symbol}</Text>
                <Text style={[styles.assetName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
            </View>
            <View style={styles.assetRight}>
              <Text style={[styles.assetBalance, { color: colors.text }]}>
                {item.amount > 0 ? item.amount.toFixed(item.amount > 100 ? 2 : 4) : '0'}
              </Text>
              <Text style={[styles.assetValue, { color: isPositive ? colors.success : colors.textSecondary }]}>
                {item.valueUSD > 0 ? `$${item.valueUSD.toFixed(2)}` : '\$0.00'}
              </Text>
            </View>
            <View style={styles.assetChevron}>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
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
            if (accountSwipeableRefs.current[item.index]?.close) accountSwipeableRefs.current[item.index].close();
            setEditingAccountIndex(item.index);
            setTempWalletName(item.name);
            setAccountsModalVisible(false);
            setTimeout(() => setModalVisible(true), 300);
          }}
        >
          <Ionicons name="pencil" size={20} color="#FFF" />
          <Text style={styles.actionText}>{t('edit')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.accountActionBtn, { backgroundColor: '#F59E0B' }]}
          onPress={() => {
            if (accountSwipeableRefs.current[item.index]?.close) accountSwipeableRefs.current[item.index].close();
            handleExportPrivateKey(item);
          }}
        >
          <Ionicons name="key" size={20} color="#FFF" />
          <Text style={styles.actionText}>{t('export')}</Text>
        </TouchableOpacity>

        {!isActive && (
          <TouchableOpacity
            style={[styles.accountActionBtn, { backgroundColor: colors.error, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
            onPress={() => {
              if (accountSwipeableRefs.current[item.index]?.close) accountSwipeableRefs.current[item.index].close();
              handleDeleteAccount(item);
            }}
          >
            <Ionicons name="trash" size={20} color="#FFF" />
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
        onPress={() => {
          if (accountSwipeableRefs.current[item.index]?.close) accountSwipeableRefs.current[item.index].close();
          copyAddress(item.publicKey);
        }}
      >
        <Ionicons name="copy" size={20} color="#FFF" />
        <Text style={styles.actionText}>{t('copy')}</Text>
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
              <View style={[styles.accountAvatar, { backgroundColor: isActive ? primaryColor + '30' : primaryColor + '15' }]}>
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

        {/* Header Card */}
        <Animated.View style={[styles.headerCard, { backgroundColor: colors.card, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={styles.walletInfoRow}>
              <View style={[styles.walletIconWrapper, { backgroundColor: primaryColor + '20' }]}>
                <Ionicons name="wallet" size={22} color={primaryColor} />
              </View>
              <View>
                <Text style={[styles.walletName, { color: colors.text }]}>{walletName}</Text>
                <TouchableOpacity onPress={() => setAccountsModalVisible(true)} style={styles.accountsTrigger}>
                  <Ionicons name="layers" size={14} color={primaryColor} />
                  <Text style={[styles.accountsCount, { color: primaryColor }]}>{accounts.length} {t('accounts')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* زر النسخ مع تأثير الوميض الأخضر */}
            <TouchableOpacity
              onPress={() => copyAddress()}
              style={[styles.copyButton, { backgroundColor: isDark ? '#2A2A3E' : '#F2F2F7' }]}
            >
              <Ionicons name="link" size={18} color={copyFeedback ? '#10B981' : primaryColor} />
            </TouchableOpacity>
          </View>

          {/* Balance Display */}
          <View style={styles.balanceSection}>
            <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('total_balance')}</Text>
            {loadingInitial || isSwitchingAccount ? (
              <View style={styles.loadingBalance}>
                <ActivityIndicator color={primaryColor} />
              </View>
            ) : (
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Text style={[styles.balanceAmount, { color: colors.text }]}>
                  ${totalBalanceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </Animated.View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Send')}>
              <View style={[styles.actionCircle, { backgroundColor: '#10B981' + '20' }]}>
                <Ionicons name="arrow-up" size={24} color="#10B981" />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>{t('send')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Receive')}>
              <View style={[styles.actionCircle, { backgroundColor: '#6366F1' + '20' }]}>
                <Ionicons name="arrow-down" size={24} color="#6366F1" />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>{t('receive')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Swap')}>
              <View style={[styles.actionCircle, { backgroundColor: '#F59E0B' + '20' }]}>
                <Ionicons name="swap-horizontal" size={24} color="#F59E0B" />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>{t('swap_title')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Staking')}>
              <View style={[styles.actionCircle, { backgroundColor: '#EC4899' + '20' }]}>
                <Ionicons name="trending-up" size={24} color="#EC4899" />
              </View>
              <Text style={[styles.actionLabel, { color: colors.text }]}>{t('staking.stake_tab')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Assets List */}
        <View style={styles.assetsSection}>
          <View style={styles.assetsHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('wallet_your_assets')}</Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={20} color={primaryColor} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={assets}
            renderItem={renderAssetItem}
            keyExtractor={item => item.symbol}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={primaryColor}
                colors={['#6C63FF']}
              />
            }
            ListEmptyComponent={(!loadingInitial && !isSwitchingAccount) && (
              <View style={styles.emptyContainer}>
                <Ionicons name="wallet-outline" size={48} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('loading_market_data')}</Text>
              </View>
            )}
          />
        </View>

        {/* Edit Wallet Modal */}
        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => { setModalVisible(false); setEditingAccountIndex(null); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={styles.modalHeader}>
                <Ionicons name="create-outline" size={28} color={primaryColor} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('edit_wallet_name')}</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={tempWalletName}
                onChangeText={setTempWalletName}
                autoFocus
                placeholder={t('enter_wallet_name')}
                placeholderTextColor={colors.textSecondary}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { borderColor: colors.border }]}
                  onPress={() => { setModalVisible(false); setEditingAccountIndex(null); }}
                >
                  <Text style={{ color: colors.text }}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnPrimary, { backgroundColor: primaryColor }]}
                  onPress={saveWalletName}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t('save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Accounts Modal */}
        <Modal visible={accountsModalVisible} transparent animationType="slide" onRequestClose={() => setAccountsModalVisible(false)}>
          <View style={styles.modalOverlayBottom}>
            <View style={[styles.accountsModalContent, { backgroundColor: colors.card }]}>
              <View style={styles.modalHandle} />

              <View style={styles.accountsModalHeader}>
                <View style={styles.accountsHeaderLeft}>
                  <Ionicons name="layers" size={24} color={primaryColor} />
                  <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>{t('accounts')}</Text>
                </View>
                <TouchableOpacity onPress={() => setAccountsModalVisible(false)} style={[styles.closeBtn, { backgroundColor: colors.background }]}>
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={{ textAlign: 'center', fontSize: 12, color: colors.textSecondary, marginBottom: 16 }}>
                {t('swipe_hint')}
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

              <View style={styles.addAccountButtons}>
                <TouchableOpacity
                  style={[styles.addAccountBtn, { borderColor: primaryColor }]}
                  onPress={handleAddAccount}
                  disabled={addingAccount}
                >
                  {addingAccount ? (
                    <ActivityIndicator size="small" color={primaryColor} />
                  ) : (
                    <>
                      <Ionicons name="add-circle" size={22} color={primaryColor} />
                      <Text style={[styles.addAccountText, { color: primaryColor }]}>{t('add_account')}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addAccountBtn, { borderColor: primaryColor }]}
                  onPress={() => {
                    setAccountsModalVisible(false);
                    navigation.navigate('ImportPrivateKey');
                  }}
                >
                  <Ionicons name="key" size={22} color={primaryColor} />
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

// ========== Styles ==========
const styles = StyleSheet.create({
  container: { flex: 1 },

  headerCard: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 24,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 10,
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  walletInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletName: {
    fontSize: 20,
    fontWeight: '800',
  },
  accountsTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  accountsCount: {
    fontSize: 12,
    fontWeight: '600',
  },

  copyButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  balanceSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
  },
  loadingBalance: {
    height: 50,
    justifyContent: 'center',
  },

  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 8,
  },
  actionCircle: {
    width: 56,
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  assetsSection: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  assetsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  assetItemWrapper: {
    marginBottom: 12,
  },
  assetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  assetIconContainer: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  badgeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  assetInfo: {
    flex: 1,
  },
  assetSymbol: {
    fontSize: 16,
    fontWeight: '700',
  },
  assetName: {
    fontSize: 12,
    marginTop: 2,
  },
  assetRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  assetBalance: {
    fontSize: 16,
    fontWeight: '700',
  },
  assetValue: {
    fontSize: 12,
    marginTop: 2,
  },
  assetChevron: {
    marginLeft: 8,
  },

  leftAction: {
    justifyContent: 'center',
    marginBottom: 12,
  },
  rightAction: {
    justifyContent: 'center',
    marginBottom: 12,
  },
  swipeActionBtn: {
    width: 80,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  swipeActionLabel: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalOverlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    padding: 28,
    borderRadius: 24,
    alignItems: 'center',
  },
  modalHeader: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  modalBtnPrimary: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },

  accountsModalContent: {
    width: '100%',
    maxHeight: height * 0.85,
    padding: 24,
    paddingTop: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    flex: 1,
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E5E5EA',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  accountsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  accountsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
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
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountAvatarText: {
    fontSize: 20,
    fontWeight: '800',
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  accountAddress: {
    fontSize: 12,
  },
  accountBalanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountBalance: {
    fontSize: 16,
    fontWeight: '600',
  },

  addAccountButtons: {
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  addAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: 1.5,
    borderRadius: 16,
    gap: 10,
    marginBottom: 4,
  },
  addAccountText: {
    fontSize: 16,
    fontWeight: '600',
  },

  actionText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});
