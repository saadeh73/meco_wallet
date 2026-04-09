import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  SafeAreaView, TouchableOpacity, Dimensions, Animated,
  RefreshControl, Linking, Alert, Modal, ScrollView
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { getTransactionHistory } from '../services/heliusService';
import { getTransactionLog } from '../services/transactionLogger';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function TransactionHistoryScreen() {
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const publicKey = useAppStore(state => state.publicKey);
  const isDark = theme === 'dark';

  const colors = useMemo(() => ({
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
  }),[isDark]);

  const[transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const[refreshing, setRefreshing] = useState(false);
  const[selectedTx, setSelectedTx] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  
  const[activeFilter, setActiveFilter] = useState('all');

  const [stats, setStats] = useState({
    sol: { totalSent: 0, totalReceived: 0, totalFees: 0, count: 0 },
    meco: { totalSent: 0, totalReceived: 0, count: 0 },
    usdt: { totalSent: 0, totalReceived: 0, count: 0 },
    usdc: { totalSent: 0, totalReceived: 0, count: 0 },
    other: { totalSent: 0, totalReceived: 0, count: 0 }
  });

  useEffect(() => {
    loadTransactions();
  },[]);

  const withTimeout = (promise, ms = 30000) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), ms)
      )
    ]);
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);

      let localLog =[];
      try {
        localLog = await withTimeout(getTransactionLog(), 8000);
      } catch (e) {
        console.log('⚠️ Failed to load local log:', e.message);
      }

      let onChain =[];
      try {
        const chainData = await withTimeout(getTransactionHistory(20), 30000);
        if (chainData && chainData.length > 0) {
          onChain = chainData.map(tx => ({
            type: tx.type || 'onchain',
            signature: tx.signature,
            blockTime: tx.blockTime,
            slot: tx.slot,
            status: tx.confirmationStatus === 'finalized' ? 'confirmed' : tx.confirmationStatus,
            err: tx.err,
            fee: tx.fee,
            amount: tx.amount,
            from: tx.from,
            to: tx.to,
            token: tx.token, 
            currency: tx.token || 'SOL',
          }));
        }
      } catch (e) {
        console.log('⚠️ Failed to load on-chain data:', e.message);
      }

      const mergedMap = new Map();
      onChain.forEach(tx => mergedMap.set(tx.signature, tx));
      localLog.forEach(tx => {
        if (tx.transactionSignature) {
          mergedMap.set(tx.transactionSignature, {
            ...mergedMap.get(tx.transactionSignature),
            ...tx,
            type: tx.from === publicKey ? 'send' :
                  tx.to === publicKey ? 'receive' :
                  tx.type || 'onchain'
          });
        }
      });

      const all = Array.from(mergedMap.values());
      all.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : (a.blockTime * 1000);
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : (b.blockTime * 1000);
        return timeB - timeA;
      });

      const newStats = {
        sol: { totalSent: 0, totalReceived: 0, totalFees: 0, count: 0 },
        meco: { totalSent: 0, totalReceived: 0, count: 0 },
        usdt: { totalSent: 0, totalReceived: 0, count: 0 },
        usdc: { totalSent: 0, totalReceived: 0, count: 0 },
        other: { totalSent: 0, totalReceived: 0, count: 0 }
      };

      all.forEach(tx => {
        const currency = (tx.token || 'SOL').toLowerCase();
        let target;
        if (currency === 'sol') target = newStats.sol;
        else if (currency === 'meco') target = newStats.meco;
        else if (currency === 'usdt') target = newStats.usdt;
        else if (currency === 'usdc') target = newStats.usdc;
        else target = newStats.other;

        const isSuccess = !tx.err && (tx.status === 'confirmed' || tx.status === 'finalized' || tx.status === 'success' || tx.status === undefined);
        if (isSuccess) {
          if (tx.type === 'send') {
            target.totalSent += (tx.amount || 0);
          } else if (tx.type === 'receive') {
            target.totalReceived += (tx.amount || 0);
          }
          target.count += 1;
          if (currency === 'sol') {
            newStats.sol.totalFees += (tx.fee || 0);
          }
        }
      });

      setStats(newStats);
      setTransactions(all);
    } catch (err) {
      console.error('❌ Unexpected error in loadTransactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadTransactions();
  };

  const openExplorer = async (signature) => {
    if (!signature) {
      Alert.alert(t('error'), t('no_transaction_id'));
      return;
    }
    const url = `https://solscan.io/tx/${signature}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(t('error'), t('cannot_open_link'));
      }
    } catch (error) {
      Alert.alert(t('error'), t('unexpected_error'));
    }
  };

  const copyToClipboard = async (text, message) => {
    if (text) {
      await Clipboard.setStringAsync(text);
      Alert.alert(t('success'), message || t('copied_to_clipboard'));
    }
  };

  const formatDate = useCallback((timestamp, blockTime) => {
    try {
      let date;
      if (timestamp) {
        date = new Date(timestamp);
      } else if (blockTime) {
        date = new Date(blockTime * 1000);
      } else {
        return t('unknown_date');
      }

      if (isNaN(date.getTime())) return t('unknown_date');

      const now = new Date();
      const diff = now - date;

      if (diff < 60 * 1000) return t('just_now');
      if (diff < 60 * 60 * 1000) {
        const mins = Math.floor(diff / (60 * 1000));
        return t('minutes_ago', { count: mins });
      }
      if (diff < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(diff / (60 * 60 * 1000));
        return t('hours_ago', { count: hours });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return t('unknown_date');
    }
  }, [t]);

  const formatAmount = useCallback((amount, token = 'SOL') => {
    if (!amount) return '0 ' + token;
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${token}`;
  },[]);

  const getTransactionType = useCallback((tx) => {
    if (tx.type === 'send') return { icon: 'arrow-up', color: colors.error, label: t('sent'), sign: '-' };
    if (tx.type === 'receive') return { icon: 'arrow-down', color: colors.success, label: t('received'), sign: '+' };
    if (tx.type === 'swap') return { icon: 'swap-horizontal', color: colors.info, label: t('swapped'), sign: '' };
    if (tx.type === 'presale') return { icon: 'rocket', color: colors.warning, label: t('presale'), sign: '+' };
    return { icon: 'receipt', color: colors.textSecondary, label: t('transaction'), sign: '' };
  },[colors, t]);

  const formatDateTime = useCallback((timestamp, blockTime) => {
    try {
      let date;
      if (timestamp) {
        date = new Date(timestamp);
      } else if (blockTime) {
        date = new Date(blockTime * 1000);
      } else {
        return t('unknown_date');
      }
      if (isNaN(date.getTime())) return t('unknown_date');
      return date.toLocaleString();
    } catch {
      return t('unknown_date');
    }
  }, [t]);

  // ==================== التعديل الوحيد المطلوب ====================
  const getStatusInfo = useCallback((tx) => {
    // 1. فشل صريح
    if (tx.err) {
      return { color: colors.error, label: t('failed'), bg: colors.error + '20' };
    }
    
    // 2. نجاح: وجود blockTime دليل قاطع على إدراج المعاملة في كتلة (نجاح مؤكد)
    //    أو وجود حالة صريحة confirmed/finalized/success
    if (tx.blockTime || tx.status === 'confirmed' || tx.status === 'finalized' || tx.status === 'success') {
      return { color: colors.success, label: t('confirmed'), bg: colors.success + '20' };
    }
    
    // 3. الحالات المتبقية (معاملات محلية أو قيد الانتظار)
    return { color: colors.warning, label: t('pending'), bg: colors.warning + '20' };
  }, [colors, t]);
  // ===============================================================

  const renderStats = () => {
    const statsToShow =[];
    if (stats.sol.count > 0 || stats.sol.totalSent > 0 || stats.sol.totalReceived > 0) {
      statsToShow.push({ currency: 'SOL', sent: stats.sol.totalSent, received: stats.sol.totalReceived, count: stats.sol.count, color: primaryColor });
    }
    if (stats.meco.count > 0) statsToShow.push({ currency: 'MECO', sent: stats.meco.totalSent, received: stats.meco.totalReceived, count: stats.meco.count, color: colors.warning });
    if (stats.usdt.count > 0) statsToShow.push({ currency: 'USDT', sent: stats.usdt.totalSent, received: stats.usdt.totalReceived, count: stats.usdt.count, color: colors.success });
    if (stats.usdc.count > 0) statsToShow.push({ currency: 'USDC', sent: stats.usdc.totalSent, received: stats.usdc.totalReceived, count: stats.usdc.count, color: colors.info });

    if (statsToShow.length === 0) return null;

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsContainer}>
        {statsToShow.map((item, index) => (
          <View key={index} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.statIconBadge, { backgroundColor: item.color + '15' }]}>
              <Text style={[styles.statCurrency, { color: item.color }]}>{item.currency}</Text>
            </View>
            <View style={styles.statRow}>
              <Ionicons name="arrow-up" size={14} color={colors.error} />
              <Text style={[styles.statValue, { color: colors.text }]}>{item.sent.toFixed(2)}</Text>
            </View>
            <View style={styles.statRow}>
              <Ionicons name="arrow-down" size={14} color={colors.success} />
              <Text style={[styles.statValue, { color: colors.text }]}>{item.received.toFixed(2)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderTransactionModal = () => (
    <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('transaction_details')}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4, backgroundColor: colors.background, borderRadius: 12 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {selectedTx && (
            <>
              <View style={styles.modalTypeContainer}>
                <View style={[styles.modalIcon, { backgroundColor: getTransactionType(selectedTx).color + '15' }]}>
                  <Ionicons name={getTransactionType(selectedTx).icon} size={32} color={getTransactionType(selectedTx).color} />
                </View>
                <Text style={[styles.modalAmount, { color: colors.text }]}>
                  {getTransactionType(selectedTx).sign} {formatAmount(selectedTx.amount, selectedTx.currency)}
                </Text>
                <Text style={[styles.modalType, { color: getTransactionType(selectedTx).color }]}>
                  {getTransactionType(selectedTx).label}
                </Text>
              </View>

              <View style={styles.modalDetails}>
                {selectedTx.signature && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('signature')}</Text>
                    <View style={styles.detailValueContainer}>
                      <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={1}>
                        {selectedTx.signature.slice(0, 16)}...{selectedTx.signature.slice(-4)}
                      </Text>
                      <TouchableOpacity onPress={() => copyToClipboard(selectedTx.signature, t('signature_copied'))}>
                        <Ionicons name="copy-outline" size={18} color={primaryColor} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('time')}</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {formatDateTime(selectedTx.timestamp, selectedTx.blockTime)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('status')}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusInfo(selectedTx).bg }]}>
                    <Text style={{ color: getStatusInfo(selectedTx).color, fontWeight: 'bold', fontSize: 12 }}>
                      {getStatusInfo(selectedTx).label}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={[styles.modalButton, { backgroundColor: primaryColor }]} onPress={() => openExplorer(selectedTx.signature)}>
                <Ionicons name="open-outline" size={20} color="#FFF" />
                <Text style={styles.modalButtonText}>{t('view_on_solscan')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderItem = ({ item }) => {
    const txType = getTransactionType(item);
    const dateText = formatDate(item.timestamp, item.blockTime);
    const statusInfo = getStatusInfo(item);
    const isPending = !item.signature && !item.transactionSignature;

    return (
      <TouchableOpacity
        style={[styles.itemContainer, { backgroundColor: colors.card }]}
        onPress={() => { setSelectedTx(item); setModalVisible(true); }}
        activeOpacity={0.7}
        disabled={isPending}
      >
        <View style={[styles.iconContainer, { backgroundColor: txType.color + '15' }]}>
          <Ionicons name={txType.icon} size={24} color={txType.color} />
        </View>

        <View style={styles.detailsContainer}>
          <View style={styles.row}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {txType.label}
            </Text>
            {item.amount && (
              <Text style={[styles.amount, { color: txType.color }]}>
                {txType.sign} {formatAmount(item.amount, item.currency)}
              </Text>
            )}
          </View>

          <View style={styles.row}>
            <Text style={[styles.date, { color: colors.textSecondary }]}>{dateText}</Text>
            <View style={styles.statusContainer}>
              {isPending ? (
                <ActivityIndicator size="small" color={colors.warning} />
              ) : (
                <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredTransactions = transactions.filter(tx => {
    if (activeFilter === 'all') return true;
    return tx.type === activeFilter;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('transaction_history_title')}</Text>
        <TouchableOpacity onPress={onRefresh} style={[styles.refreshBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="refresh" size={22} color={primaryColor} />
        </TouchableOpacity>
      </View>

      {!loading && transactions.length > 0 && renderStats()}

      <View style={styles.filtersWrapper}>
        <TouchableOpacity 
          style={[styles.filterChip, activeFilter === 'all' ? { backgroundColor: primaryColor } : { backgroundColor: colors.card }]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterText, { color: activeFilter === 'all' ? '#FFF' : colors.textSecondary }]}>{t('all', 'الكل')}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterChip, activeFilter === 'receive' ? { backgroundColor: colors.success } : { backgroundColor: colors.card }]}
          onPress={() => setActiveFilter('receive')}
        >
          <Ionicons name="arrow-down" size={14} color={activeFilter === 'receive' ? '#FFF' : colors.textSecondary} style={{marginRight: 4}}/>
          <Text style={[styles.filterText, { color: activeFilter === 'receive' ? '#FFF' : colors.textSecondary }]}>{t('received', 'مستلم')}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterChip, activeFilter === 'send' ? { backgroundColor: colors.error } : { backgroundColor: colors.card }]}
          onPress={() => setActiveFilter('send')}
        >
          <Ionicons name="arrow-up" size={14} color={activeFilter === 'send' ? '#FFF' : colors.textSecondary} style={{marginRight: 4}}/>
          <Text style={[styles.filterText, { color: activeFilter === 'send' ? '#FFF' : colors.textSecondary }]}>{t('sent', 'مرسل')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('loading_transactions')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item, i) => item.signature || item.transactionSignature || `tx_${i}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
                <Ionicons name="receipt-outline" size={48} color={colors.textSecondary + '50'} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('no_activity_yet')}</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{t('transactions_will_appear_here')}</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
        />
      )}

      {renderTransactionModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  refreshBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  statsContainer: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  statCard: { width: 140, padding: 16, borderRadius: 20, borderWidth: 1, elevation: 2, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 5 },
  statIconBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 12 },
  statCurrency: { fontSize: 14, fontWeight: '800' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  statValue: { fontSize: 15, fontWeight: '700' },
  filtersWrapper: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 10 },
  filterChip: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 },
  filterText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, fontWeight: '500' },
  itemContainer: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  iconContainer: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  detailsContainer: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '700' },
  amount: { fontSize: 16, fontWeight: '700' },
  date: { fontSize: 13, fontWeight: '500' },
  statusContainer: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '800' },
  modalTypeContainer: { alignItems: 'center', marginBottom: 30 },
  modalIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  modalAmount: { fontSize: 32, fontWeight: '800', marginBottom: 8 },
  modalType: { fontSize: 16, fontWeight: '600', letterSpacing: 1 },
  modalDetails: { backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 20, padding: 16, marginBottom: 24 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  detailLabel: { fontSize: 15, fontWeight: '500' },
  detailValueContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailValue: { fontSize: 15, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  modalButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, gap: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  modalButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptySubtitle: { fontSize: 15, textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 }
});
