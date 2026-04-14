import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
  Modal, FlatList, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import NetInfo from '@react-native-community/netinfo';
import {
  getPoolInfo,
  getUserLPBalance,
  depositLiquidity,
  withdrawLiquidity
} from '../services/stakingService';
import { CORE_TOKENS } from '../services/jupiterMarketService';
import * as SwapAPI from '../services/swapService';

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
    error: '#EF4444',
    warning: '#F59E0B',
  };

  // الحالات
  const [poolInfo, setPoolInfo] = useState(null);
  const [lpBalance, setLpBalance] = useState(0);
  const [mecoBalance, setMecoBalance] = useState(0);
  const [usdtBalance, setUsdtBalance] = useState(0);
  const [activeTab, setActiveTab] = useState('stake'); // 'stake' أو 'unstake'
  const [mecoAmount, setMecoAmount] = useState('');
  const [usdtAmount, setUsdtAmount] = useState('');
  const [lpAmount, setLpAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [estimatedReceive, setEstimatedReceive] = useState({ meco: 0, usdt: 0 });

  // فحص الاتصال بالإنترنت
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // تحميل البيانات
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoadingData(true);
    setError('');
    try {
      console.log('🔄 [StakingScreen] بدء تحميل البيانات...');
      
      const [pool, lpBal, mecoBal, usdtBal] = await Promise.all([
        getPoolInfo().catch(err => {
          console.warn('⚠️ [StakingScreen] فشل getPoolInfo:', err);
          return { apy: 0, mecoReserve: 0, usdtReserve: 0, totalLiquidity: 0 };
        }),
        getUserLPBalance(),
        SwapAPI.checkBalance('MECO', 0).catch(err => {
          console.warn('⚠️ [StakingScreen] فشل checkBalance MECO:', err);
          return { balance: 0 };
        }),
        SwapAPI.checkBalance('USDT', 0).catch(err => {
          console.warn('⚠️ [StakingScreen] فشل checkBalance USDT:', err);
          return { balance: 0 };
        }),
      ]);
      
      console.log('📊 [StakingScreen] Pool Info:', pool);
      console.log('📊 [StakingScreen] LP Balance:', lpBal);
      console.log('📊 [StakingScreen] MECO Balance:', mecoBal.balance);
      console.log('📊 [StakingScreen] USDT Balance:', usdtBal.balance);
      
      setPoolInfo(pool);
      setLpBalance(lpBal);
      setMecoBalance(mecoBal.balance || 0);
      setUsdtBalance(usdtBal.balance || 0);
      setError('');
    } catch (err) {
      console.error('❌ [StakingScreen] فشل تحميل البيانات:', err);
      setError(t('staking.load_error'));
    } finally {
      setLoadingData(false);
    }
  };

  // تحديث التقدير عند تغيير LP في تبويب السحب
  useEffect(() => {
    if (activeTab === 'unstake' && poolInfo && lpBalance > 0) {
      const lpValue = parseFloat(lpAmount) || 0;
      const share = lpValue / lpBalance;
      const mecoShare = (poolInfo.mecoReserve || 0) * share;
      const usdtShare = (poolInfo.usdtReserve || 0) * share;
      setEstimatedReceive({ meco: mecoShare, usdt: usdtShare });
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
      `${mecoVal} MECO + ${usdtVal} USDT`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            setLoading(true);
            setError('');
            try {
              const result = await depositLiquidity(mecoVal, usdtVal);
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
            setError('');
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

  const useMaxMeco = () => setMecoAmount(mecoBalance.toString());
  const useMaxUsdt = () => setUsdtAmount(usdtBalance.toString());
  const useMaxLp = () => setLpAmount(lpBalance.toString());

  const renderError = () => {
    if (!error) return null;
    return (
      <View style={[styles.errorCard, { backgroundColor: colors.error + '15' }]}>
        <Ionicons name="warning" size={20} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      </View>
    );
  };

  if (loadingData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

        {/* بطاقة معلومات المجمع */}
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

        {/* تبويبات */}
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

        {/* محتوى التبويبات */}
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
                onChangeText={setMecoAmount}
              />
              <Text style={[styles.balanceText, { color: colors.textSecondary }]}>
                {t('balance')}: {mecoBalance.toFixed(4)} MECO
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputHeader}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>USDT</Text>
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

        {renderError()}
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
});
