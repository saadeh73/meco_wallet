import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  RefreshControl, TextInput, Modal, Dimensions, Animated,
  FlatList, Image, ActivityIndicator, Platform, KeyboardAvoidingView
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { getSolBalance, getTokenAccounts, getTokenMarketPrice } from '../services/heliusService';

// ✅ استيراد المتغير فقط لقراءة الجلسات (بدون إرهاق التطبيق بالتهيئة)
import { web3wallet } from '../services/walletConnectService';

const { width } = Dimensions.get('window');

const SUPPORTED_ASSETS =[
  { symbol: 'SOL', name: 'Solana', mint: null, icon: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
  { symbol: 'MECO', name: 'MonyCoin', mint: '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i', icon: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco-logo.png' },
  { symbol: 'USDT', name: 'Tether', mint: 'Es9vMFrzaCERc8Foa8XfRduKiSfrhEL5c7qr2WXXBWY5', icon: 'https://assets.coingecko.com/coins/images/325/large/Tether.png' },
  { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', icon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png' },
];

export default function WalletScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const colors = {
    background: isDark ? '#0A0A0F' : '#F2F3F7',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#8E8E93',
    border: isDark ? '#2A2A3E' : '#E5E5EA',
  };

  const[walletName, setWalletName] = useState(t('my_wallet') || 'My Wallet');
  const[walletAddress, setWalletAddress] = useState('');
  const[totalBalanceUSD, setTotalBalanceUSD] = useState(0);
  const [assets, setAssets] = useState([]); 
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [tempWalletName, setTempWalletName] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);

  // States لـ WalletConnect
  const[activeSessions, setActiveSessions] = useState([]);
  const [wcModalVisible, setWcModalVisible] = useState(false);

  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(30))[0];

  const swipeableRefs = useRef({});

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 6, useNativeDriver: true }),
    ]).start();
  },[]);

  // ✅ جلب البيانات والجلسات بهدوء عند فتح الشاشة
  useFocusEffect(
    useCallback(() => {
      loadWalletData();
      try {
        if (web3wallet) {
          setActiveSessions(Object.values(web3wallet.getActiveSessions()));
        }
      } catch (error) {
        console.log("Error reading sessions:", error);
      }
    },[])
  );

  const disconnectSession = async (topic) => {
    try {
      if (web3wallet) {
        await web3wallet.disconnectSession({
          topic,
          reason: { code: 6000, message: 'User disconnected via meco wallet' }
        });
        Alert.alert(t('success'), t('web3.disconnect_success', 'تم قطع الاتصال بنجاح.'));
      }
    } catch (error) {
      if (error.message.includes('deleted') || error.message.includes('No matching key')) {
        console.log('Session already deleted from server.');
      }
    } finally {
      if (web3wallet) {
        setActiveSessions(Object.values(web3wallet.getActiveSessions()));
      }
      setWcModalVisible(false);
    }
  };

  const loadWalletData = async () => {
    try {
      const addr = await SecureStore.getItemAsync('wallet_public_key');
      const name = await AsyncStorage.getItem('wallet_name');
      
      if (name) setWalletName(name);
      if (addr) setWalletAddress(addr);

      if (!addr) {
        setLoadingInitial(false);
        return;
      }

      const solBal = await getSolBalance(true);
      
      let tokenAccounts =[];
      try {
        if (getTokenAccounts) tokenAccounts = await getTokenAccounts();
      } catch (e) { console.warn('Token fetch error', e); }

      let calculatedTotalUSD = 0;
      
      const updatedAssets = await Promise.all(SUPPORTED_ASSETS.map(async (asset) => {
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
            price = await getTokenMarketPrice(asset.symbol);
          }
        } catch (e) { console.warn(`Price fetch error for ${asset.symbol}`, e); }

        const valueUSD = amount * price;
        calculatedTotalUSD += valueUSD;

        return { ...asset, amount, price, valueUSD };
      }));

      updatedAssets.sort((a, b) => b.valueUSD - a.valueUSD);

      setAssets(updatedAssets);
      setTotalBalanceUSD(calculatedTotalUSD);
      setLoadingInitial(false);

    } catch (error) {
      console.warn('Failed to load wallet data:', error);
      setLoadingInitial(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadWalletData();
    try {
      if (web3wallet) {
        setActiveSessions(Object.values(web3wallet.getActiveSessions()));
      }
    } catch (e) {}
    setRefreshing(false);
  };

  const copyAddress = async () => {
    if (walletAddress) {
      await Clipboard.setStringAsync(walletAddress);
      Alert.alert(t('success'), t('wallet_address_copied'));
    }
  };

  const saveWalletName = async () => {
    if (tempWalletName.trim()) {
      await AsyncStorage.setItem('wallet_name', tempWalletName);
      setWalletName(tempWalletName);
    }
    setModalVisible(false);
  };

  const closeOtherSwipeables = (currentSymbol) => {
    Object.keys(swipeableRefs.current).forEach(key => {
      if (key !== currentSymbol && swipeableRefs.current[key]?.close) {
        swipeableRefs.current[key].close();
      }
    });
  };

  const renderRightActions = (asset) => (
    <TouchableOpacity
      style={[styles.rightAction, { backgroundColor: primaryColor }]}
      onPress={() => {
        if (swipeableRefs.current[asset.symbol]?.close) {
          swipeableRefs.current[asset.symbol].close();
        }
        navigation.navigate('Send', { preselectedToken: asset.symbol });
      }}
    >
      <Ionicons name="paper-plane-outline" size={24} color="#FFF" />
      <Text style={styles.actionText}>{t('send')}</Text>
    </TouchableOpacity>
  );

  const renderLeftActions = (asset) => (
    <TouchableOpacity
      style={[styles.leftAction, { backgroundColor: primaryColor + 'CC' }]}
      onPress={() => {
        if (swipeableRefs.current[asset.symbol]?.close) {
          swipeableRefs.current[asset.symbol].close();
        }
        navigation.navigate('Swap', { fromToken: asset.symbol });
      }}
    >
      <Ionicons name="swap-horizontal-outline" size={24} color="#FFF" />
      <Text style={styles.actionText}>{t('swap_title')}</Text>
    </TouchableOpacity>
  );

  const renderAssetItem = ({ item }) => (
    <Swipeable
      ref={ref => (swipeableRefs.current[item.symbol] = ref)}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      renderLeftActions={() => renderLeftActions(item)}
      renderRightActions={() => renderRightActions(item)}
      onSwipeableWillOpen={() => closeOtherSwipeables(item.symbol)}
    >
      <TouchableOpacity 
        style={[styles.assetItem, { backgroundColor: colors.card }]}
        onPress={() => { if (item.mint) Clipboard.setStringAsync(item.mint); }}
        activeOpacity={0.7}
      >
        <View style={styles.assetLeft}>
          <Image source={{ uri: item.icon }} style={styles.assetIcon} defaultSource={null} />
          <View>
            <Text style={[styles.assetSymbol, { color: colors.text }]}>{item.symbol}</Text>
            <Text style={[styles.assetName, { color: colors.textSecondary }]}>{item.name}</Text>
          </View>
        </View>
        <View style={styles.assetRight}>
          <Text style={[styles.assetBalance, { color: colors.text }]}>
            {item.amount > 0 ? item.amount.toFixed(4) : '0'}
          </Text>
          <Text style={[styles.assetValue, { color: colors.textSecondary }]}>
            ${item.valueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Animated.View 
          style={[styles.headerSection, { backgroundColor: colors.card, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.walletInfo} onPress={() => { setTempWalletName(walletName); setModalVisible(true); }}>
              <Text style={[styles.walletName, { color: colors.text }]}>{walletName}</Text>
              <Ionicons name="pencil" size={14} color={colors.textSecondary} style={{marginLeft: 6}} />
            </TouchableOpacity>
            
            <View style={styles.headerIcons}>
              {/* ✅ الزر الذكي الوحيد (الكوكب): يفتح الماسح إذا لم يكن هناك اتصال، أو الجلسات إذا كان متصلاً */}
              <TouchableOpacity 
                onPress={() => activeSessions.length > 0 ? setWcModalVisible(true) : navigation.navigate('QRScanner')} 
                style={[styles.iconBtn, { backgroundColor: isDark ? '#2A2A3E' : '#F2F2F7', position: 'relative' }]}
              >
                <Ionicons 
                  name={activeSessions.length > 0 ? "planet" : "planet-outline"} 
                  size={22} 
                  color={activeSessions.length > 0 ? '#4CAF50' : primaryColor} 
                />
                {activeSessions.length > 0 && <View style={[styles.activeBadge, { borderColor: colors.card }]} />}
              </TouchableOpacity>

              {/* زر النسخ */}
              <TouchableOpacity onPress={copyAddress} style={[styles.iconBtn, { backgroundColor: isDark ? '#2A2A3E' : '#F2F2F7' }]}>
                <Ionicons name="copy-outline" size={20} color={primaryColor} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.balanceContainer}>
            <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('total_balance')}</Text>
            {loadingInitial ? (
              <ActivityIndicator color={primaryColor} style={{marginTop: 10}} />
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
            <ActionButton icon="rocket" label={t('presale')} onPress={() => navigation.navigate('Presale')} colors={colors} primary={primaryColor} />
          </View>
        </Animated.View>

        <View style={styles.listContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('market_all_coins')}</Text>
          <FlatList
            data={assets}
            renderItem={renderAssetItem}
            keyExtractor={item => item.symbol}
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
            ListEmptyComponent={!loadingInitial && (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('loading_market_data')}</Text>
              </View>
            )}
          />
        </View>

        {/* Modal تعديل اسم المحفظة */}
        <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('edit_wallet_name')}</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={tempWalletName}
                onChangeText={setTempWalletName}
                placeholder={t('enter_wallet_name')}
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalBtn, { borderColor: colors.border }]} onPress={() => setModalVisible(false)}>
                  <Text style={{ color: colors.text }}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={saveWalletName}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t('save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ✅ Modal إدارة الجلسات (التطبيقات المتصلة) */}
        <Modal visible={wcModalVisible} transparent animationType="slide" onRequestClose={() => setWcModalVisible(false)}>
          <View style={styles.modalOverlayBottom}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16}}>
                <Ionicons name="planet" size={24} color="#4CAF50" style={{marginRight: 8}} />
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>{t('web3.connected_apps')}</Text>
              </View>
              
              {activeSessions.length > 0 ? (
                activeSessions.map((session, index) => (
                  <View key={index} style={[styles.sessionCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <View style={styles.sessionInfo}>
                      <Image source={{ uri: session.peer.metadata.icons[0] }} style={styles.sessionIcon} defaultSource={null} />
                      <View>
                        <Text style={[styles.sessionName, { color: colors.text }]}>{session.peer.metadata.name}</Text>
                        <Text style={[styles.sessionUrl, { color: colors.textSecondary }]}>{session.peer.metadata.url}</Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                      style={[styles.disconnectBtn, { backgroundColor: '#FF3B3015' }]} 
                      onPress={() => disconnectSession(session.topic)}
                    >
                      <Text style={{ color: '#FF3B30', fontWeight: 'bold', fontSize: 12 }}>{t('web3.disconnect')}</Text>
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <View style={{alignItems: 'center', paddingVertical: 10}}>
                  <Ionicons name="link-outline" size={40} color={colors.textSecondary} style={{marginBottom: 10}} />
                  <Text style={{color: colors.textSecondary, textAlign: 'center', marginBottom: 20}}>
                    {t('web3.no_active_sessions')}
                  </Text>
                  <TouchableOpacity 
                    style={[styles.modalBtn, { backgroundColor: primaryColor, width: '100%', borderColor: primaryColor }]}
                    onPress={() => {
                      setWcModalVisible(false);
                      navigation.navigate('QRScanner');
                    }}
                  >
                    <Text style={{ color: '#FFF', fontWeight: 'bold', textAlign: 'center' }}>
                      {t('web3.connect_new_dapp')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={[styles.closeModalBtn, { backgroundColor: isDark ? '#2A2A3E' : '#F2F2F7' }]} onPress={() => setWcModalVisible(false)}>
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>{t('close')}</Text>
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
  headerSection: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 10,
  },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  walletInfo: { flexDirection: 'row', alignItems: 'center' },
  walletName: { fontSize: 18, fontWeight: '700' },
  headerIcons: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  activeBadge: { position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50', borderWidth: 2 },
  balanceContainer: { alignItems: 'center', marginBottom: 24 },
  balanceLabel: { fontSize: 14, fontWeight: '500', marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontWeight: '800' },
  actionsRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    width: '100%',
    flexWrap: 'wrap',
    gap: 8
  },
  actionBtnContainer: { alignItems: 'center', gap: 8, width: 70 },
  actionBtnCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  actionBtnLabel: { fontSize: 12, fontWeight: '600' },
  listContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  assetItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 16, 
    borderRadius: 16, 
    marginBottom: 12,
  },
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
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  leftAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    marginBottom: 12,
  },
  rightAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    marginBottom: 12,
  },
  actionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  sessionCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 1, borderRadius: 16, marginBottom: 16 },
  sessionInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  sessionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF' },
  sessionName: { fontSize: 14, fontWeight: 'bold' },
  sessionUrl: { fontSize: 10 },
  disconnectBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  closeModalBtn: { width: '100%', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
});
