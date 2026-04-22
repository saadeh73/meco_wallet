import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, ScrollView, Alert, ActivityIndicator, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { checkBalance } from '../services/swapService';
import { stakeMeco, unstakeMeco, getUserStakingData } from '../services/stakingService';

// باقات التخزين
const STAKING_PLANS = [
  { id: 'flex', nameKey: 'plan_flex', apy: 15, durationKey: 'plan_flex_duration' },
  { id: '30d', nameKey: 'plan_30d', apy: 25, durationKey: 'plan_30d_duration' },
  { id: '60d', nameKey: 'plan_60d', apy: 40, durationKey: 'plan_60d_duration' },
];

const VIP_THRESHOLD = 10000;

export default function StakingScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const walletPublicKey = useAppStore(state => state.walletPublicKey);
  const walletPrivateKey = useAppStore(state => state.walletPrivateKey);

  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    gold: '#FFD700',
    error: '#EF4444',
    success: '#10B981',
  };

  const [activeTab, setActiveTab] = useState('stake');
  const [selectedPlan, setSelectedPlan] = useState(STAKING_PLANS[1]);
  const [mecoBalance, setMecoBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [stakingData, setStakingData] = useState({ stakedAmount: 0, pendingRewards: 0 });

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      if (walletPublicKey) {
        const data = await getUserStakingData(walletPublicKey);
        setStakingData(data);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [walletPublicKey]);

  const loadData = async () => {
    if (!walletPublicKey) return;
    try {
      const mecoBal = await checkBalance('MECO', 0, walletPublicKey);
      setMecoBalance(mecoBal.balance || 0);
      const sData = await getUserStakingData(walletPublicKey);
      setStakingData(sData);
    } catch (err) {
      console.warn('Failed to load staking data');
    }
  };

  const handleStake = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      return Alert.alert(t('staking.error'), t('staking.enter_valid_amount'));
    }
    if (val > mecoBalance) {
      return Alert.alert(t('staking.error'), t('staking.insufficient_balance'));
    }
    if (!walletPrivateKey) {
      return Alert.alert(t('staking.error'), t('staking.wallet_not_connected'));
    }

    const planName = t(`staking.${selectedPlan.nameKey}`);
    Alert.alert(
      t('staking.confirm_stake'),
      t('staking.stake_confirmation_message', { val, planName }),
      [
        { text: t('staking.cancel'), style: 'cancel' },
        {
          text: t('staking.confirm'),
          onPress: async () => {
            setLoading(true);
            const res = await stakeMeco(walletPrivateKey, val, selectedPlan.apy, selectedPlan.id);
            if (res.success) {
              Alert.alert(t('staking.success'), t('staking.stake_success'));
              setAmount('');
              loadData();
            } else {
              // استخدم مفتاح الترجمة إذا وجد، وإلا استخدم نص الخطأ العادي
              const errorMsg = res.errorKey ? t(res.errorKey) : res.error;
              Alert.alert(t('staking.failed'), errorMsg);
            }
            setLoading(false);
          }
        }
      ]
    );
  };

  const handleUnstake = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      return Alert.alert(t('staking.error'), t('staking.enter_valid_amount'));
    }
    if (val > stakingData.stakedAmount) {
      return Alert.alert(t('staking.error'), t('staking.insufficient_balance'));
    }

    Alert.alert(
      t('staking.request_unstake'),
      t('staking.unstake_confirmation_message', { val }),
      [
        { text: t('staking.cancel'), style: 'cancel' },
        {
          text: t('staking.confirm'),
          onPress: async () => {
            setLoading(true);
            const res = await unstakeMeco(walletPrivateKey, val);
            if (res.success) {
              Alert.alert(t('staking.request_sent'), res.message);
              setAmount('');
              loadData();
            } else {
              const errorMsg = res.errorKey ? t(res.errorKey) : res.error;
              Alert.alert(t('staking.failed'), errorMsg);
            }
            setLoading(false);
          }
        }
      ]
    );
  };

  const getPlanName = (plan) => t(`staking.${plan.nameKey}`);
  const getPlanDuration = (plan) => t(`staking.${plan.durationKey}`);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>{t('staking.title')}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* VIP Banner */}
        <View style={[styles.vipBanner, { backgroundColor: colors.gold + '20', borderColor: colors.gold }]}>
          <Ionicons name="diamond" size={28} color={colors.gold} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.vipTitle, { color: colors.gold }]}>{t('staking.vip_title')}</Text>
            <Text style={[styles.vipText, { color: colors.text }]}>
              {t('staking.vip_description', { amount: VIP_THRESHOLD.toLocaleString() })}
            </Text>
          </View>
        </View>

        {/* User Stats */}
        <View style={[styles.statsCard, { backgroundColor: colors.card }]}>
          <View style={styles.statBox}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('staking.available_to_stake')}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{mecoBalance.toFixed(2)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('staking.currently_staked')}</Text>
            <Text style={[styles.statValue, { color: primaryColor }]}>{stakingData.stakedAmount.toFixed(2)}</Text>
          </View>
        </View>

        {/* Rewards */}
        <View style={[styles.rewardsCard, { backgroundColor: primaryColor + '15', borderColor: primaryColor }]}>
          <Ionicons name="gift" size={24} color={primaryColor} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={[styles.rewardsLabel, { color: colors.textSecondary }]}>{t('staking.accumulated_rewards')}</Text>
            <Text style={[styles.rewardsValue, { color: primaryColor }]}>
              {t('staking.rewards_value', { rewards: stakingData.pendingRewards.toFixed(6) })}
            </Text>
          </View>
          <TouchableOpacity style={[styles.harvestBtn, { backgroundColor: primaryColor }]}>
            <Text style={styles.harvestText}>{t('staking.harvest')}</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stake' && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => { setActiveTab('stake'); setAmount(''); }}
          >
            <Text style={[styles.tabText, { color: activeTab === 'stake' ? primaryColor : colors.textSecondary }]}>
              {t('staking.stake_tab')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'unstake' && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => { setActiveTab('unstake'); setAmount(''); }}
          >
            <Text style={[styles.tabText, { color: activeTab === 'unstake' ? primaryColor : colors.textSecondary }]}>
              {t('staking.unstake_tab')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.mainCard, { backgroundColor: colors.card }]}>
          {activeTab === 'stake' && (
            <View style={styles.plansContainer}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('staking.choose_plan')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {STAKING_PLANS.map(plan => {
                  const isSelected = selectedPlan.id === plan.id;
                  return (
                    <TouchableOpacity
                      key={plan.id}
                      style={[
                        styles.planCard,
                        {
                          backgroundColor: isSelected ? primaryColor + '20' : colors.background,
                          borderColor: isSelected ? primaryColor : colors.border
                        }
                      ]}
                      onPress={() => setSelectedPlan(plan)}
                    >
                      <Text style={[styles.planApy, { color: isSelected ? primaryColor : colors.success }]}>
                        {plan.apy}% APY
                      </Text>
                      <Text style={[styles.planName, { color: colors.text }]}>{getPlanName(plan)}</Text>
                      <Text style={[styles.planDuration, { color: colors.textSecondary }]}>{getPlanDuration(plan)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.inputContainer}>
            <View style={styles.inputHeader}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('staking.amount_label')}</Text>
              <TouchableOpacity
                onPress={() =>
                  setAmount(
                    activeTab === 'stake' ? mecoBalance.toString() : stakingData.stakedAmount.toString()
                  )
                }
              >
                <Text style={[styles.maxText, { color: primaryColor }]}>{t('staking.max')}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
              <Text style={[styles.currencyLabel, { color: colors.text }]}>MECO</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: primaryColor, opacity: loading ? 0.7 : 1 }]}
            onPress={activeTab === 'stake' ? handleStake : handleUnstake}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.actionBtnText}>
                {activeTab === 'stake' ? t('staking.confirm_stake') : t('staking.request_unstake')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  backBtn: { padding: 5 },
  title: { fontSize: 24, fontWeight: 'bold' },
  vipBanner: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  vipTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  vipText: { fontSize: 13, lineHeight: 20 },
  statsCard: { flexDirection: 'row', borderRadius: 16, padding: 20, marginBottom: 16 },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#333', marginHorizontal: 10 },
  statLabel: { fontSize: 14, marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: 'bold' },
  rewardsCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 24 },
  rewardsLabel: { fontSize: 12, marginBottom: 4 },
  rewardsValue: { fontSize: 18, fontWeight: 'bold' },
  harvestBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  harvestText: { color: '#FFF', fontWeight: 'bold' },
  tabContainer: { flexDirection: 'row', borderRadius: 16, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 16, fontWeight: 'bold' },
  mainCard: { borderRadius: 16, padding: 20 },
  plansContainer: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  planCard: { width: 110, padding: 16, borderRadius: 12, borderWidth: 1, marginRight: 12, alignItems: 'center' },
  planApy: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  planName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  planDuration: { fontSize: 12 },
  inputContainer: { marginBottom: 24 },
  inputHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  inputLabel: { fontSize: 14 },
  maxText: { fontSize: 14, fontWeight: 'bold' },
  inputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16 },
  input: { flex: 1, height: 56, fontSize: 18 },
  currencyLabel: { fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  actionBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
});
