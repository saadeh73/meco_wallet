import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
  Image, Modal, FlatList
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import {
  getPoolInfo,
  getUserLPBalance,
  depositLiquidity,
  withdrawLiquidity
} from '../services/stakingService';
import * as SwapAPI from '../services/swapService';
// ✅ جديد: استيراد خدمة السوق للحصول على سعر MECO الحقيقي
import { getJupiterMarketData } from '../services/jupiterMarketService';

const SLIPPAGE_OPTIONS = [0.5, 1.0, 3.0];

export default function StakingScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    success: '#10B981',
    error: '#10B981', // تم تغييره ليتناسب مع الثيم
    warning: '#F59E0B',
  };

  const [poolInfo, setPoolInfo] = useState(null);
  const [lpBalance, setLpBalance] = useState(0);
  const [mecoBalance, setMecoBalance] = useState(0);
  const [usdtBalance, setUsdtBalance] = useState(0);
  const [activeTab, setActiveTab] = useState('stake');
  const [mecoAmount, setMecoAmount] = useState('');
  const [usdtAmount, setUsdtAmount] = useState('');
  const [lpAmount, setLpAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [estimatedReceive, setEstimatedReceive] = useState({ meco: 0, usdt: 0 });
  
  // ✅ جديد: حالات slippage وسعر MECO
  const [slippageBps, setSlippageBps] = useState(100); // افتراضي 1%
  const [showSlippageModal, setShowSlippageModal] = useState(false);
  const [mecoPrice, setMecoPrice] = useState(0);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOffline(!state.isConnected));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadData();
    fetchMecoPrice();
  }, []);

  const fetchMecoPrice = async () => {
    try {
      const marketData = await getJupiterMarketData();
      const meco = marketData.find(t => t.symbol === 'MECO');
      if (meco) setMecoPrice(meco.current_price);
    } catch (e) {
      console.warn('Failed to fetch MECO price');
    }
  };

  const loadData = async () => {
    setLoadingData(true);
    setError('');
    try {
      const [pool, lpBal, mecoBal, usdtBal] = await Promise.all([
        getPoolInfo(),
        getUserLPBalance(),
        SwapAPI.checkBalance('MECO', 0),
        SwapAPI.checkBalance('USDT', 0),
      ]);
      setPoolInfo(pool);
      setLpBalance(lpBal);
      setMecoBalance(mecoBal.balance || 0);
      setUsdtBalance(usdtBal.balance || 0);
    } catch (err) {
      setError(t('staking.load_error'));
    } finally {
      setLoadingData(false);
    }
  };

  // ✅ جديد: حساب USDT تلقائيًا عند تغيير MECO
  const handleMecoChange = (value) => {
    setMecoAmount(value);
    const meco = parseFloat(value) || 0;
    if (mecoPrice > 0) {
      const usdtValue = meco * mecoPrice;
      setUsdtAmount(usdtValue.toFixed(6));
    }
  };

  useEffect(() => {
    if (activeTab === 'unstake' && poolInfo && lpBalance > 0) {
      const lpValue = parseFloat(lpAmount) || 0;
      const share = lpValue / lpBalance;
      setEstimatedReceive({
        meco: (poolInfo.mecoReserve || 0) * share,
        usdt: (poolInfo.usdtReserve || 0) * share,
      });
    }
  }, [lpAmount, poolInfo, lpBalance, activeTab]);

  const handleStake = async () => {
    const mecoVal = parseFloat(mecoAmount);
    const usdtVal = parseFloat(usdtAmount);
    if (isNaN(mecoVal) || mecoVal <= 0 || isNaN(usdtVal) || usdtVal <= 0) {
      Alert.alert(t('error'), t('staking.enter_valid_amounts'));
      return;
    }
    if (mecoVal > mecoBalance || usdtVal > usdtBalance) {
      Alert.alert(t('error'), t('staking.insufficient_balance'));
      return;
    }

    Alert.alert(
      t('staking.confirm_stake'),
      `${mecoVal} MECO + ${usdtVal} USDT (Slippage: ${slippageBps / 100}%)`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            setLoading(true);
            try {
              // ✅ تمرير slippageBps إلى دالة الإيداع
              const result = await depositLiquidity(mecoVal, usdtVal, slippageBps);
              if (result.success) {
                Alert.alert(t('success'), t('staking.stake_success'), [
                  { text: t('ok'), onPress: () => { setMecoAmount(''); setUsdtAmount(''); loadData(); } }
                ]);
              } else {
                Alert.alert(t('error'), result.error);
              }
            } catch (err) {
              Alert.alert(t('error'), err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleUnstake = async () => {
    const lpVal = parseFloat(lpAmount);
    if (isNaN(lpVal) || lpVal <= 0) {
      Alert.alert(t('error'), t('staking.enter_valid_lp_amount'));
      return;
    }
    if (lpVal > lpBalance) {
      Alert.alert(t('error'), t('staking.insufficient_lp'));
      return;
    }

    Alert.alert(
      t('staking.confirm_unstake'),
      t('staking.unstake_confirmation', { amount: lpVal }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            setLoading(true);
            try {
              const result = await withdrawLiquidity(lpVal);
              if (result.success) {
                Alert.alert(t('success'), t('staking.unstake_success'), [
                  { text: t('ok'), onPress: () => { setLpAmount(''); loadData(); } }
                ]);
              } else {
                Alert.alert(t('error'), result.error);
              }
            } catch (err) {
              Alert.alert(t('error'), err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const useMaxMeco = () => {
    setMecoAmount(mecoBalance.toString());
    if (mecoPrice > 0) {
      setUsdtAmount((mecoBalance * mecoPrice).toFixed(6));
    }
  };
  const useMaxUsdt = () => setUsdtAmount(usdtBalance.toString());
  const useMaxLp = () => setLpAmount(lpBalance.toString());

  if (loadingData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: colors.text }]}>{t('staking.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('staking.subtitle')}</Text>

        {isOffline && (
          <View style={[styles.offlineBanner, { backgroundColor: colors.warning + '20' }]}>
            <Ionicons name="cloud-offline" size={16} color={colors.warning} />
            <Text style={[styles.offlineText, { color: colors.warning }]}>{t('offline_mode')}</Text>
          </View>
        )}

        {/* ✅ جديد: عرض سعر MECO الحالي */}
        <View style={[styles.priceCard, { backgroundColor: colors.card }]}>
          <Text style={{ color: colors.textSecondary }}>MECO Price:</Text>
          <Text style={{ color: colors.text, fontWeight: 'bold' }}>${mecoPrice.toFixed(8)}</Text>
        </View>

        {/* ✅ جديد: زر اختيار slippage */}
        <TouchableOpacity
          style={[styles.slippageButton, { backgroundColor: colors.card }]}
          onPress={() => setShowSlippageModal(true)}
        >
          <Text style={{ color: colors.text }}>Slippage Tolerance: {slippageBps / 100}%</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.poolHeader}>
            <Image source={{ uri: 'https://raydium.io/icons/raydium.svg' }} style={styles.poolIcon} />
            <Text style={[styles.poolTitle, { color: colors.text }]}>MECO-USDT</Text>
          </View>
          <View style={styles.poolStats}>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>APY</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{poolInfo?.apy || '--'}%</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>TVL</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>${(poolInfo?.totalLiquidity || 0).toLocaleString()}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Your LP</Text>
              <Text style={[styles.statValue, { color: primaryColor }]}>{lpBalance.toFixed(4)}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stake' && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('stake')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'stake' ? primaryColor : colors.textSecondary }]}>{t('staking.stake_tab')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'unstake' && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('unstake')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'unstake' ? primaryColor : colors.textSecondary }]}>{t('staking.unstake_tab')}</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'stake' ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.inputGroup}>
              <View style={styles.inputHeader}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>MECO</Text>
                <TouchableOpacity onPress={useMaxMeco}>
                  <Text style={[styles.maxButton, { color: primaryColor }]}>{t('max')}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={mecoAmount}
                onChangeText={handleMecoChange} // ✅ استخدام الدالة الجديدة
              />
              <Text style={[styles.balanceText, { color: colors.textSecondary }]}>
                {t('balance')}: {mecoBalance.toFixed(4)} MECO
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputHeader}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>USDT (Auto-calculated)</Text>
                <TouchableOpacity onPress={useMaxUsdt}>
                  <Text style={[styles.maxButton, { color: primaryColor }]}>{t('max')}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={usdtAmount}
                onChangeText={setUsdtAmount}
                editable={false} // ✅ جعله للقراءة فقط لأنه يحسب تلقائيًا
              />
              <Text style={[styles.balanceText, { color: colors.textSecondary }]}>
                {t('balance')}: {usdtBalance.toFixed(4)} USDT
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: primaryColor, opacity: loading ? 0.6 : 1 }]}
              onPress={handleStake}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.actionButtonText}>{t('staking.stake')}</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.inputGroup}>
              <View style={styles.inputHeader}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>LP Tokens</Text>
                <TouchableOpacity onPress={useMaxLp}>
                  <Text style={[styles.maxButton, { color: primaryColor }]}>{t('max')}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={lpAmount}
                onChangeText={setLpAmount}
              />
              <Text style={[styles.balanceText, { color: colors.textSecondary }]}>
                {t('balance')}: {lpBalance.toFixed(4)} LP
              </Text>
            </View>

            <View style={[styles.estimateCard, { backgroundColor: colors.background }]}>
              <Text style={[styles.estimateTitle, { color: colors.text }]}>{t('staking.you_will_receive')}</Text>
              <View style={styles.estimateRow}>
                <Text style={[styles.estimateLabel, { color: colors.textSecondary }]}>MECO</Text>
                <Text style={[styles.estimateValue, { color: colors.text }]}>{estimatedReceive.meco.toFixed(4)}</Text>
              </View>
              <View style={styles.estimateRow}>
                <Text style={[styles.estimateLabel, { color: colors.textSecondary }]}>USDT</Text>
                <Text style={[styles.estimateValue, { color: colors.text }]}>{estimatedReceive.usdt.toFixed(4)}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: primaryColor, opacity: loading ? 0.6 : 1 }]}
              onPress={handleUnstake}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.actionButtonText}>{t('staking.unstake')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {error ? (
          <View style={[styles.errorCard, { backgroundColor: colors.error + '15' }]}>
            <Ionicons name="warning" size={20} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : null}

        {/* ✅ مودال اختيار slippage */}
        <Modal visible={showSlippageModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Slippage Tolerance</Text>
              {SLIPPAGE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.slippageOption, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setSlippageBps(Math.floor(opt * 100));
                    setShowSlippageModal(false);
                  }}
                >
                  <Text style={{ color: colors.text }}>{opt}%</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowSlippageModal(false)}>
                <Text style={{ color: primaryColor }}>{t('close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  backButton: { marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 5, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  card: { borderRadius: 20, padding: 16, marginBottom: 16 },
  poolHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  poolIcon: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  poolTitle: { fontSize: 18, fontWeight: '700' },
  poolStats: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statLabel: { fontSize: 12, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '600' },
  tabContainer: { flexDirection: 'row', borderRadius: 16, marginBottom: 16, paddingHorizontal: 8 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 16, fontWeight: '600' },
  inputGroup: { marginBottom: 20 },
  inputHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  inputLabel: { fontSize: 14, fontWeight: '500' },
  maxButton: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  balanceText: { fontSize: 12, marginTop: 6, textAlign: 'right' },
  actionButton: { padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 8 },
  actionButtonText: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  estimateCard: { borderRadius: 12, padding: 16, marginBottom: 20 },
  estimateTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  estimateLabel: { fontSize: 14 },
  estimateValue: { fontSize: 14, fontWeight: '600' },
  errorCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginTop: 10, gap: 8 },
  errorText: { flex: 1, fontSize: 14 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 15, gap: 8 },
  offlineText: { fontSize: 14, fontWeight: '500' },
  // ✅ أنماط جديدة
  priceCard: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: 12, marginBottom: 12 },
  slippageButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  slippageOption: { paddingVertical: 14, borderBottomWidth: 1 },
  modalClose: { marginTop: 16, alignItems: 'center', padding: 10 },
});
