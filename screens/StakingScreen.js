import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  SafeAreaView, ScrollView, Alert, ActivityIndicator, Linking
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { checkBalance } from '../services/swapService';
import { stakeMeco, unstakeMeco, getUserStakingData } from '../services/stakingService';
import { getSolPriceUsd } from '../services/jupiterMarketService';

const STAKING_PLANS = [
  { id: 'flex', nameKey: 'plan_flex', apy: 15, durationKey: 'plan_flex_duration' },
  { id: '30d',  nameKey: 'plan_30d',  apy: 25, durationKey: 'plan_30d_duration'  },
  { id: '60d',  nameKey: 'plan_60d',  apy: 40, durationKey: 'plan_60d_duration'  },
];

const STAKING_TREASURY_ADDRESS = 'FoNBts4U25jm1YbZ3siT5hHzCmfuvrkzsRRJ4MWQkMQs';
// رسوم المنصة الثابتة — نفس القيمة المطبّقة في Send/Swap/Trading
const PLATFORM_FEE_SOL = 0.0005;

export default function StakingScreen() {
  const navigation   = useNavigation();
  const { t }        = useTranslation();
  const theme        = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';
  const isMounted    = useRef(true);

  const activeAccount = useAppStore(state => {
    const accounts = state.accounts;
    const idx      = state.activeAccountIndex;
    return accounts.length > 0 ? accounts[idx] : null;
  });
  const walletPrivateKey = useAppStore(state => state.walletPrivateKey);

  const colors = {
    background:    isDark ? '#0A0A0F' : '#F8FAFD',
    card:          isDark ? '#1A1A2E' : '#FFFFFF',
    text:          isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border:        isDark ? '#2A2A3E' : '#E5E7EB',
    error:         '#EF4444',
    success:       '#10B981',
    info:          '#3B82F6',
  };

  const [activeTab,    setActiveTab]    = useState('stake');
  const [selectedPlan, setSelectedPlan] = useState(STAKING_PLANS[1]);
  const [mecoBalance,  setMecoBalance]  = useState(0);
  const [amount,       setAmount]       = useState('');
  const [loading,      setLoading]      = useState(false);
  const [stakingData,  setStakingData]  = useState({ stakedAmount: 0, pendingRewards: 0 });
  const [solPriceUsd,  setSolPriceUsd]  = useState(0);

  useEffect(() => {
    getSolPriceUsd().then(p => setSolPriceUsd(p || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    isMounted.current = true;
    loadData();
    const interval = setInterval(async () => {
      if (activeAccount?.publicKey) {
        try {
          const data = await getUserStakingData(activeAccount.publicKey);
          if (isMounted.current) setStakingData(data);
        } catch (_) {}
      }
    }, 30000);
    return () => { isMounted.current = false; clearInterval(interval); };
  }, [activeAccount?.publicKey]);

  const loadData = async () => {
    if (!activeAccount?.publicKey) return;
    try {
      const [mecoBal, sData] = await Promise.all([
        checkBalance('MECO', 0, activeAccount.publicKey),
        getUserStakingData(activeAccount.publicKey),
      ]);
      if (isMounted.current) {
        setMecoBalance(mecoBal.balance || 0);
        setStakingData(sData);
      }
    } catch (_) { console.warn('Failed to load staking data'); }
  };

  const getFeeNotice = () => {
    const feeUsdText = solPriceUsd > 0 ? ` (≈ $${(PLATFORM_FEE_SOL * solPriceUsd).toFixed(2)})` : '';
    return t('staking.platform_fee_notice', {
      fee: PLATFORM_FEE_SOL,
      feeUsd: feeUsdText,
      defaultValue: `رسوم المنصة: {{fee}} SOL{{feeUsd}} بالإضافة إلى رسوم شبكة سولانا`,
    });
  };

  const handleStake = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return Alert.alert(t('staking.error'), t('staking.enter_valid_amount'));
    if (val > mecoBalance)       return Alert.alert(t('staking.error'), t('staking.insufficient_balance'));

    Alert.alert(
      t('staking.confirm_stake'),
      `${t('staking.stake_confirmation_message', { val, planName: t(`staking.${selectedPlan.nameKey}`) })}\n\n${getFeeNotice()}`,
      [
        { text: t('staking.cancel'), style: 'cancel' },
        { text: t('staking.confirm'), onPress: async () => {
            setLoading(true);
            try {
              // ✅ جلب المفتاح الخاص بشكل مؤكد وآمن لحظة التنفيذ
              const privateKey = await useAppStore.getState().getPrivateKeyForAccount(activeAccount?.index);
              if (!privateKey) {
                Alert.alert(t('staking.error'), t('staking.wallet_not_connected'));
                return;
              }

              const res = await stakeMeco(privateKey, val, selectedPlan.apy, selectedPlan.id);
              if (res.success) { 
                Alert.alert(t('staking.success'), t('staking.stake_success')); 
                setAmount(''); 
                loadData(); 
              } else {
                Alert.alert(t('staking.failed'), res.errorKey ? t(res.errorKey) : res.error);
              }
            } catch (err) {
              // ✅ إظهار الأخطاء غير المتوقعة للمستخدم
              Alert.alert(t('staking.error'), err.message || t('unexpected_error'));
            }
            finally { if (isMounted.current) setLoading(false); }
        }},
      ]
    );
  };

  const handleUnstake = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0)         return Alert.alert(t('staking.error'), t('staking.enter_valid_amount'));
    if (val > stakingData.stakedAmount) return Alert.alert(t('staking.error'), t('staking.insufficient_balance'));

    Alert.alert(
      t('staking.request_unstake'),
      `${t('staking.unstake_confirmation_message', { val })}\n\n${getFeeNotice()}`,
      [
        { text: t('staking.cancel'), style: 'cancel' },
        { text: t('staking.confirm'), onPress: async () => {
            setLoading(true);
            try {
              // ✅ جلب المفتاح الخاص بشكل مؤكد وآمن لحظة التنفيذ
              const privateKey = await useAppStore.getState().getPrivateKeyForAccount(activeAccount?.index);
              if (!privateKey) {
                Alert.alert(t('staking.error'), t('staking.wallet_not_connected'));
                return;
              }

              const res = await unstakeMeco(privateKey, val);
              if (res.success) { 
                Alert.alert(t('staking.request_sent'), res.message); 
                setAmount(''); 
                loadData(); 
              } else {
                Alert.alert(t('staking.failed'), res.errorKey ? t(res.errorKey) : res.error);
              }
            } catch (err) {
              // ✅ إظهار الأخطاء غير المتوقعة للمستخدم
              Alert.alert(t('staking.error'), err.message || t('unexpected_error'));
            }
            finally { if (isMounted.current) setLoading(false); }
        }},
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>{t('staking.title')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.transparencyBanner, { backgroundColor: primaryColor + '15', borderColor: primaryColor }]}>
          <View style={styles.transparencyHeader}>
            <Ionicons name="shield-checkmark" size={24} color={primaryColor} />
            <Text style={[styles.transparencyTitle, { color: primaryColor }]}>{t('staking.vip_title')}</Text>
          </View>
          <Text style={[styles.transparencyText, { color: colors.text }]}>{t('staking.vip_description')}</Text>
          <View style={[styles.treasuryAddressContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.treasuryAddressText, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="middle">
              {STAKING_TREASURY_ADDRESS}
            </Text>
            <View style={styles.treasuryActions}>
              <TouchableOpacity onPress={() => { Clipboard.setStringAsync(STAKING_TREASURY_ADDRESS); Alert.alert(t('success'), t('copied_to_clipboard')); }} style={styles.iconBtn}>
                <Ionicons name="copy-outline" size={18} color={primaryColor} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL(`https://solscan.io/account/${STAKING_TREASURY_ADDRESS}`)} style={styles.iconBtn}>
                <Ionicons name="open-outline" size={18} color={primaryColor} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={[styles.statsCard, { backgroundColor: colors.card }]}>
          <View style={styles.statBox}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('staking.available_to_stake')}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{mecoBalance.toFixed(2)}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statBox}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('staking.currently_staked')}</Text>
            <Text style={[styles.statValue, { color: primaryColor }]}>{stakingData.stakedAmount.toFixed(2)}</Text>
          </View>
        </View>

        <View style={[styles.rewardsCard, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
          <Ionicons name="gift" size={24} color={colors.success} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={[styles.rewardsLabel, { color: colors.textSecondary }]}>{t('staking.accumulated_rewards')}</Text>
            <Text style={[styles.rewardsValue, { color: colors.success }]}>{t('staking.rewards_value', { rewards: stakingData.pendingRewards.toFixed(6) })}</Text>
          </View>
        </View>

        <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
          {[{ id: 'stake', key: 'staking.stake_tab' }, { id: 'unstake', key: 'staking.unstake_tab' }].map(tab => (
            <TouchableOpacity key={tab.id} style={[styles.tab, activeTab === tab.id && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]} onPress={() => { setActiveTab(tab.id); setAmount(''); }}>
              <Text style={[styles.tabText, { color: activeTab === tab.id ? primaryColor : colors.textSecondary }]}>{t(tab.key)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.mainCard, { backgroundColor: colors.card }]}>
          {activeTab === 'stake' && (
            <View style={styles.plansContainer}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('staking.choose_plan')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {STAKING_PLANS.map(plan => {
                  const sel = selectedPlan.id === plan.id;
                  return (
                    <TouchableOpacity key={plan.id} style={[styles.planCard, { backgroundColor: sel ? primaryColor + '20' : colors.background, borderColor: sel ? primaryColor : colors.border }]} onPress={() => setSelectedPlan(plan)}>
                      <Text style={[styles.planApy,      { color: sel ? primaryColor : colors.success }]}>{plan.apy}% APY</Text>
                      <Text style={[styles.planName,     { color: colors.text }]}>{t(`staking.${plan.nameKey}`)}</Text>
                      <Text style={[styles.planDuration, { color: colors.textSecondary }]}>{t(`staking.${plan.durationKey}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.inputContainer}>
            <View style={styles.inputHeader}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('staking.amount_label')}</Text>
              <TouchableOpacity onPress={() => setAmount(activeTab === 'stake' ? mecoBalance.toString() : stakingData.stakedAmount.toString())}>
                <Text style={[styles.maxText, { color: primaryColor }]}>{t('staking.max')}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TextInput style={[styles.input, { color: colors.text }]} placeholder="0.00" placeholderTextColor={colors.textSecondary} keyboardType="numeric" value={amount} onChangeText={setAmount} />
              <Text style={[styles.currencyLabel, { color: colors.text }]}>MECO</Text>
            </View>
            <Text style={[styles.feeHintText, { color: colors.textSecondary }]}>
              {t('staking.platform_fee_label', { defaultValue: 'رسوم المنصة' })}: {PLATFORM_FEE_SOL} SOL
              {solPriceUsd > 0 ? ` (≈ $${(PLATFORM_FEE_SOL * solPriceUsd).toFixed(2)})` : ''}
            </Text>
          </View>

          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: primaryColor, opacity: loading ? 0.7 : 1 }]} onPress={activeTab === 'stake' ? handleStake : handleUnstake} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.actionBtnText}>{activeTab === 'stake' ? t('staking.confirm_stake') : t('staking.request_unstake')}</Text>}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:                { flex: 1 },
  content:                  { padding: 20 },
  header:                   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  backBtn:                  { padding: 5 },
  title:                    { fontSize: 24, fontWeight: 'bold' },
  transparencyBanner:       { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  transparencyHeader:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  transparencyTitle:        { fontSize: 16, fontWeight: 'bold' },
  transparencyText:         { fontSize: 13, lineHeight: 22, marginBottom: 12 },
  treasuryAddressContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  treasuryAddressText:      { flex: 1, fontSize: 12, marginRight: 10 },
  treasuryActions:          { flexDirection: 'row', gap: 10 },
  iconBtn:                  { padding: 4 },
  statsCard:                { flexDirection: 'row', borderRadius: 16, padding: 20, marginBottom: 16 },
  statBox:                  { flex: 1, alignItems: 'center' },
  statDivider:              { width: 1, marginHorizontal: 10 },
  statLabel:                { fontSize: 14, marginBottom: 8 },
  statValue:                { fontSize: 22, fontWeight: 'bold' },
  rewardsCard:              { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 24 },
  rewardsLabel:             { fontSize: 12, marginBottom: 4 },
  rewardsValue:             { fontSize: 18, fontWeight: 'bold' },
  tabContainer:             { flexDirection: 'row', borderRadius: 16, marginBottom: 16 },
  tab:                      { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText:                  { fontSize: 16, fontWeight: 'bold' },
  mainCard:                 { borderRadius: 16, padding: 20 },
  plansContainer:           { marginBottom: 24 },
  sectionTitle:             { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  planCard:                 { width: 110, padding: 16, borderRadius: 12, borderWidth: 1, marginRight: 12, alignItems: 'center' },
  planApy:                  { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  planName:                 { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  planDuration:             { fontSize: 12 },
  inputContainer:           { marginBottom: 24 },
  inputHeader:              { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  inputLabel:               { fontSize: 14 },
  feeHintText:              { fontSize: 11, marginTop: 8, fontWeight: '600' },
  maxText:                  { fontSize: 14, fontWeight: 'bold' },
  inputBox:                 { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16 },
  input:                    { flex: 1, height: 56, fontSize: 18 },
  currencyLabel:            { fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  actionBtn:                { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  actionBtnText:            { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
});
