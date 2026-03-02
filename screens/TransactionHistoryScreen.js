import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  SafeAreaView, TouchableOpacity, Dimensions, Animated,
  RefreshControl, Linking, Alert, Modal
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
  }), [isDark]);

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // إحصائيات منفصلة لكل عملة
  const [stats, setStats] = useState({
    sol: { totalSent: 0, totalReceived: 0, totalFees: 0, count: 0 },
    meco: { totalSent: 0, totalReceived: 0, count: 0 },
    usdt: { totalSent: 0, totalReceived: 0, count: 0 },
    usdc: { totalSent: 0, totalReceived: 0, count: 0 },
    other: { totalSent: 0, totalReceived: 0, count: 0 }
  });

  useEffect(() => {
    loadTransactions();
  }, []);

  const withTimeout = (promise, ms = 10000) => {
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

      let localLog = [];
      try {
        localLog = await withTimeout(getTransactionLog(), 8000);
      } catch (e) {
        console.log('⚠️ Failed to load local log:', e.message);
      }

      let onChain = [];
      try {
        const chainData = await withTimeout(getTransactionHistory(20), 10000);
        if (chainData && chainData.length > 0) {
          onChain = chainData.map(tx => ({
            type: 'onchain',
            signature: tx.signature,
            blockTime: tx.blockTime,
            slot: tx.slot,
            status: tx.confirmationStatus === 'finalized' ? 'confirmed' : tx.confirmationStatus,
            err: tx.err,
            fee: tx.fee,
            amount: tx.amount,
            from: tx.from,
            to: tx.to,
            token: tx.token, // 'SOL', 'MECO', 'USDT', 'USDC', 'TOKEN'
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

      // حساب الإحصائيات بشكل منفصل لكل عملة
      const newStats = {
        sol: { totalSent: 0, totalReceived: 0, totalFees: 0, count: 0 },
        meco: { totalSent: 0, totalReceived: 0, count: 0 },
        usdt: { totalSent: 0, totalReceived: 0, count: 0 },
        usdc: { totalSent: 0, totalReceived: 0, count: 0 },
        other: { totalSent: 0, totalReceived: 0, count: 0 }
      };

      all.forEach(tx => {
        // تحديد العملة
        const currency = (tx.token || 'SOL').toLowerCase();
        let target;
        if (currency === 'sol') target = newStats.sol;
        else if (currency === 'meco') target = newStats.meco;
        else if (currency === 'usdt') target = newStats.usdt;
        else if (currency === 'usdc') target = newStats.usdc;
        else target = newStats.other;

        // نأخذ المعاملات الناجحة فقط
        const isSuccess = !tx.err && (tx.status === 'confirmed' || tx.status === 'finalized' || tx.status === undefined);
        if (isSuccess) {
          if (tx.type === 'send') {
            target.totalSent += (tx.amount || 0);
          } else if (tx.type === 'receive') {
            target.totalReceived += (tx.amount || 0);
          }
          target.count += 1;
          // الرسوم فقط لـ SOL
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
  }, []);

  const getTransactionType = useCallback((tx) => {
    if (tx.type === 'send') return { icon: 'arrow-up', color: colors.error, label: t('sent') };
    if (tx.type === 'receive') return { icon: 'arrow-down', color: colors.success, label: t('received') };
    if (tx.type === 'swap') return { icon: 'swap-horizontal', color: colors.info, label: t('swapped') };
    if (tx.type === 'presale') return { icon: 'rocket', color: colors.warning, label: t('presale') };
    return { icon: 'receipt', color: colors.textSecondary, label: t('transaction') };
  }, [colors, t]);

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

  const getStatusInfo = useCallback((tx) => {
    if (tx.err) return { color: colors.error, label: t('failed'), bg: colors.error + '20' };
    if (tx.status === 'confirmed' || tx.status === 'finalized') return { color: colors.success, label: t('confirmed'), bg: colors.success + '20' };
    return { color: colors.warning, label: t('pending'), bg: colors.warning + '20' };
  }, [colors, t]);

  // عرض بطاقات الإحصائيات بشكل منفصل لكل عملة
  const renderStats = () => {
    // نعرض فقط العملات التي لديها معاملات (count>0) أو أي عملة نريد إظهارها حتى لو صفر
    const statsToShow = [];

    if (stats.sol.count > 0 || stats.sol.totalSent > 0 || stats.sol.totalReceived > 0) {
      statsToShow.push({
        currency: 'SOL',
        sent: stats.sol.totalSent,
        received: stats.sol.totalReceived,
        fees: stats.sol.totalFees,
        count: stats.sol.count,
        color: colors.text,
      });
    }
    if (stats.meco.count > 0) {
      statsToShow.push({
        currency: 'MECO',
        sent: stats.meco.totalSent,
        received: stats.meco.totalReceived,
        count: stats.meco.count,
        color: colors.warning,
      });
    }
    if (stats.usdt.count > 0) {
      statsToShow.push({
        currency: 'USDT',
        sent: stats.usdt.totalSent,
        received: stats.usdt.totalReceived,
        count: stats.usdt.count,
        color: colors.success,
      });
    }
    if (stats.usdc.count > 0) {
      statsToShow.push({
        currency: 'USDC',
        sent: stats.usdc.totalSent,
        received: stats.usdc.totalReceived,
        count: stats.usdc.count,
        color: colors.info,
      });
    }
    if (stats.other.count > 0) {
      statsToShow.push({
        currency: t('other_tokens'),
        sent: stats.other.totalSent,
        received: stats.other.totalReceived,
        count: stats.other.count,
        color: colors.textSecondary,
      });
    }

    if (statsToShow.length === 0) return null;

    return (
      <View style={styles.statsContainer}>
        {statsToShow.map((item, index) => (
          <View key={index} style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statCurrency, { color: item.color }]}>{item.currency}</Text>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('sent')}</Text>
              <Text style={[styles.statValue, { color: colors.error }]}>
                {item.sent.toFixed(4)} {item.currency === 'SOL' ? '' : ''}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('received')}</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {item.received.toFixed(4)}
              </Text>
            </View>
            {item.currency === 'SOL' && (
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('fees')}</Text>
                <Text style={[styles.statValue, { color: colors.warning }]}>
                  {item.fees.toFixed(6)} SOL
                </Text>
              </View>
            )}
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('count')}</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{item.count}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderTransactionModal = () => (
    <Modal
      visible={modalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('transaction_details')}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {selectedTx && (
            <>
              <View style={styles.modalTypeContainer}>
                <View style={[styles.modalIcon, { backgroundColor: getTransactionType(selectedTx).color + '20' }]}>
                  <Ionicons name={getTransactionType(selectedTx).icon} size={32} color={getTransactionType(selectedTx).color} />
                </View>
                <Text style={[styles.modalAmount, { color: colors.text }]}>
                  {formatAmount(selectedTx.amount, selectedTx.currency)}
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
                        {selectedTx.signature.slice(0, 20)}...
                      </Text>
                      <TouchableOpacity onPress={() => copyToClipboard(selectedTx.signature, t('signature_copied'))}>
                        <Ionicons name="copy-outline" size={18} color={primaryColor} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {selectedTx.from && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('from')}</Text>
                    <View style={styles.detailValueContainer}>
                      <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={1}>
                        {selectedTx.from.slice(0, 20)}...
                      </Text>
                      <TouchableOpacity onPress={() => copyToClipboard(selectedTx.from, t('address_copied'))}>
                        <Ionicons name="copy-outline" size={18} color={primaryColor} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {selectedTx.to && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('to')}</Text>
                    <View style={styles.detailValueContainer}>
                      <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={1}>
                        {selectedTx.to.slice(0, 20)}...
                      </Text>
                      <TouchableOpacity onPress={() => copyToClipboard(selectedTx.to, t('address_copied'))}>
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
                    <Text style={{ color: getStatusInfo(selectedTx).color, fontWeight: '600', fontSize: 12 }}>
                      {getStatusInfo(selectedTx).label}
                    </Text>
                  </View>
                </View>

                {selectedTx.fee != null && selectedTx.fee > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('fee')}</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {selectedTx.fee.toFixed(6)} SOL
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: primaryColor }]}
                  onPress={() => openExplorer(selectedTx.signature)}
                >
                  <Ionicons name="open-outline" size={20} color="#FFF" />
                  <Text style={styles.modalButtonText}>{t('view_on_solscan')}</Text>
                </TouchableOpacity>
              </View>
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
        onPress={() => {
          setSelectedTx(item);
          setModalVisible(true);
        }}
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
              <Text style={[styles.amount, { color: colors.text }]}>
                {formatAmount(item.amount, item.currency)}
              </Text>
            )}
          </View>

          <View style={styles.row}>
            <Text style={[styles.date, { color: colors.textSecondary }]}>{dateText}</Text>
            <View style={styles.statusContainer}>
              {isPending ? (
                <>
                  <ActivityIndicator size="small" color={colors.warning} style={{marginRight: 4}} />
                  <Text style={{fontSize: 11, color: colors.warning}}>{t('pending')}</Text>
                </>
              ) : (
                <>
                  <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
                  <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {!isPending && <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('transaction_analytics')}</Text>
        <TouchableOpacity onPress={onRefresh} style={[styles.refreshBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="refresh" size={20} color={primaryColor} />
        </TouchableOpacity>
      </View>

      {!loading && transactions.length > 0 && renderStats()}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('loading_transactions')}</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item, i) => item.signature || item.transactionSignature || `tx_${i}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={[styles.sectionTitle, { color: colors.text }]}>{t('recent_activity')}</Text>}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
                <Ionicons name="analytics-outline" size={48} color={colors.textSecondary + '80'} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('no_activity_yet')}</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{t('transactions_will_appear_here')}</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={primaryColor}
              colors={[primaryColor]}
            />
          }
        />
      )}

      {renderTransactionModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  refreshBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  statsContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  statCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
    elevation: 2
  },
  statCurrency: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 14, fontWeight: '500' },

  list: { padding: 20, paddingTop: 0, paddingBottom: 100 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, marginTop: 10 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },

  itemContainer: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2
  },
  iconContainer: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', marginRight: 12
  },
  detailsContainer: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '600' },
  amount: { fontSize: 14, fontWeight: '500' },
  date: { fontSize: 12 },
  statusContainer: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusText: { fontSize: 11, fontWeight: '500' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalTypeContainer: { alignItems: 'center', marginBottom: 24 },
  modalIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  modalAmount: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  modalType: { fontSize: 16, fontWeight: '500' },
  modalDetails: { marginBottom: 20 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)'
  },
  detailLabel: { fontSize: 14, flex: 1 },
  detailValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 2,
    justifyContent: 'flex-end'
  },
  detailValue: { fontSize: 14, fontWeight: '500' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  modalActions: { marginTop: 10 },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 8
  },
  modalButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }
});
