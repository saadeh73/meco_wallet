// TransactionHistoryScreen.js - شاشة سجل المعاملات المحسنة (مصححة)
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator,
  SafeAreaView, TouchableOpacity, Dimensions, Animated,
  RefreshControl, Linking, Alert, Modal, ScrollView
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';
import { getTransactionHistory } from '../services/heliusService';
import { getTransactionLog } from '../services/transactionLogger';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function TransactionHistoryScreen() {
  const navigation = useNavigation();
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
    successLight: '#10B98120',
    error: '#EF4444',
    errorLight: '#EF444420',
    warning: '#F59E0B',
    warningLight: '#F59E0B20',
    info: '#3B82F6',
    infoLight: '#3B82F620',
  }),[isDark]);

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

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

      let localLog = [];
      try {
        localLog = await withTimeout(getTransactionLog(), 8000);
      } catch (e) {
        console.log('⚠️ Failed to load local log:', e.message);
      }

      let onChain = [];
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
      
      // ✅ إصلاح: نوع المعاملة مع أقواس صحيحة
      localLog.forEach(tx => {
        if (tx.transactionSignature) {
          mergedMap.set(tx.transactionSignature, {
            ...mergedMap.get(tx.transactionSignature),
            ...tx,
            type: tx.type === 'swap' ? 'swap' : (tx.from === publicKey ? 'send' :
                  tx.to === publicKey ? 'receive' :
                  tx.type || 'onchain')
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
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return t('unknown_date');
    }
  }, [t]);

  const formatAmount = useCallback((amount, token = 'SOL') => {
    if (!amount) return `0 ${token}`;
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${token}`;
  }, []);

  const getTransactionType = useCallback((tx) => {
    if (tx.type === 'send') return { icon: 'arrow-up', color: colors.error, label: t('sent'), sign: '-', bg: colors.errorLight };
    if (tx.type === 'receive') return { icon: 'arrow-down', color: colors.success, label: t('received'), sign: '+', bg: colors.successLight };
    if (tx.type === 'swap') return { icon: 'swap-horizontal', color: colors.info, label: t('swapped'), sign: '⟷', bg: colors.infoLight };
    if (tx.type === 'presale') return { icon: 'rocket', color: colors.warning, label: t('presale'), sign: '+', bg: colors.warningLight };
    return { icon: 'receipt', color: colors.textSecondary, label: t('transaction'), sign: '', bg: colors.card };
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
    if (tx.err) {
      return { color: colors.error, label: t('failed'), bg: colors.errorLight };
    }
    if (tx.blockTime || tx.status === 'confirmed' || tx.status === 'finalized' || tx.status === 'success') {
      return { color: colors.success, label: t('confirmed'), bg: colors.successLight };
    }
    return { color: colors.warning, label: t('pending'), bg: colors.warningLight };
  }, [colors, t]);

  // ==================== بطاقات الإحصائيات المحسنة ====================
  const renderStats = () => {
    const statsToShow = [];
    if (stats.sol.count > 0 || stats.sol.totalSent > 0 || stats.sol.totalReceived > 0) {
      statsToShow.push({ currency: 'SOL', sent: stats.sol.totalSent, received: stats.sol.totalReceived, count: stats.sol.count, color: primaryColor });
    }
    if (stats.meco.count > 0) {
      statsToShow.push({ currency: 'MECO', sent: stats.meco.totalSent, received: stats.meco.totalReceived, count: stats.meco.count, color: colors.warning });
    }
    if (stats.usdt.count > 0) {
      statsToShow.push({ currency: 'USDT', sent: stats.usdt.totalSent, received: stats.usdt.totalReceived, count: stats.usdt.count, color: colors.success });
    }
    if (stats.usdc.count > 0) {
      statsToShow.push({ currency: 'USDC', sent: stats.usdc.totalSent, received: stats.usdc.totalReceived, count: stats.usdc.count, color: colors.info });
    }

    if (statsToShow.length === 0) return null;

    return (
      <View style={styles.statsSection}>
        <Text style={[styles.statsTitle, { color: colors.textSecondary }]}>{t('summary', 'ملخص')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsContainer}>
          {statsToShow.map((item, index) => (
            <View key={index} style={[styles.statCard, { backgroundColor: colors.card, borderColor: item.color + '30' }]}>
              <View style={[styles.statHeader, { backgroundColor: item.color + '15' }]}>
                <Text style={[styles.statCurrency, { color: item.color }]}>{item.currency}</Text>
                <View style={[styles.statCountBadge, { backgroundColor: item.color }]}>
                  <Text style={styles.statCountText}>{item.count}</Text>
                </View>
              </View>

              <View style={styles.statDetails}>
                <View style={styles.statRow}>
                  <View style={[styles.statArrow, { backgroundColor: colors.errorLight }]}>
                    <Ionicons name="arrow-up" size={12} color={colors.error} />
                  </View>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('sent', 'مرسل')}</Text>
                  <Text style={[styles.statValue, { color: colors.error }]}>{item.sent.toFixed(4)}</Text>
                </View>

                <View style={styles.statRow}>
                  <View style={[styles.statArrow, { backgroundColor: colors.successLight }]}>
                    <Ionicons name="arrow-down" size={12} color={colors.success} />
                  </View>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('received', 'مستلم')}</Text>
                  <Text style={[styles.statValue, { color: colors.success }]}>{item.received.toFixed(4)}</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };
  // ===============================================================

  // ==================== Modal التفاصيل المحسن ====================
  const renderTransactionModal = () => (
    <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('transaction_details')}</Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={[styles.closeButton, { backgroundColor: colors.background }]}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {selectedTx && (
            <>
              <View style={[styles.modalTypeContainer, { backgroundColor: getTransactionType(selectedTx).bg }]}>
                <View style={[styles.modalIconLarge, { backgroundColor: colors.card }]}>
                  <Ionicons
                    name={getTransactionType(selectedTx).icon}
                    size={36}
                    color={getTransactionType(selectedTx).color}
                  />
                </View>
                <Text style={[styles.modalTypeLabel, { color: getTransactionType(selectedTx).color }]}>
                  {getTransactionType(selectedTx).label}
                </Text>
                <Text style={[styles.modalAmountLarge, { color: colors.text }]}>
                  {getTransactionType(selectedTx).sign} {formatAmount(selectedTx.amount, selectedTx.currency)}
                </Text>
              </View>

              <ScrollView style={styles.modalDetailsScroll} showsVerticalScrollIndicator={false}>
                <View style={[styles.modalDetails, { backgroundColor: colors.background }]}>
                  {selectedTx.signature && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('signature', 'التوقيع')}</Text>
                      <TouchableOpacity
                        style={styles.detailValueContainer}
                        onPress={() => copyToClipboard(selectedTx.signature, t('signature_copied'))}
                      >
                        <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={1}>
                          {selectedTx.signature.slice(0, 12)}...{selectedTx.signature.slice(-4)}
                        </Text>
                        <Ionicons name="copy-outline" size={16} color={primaryColor} />
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('time', 'الوقت')}</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatDateTime(selectedTx.timestamp, selectedTx.blockTime)}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('status', 'الحالة')}</Text>
                    <View style={[styles.statusBadgeLarge, { backgroundColor: getStatusInfo(selectedTx).bg }]}>
                      <Text style={{ color: getStatusInfo(selectedTx).color, fontWeight: 'bold', fontSize: 13 }}>
                        {getStatusInfo(selectedTx).label}
                      </Text>
                    </View>
                  </View>

                  {selectedTx.fee > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('fee', 'الرسوم')}</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {selectedTx.fee} SOL
                      </Text>
                    </View>
                  )}
                </View>
              </ScrollView>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: primaryColor }]}
                onPress={() => openExplorer(selectedTx.signature)}
              >
                <Ionicons name="open-outline" size={20} color="#FFF" />
                <Text style={styles.modalButtonText}>{t('view_on_solscan', 'عرض على Solscan')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
  // ===============================================================

  // ==================== عنصر المعاملة المحسن ====================
  const renderItem = ({ item, index }) => {
    const txType = getTransactionType(item);
    const dateText = formatDate(item.timestamp, item.blockTime);
    const statusInfo = getStatusInfo(item);
    const isPending = !item.signature && !item.transactionSignature;

    return (
      <TouchableOpacity
        style={[
          styles.itemContainer,
          { backgroundColor: colors.card },
          index === 0 && { marginTop: 0 }
        ]}
        onPress={() => { setSelectedTx(item); setModalVisible(true); }}
        activeOpacity={0.7}
        disabled={isPending}
      >
        <View style={[styles.itemLeftSection, { backgroundColor: txType.bg }]}>
          <Ionicons name={txType.icon} size={22} color={txType.color} />
        </View>

        <View style={styles.itemContent}>
          <View style={styles.itemTopRow}>
            <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
              {txType.label}
            </Text>
            {item.amount && (
              <Text style={[styles.itemAmount, { color: txType.color }]}>
                {txType.sign} {formatAmount(item.amount, item.currency)}
              </Text>
            )}
          </View>

          <View style={styles.itemBottomRow}>
            <View style={styles.itemDateContainer}>
              <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
              <Text style={[styles.itemDate, { color: colors.textSecondary }]}>{dateText}</Text>
            </View>

            <View style={[styles.itemStatusBadge, { backgroundColor: statusInfo.bg }]}>
              {isPending ? (
                <ActivityIndicator size="small" color={colors.warning} />
              ) : (
                <Text style={[styles.itemStatusText, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.itemArrow}
          onPress={() => { setSelectedTx(item); setModalVisible(true); }}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };
  // ===============================================================

  // ==================== فلاتر محسنة ====================
  const renderFilters = () => {
    const filters = [
      { key: 'all', label: t('all', 'الكل'), icon: 'apps', color: primaryColor },
      { key: 'receive', label: t('received', 'مستلم'), icon: 'arrow-down', color: colors.success },
      { key: 'send', label: t('sent', 'مرسل'), icon: 'arrow-up', color: colors.error },
      { key: 'swap', label: t('swapped', 'مبادل'), icon: 'swap-horizontal', color: colors.info },
    ];

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContainer}
      >
        {filters.map((filter) => {
          const isActive = activeFilter === filter.key;
          return (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterChip,
                isActive
                  ? { backgroundColor: filter.color }
                  : { backgroundColor: colors.card, borderColor: colors.border }
              ]}
              onPress={() => setActiveFilter(filter.key)}
            >
              <Ionicons
                name={filter.icon}
                size={14}
                color={isActive ? '#FFF' : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={[
                styles.filterText,
                { color: isActive ? '#FFF' : colors.textSecondary }
              ]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };
  // ===============================================================

  const filteredTransactions = transactions.filter(tx => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'swap') return tx.type === 'swap';
    return tx.type === activeFilter;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header محسن */}
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: colors.background }]}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('transaction_history_title', 'سجل المعاملات')}
        </Text>

        <TouchableOpacity
          onPress={onRefresh}
          style={[styles.refreshBtn, { backgroundColor: colors.background }]}
        >
          <Ionicons name="refresh" size={20} color={primaryColor} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('loading_transactions', 'جاري تحميل المعاملات...')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item, i) => item.signature || item.transactionSignature || `tx_${i}`}
          ListHeaderComponent={() => (
            <>
              {!loading && transactions.length > 0 && renderStats()}
              {renderFilters()}
            </>
          )}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
                <Ionicons name="receipt-outline" size={56} color={colors.textSecondary + '40'} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {t('no_activity_yet', 'لا يوجد نشاط بعد')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {t('transactions_will_appear_here', 'ستظهر المعاملات هنا')}
              </Text>
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

// ==================== الأنماط المحسنة ====================
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Stats Section
  statsSection: {
    paddingTop: 16,
  },
  statsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  statCard: {
    width: 160,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  statCurrency: {
    fontSize: 15,
    fontWeight: '800',
  },
  statCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statCountText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  statDetails: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statArrow: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Filters
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // List
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
  },

  // Transaction Item
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  itemLeftSection: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  itemContent: {
    flex: 1,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  itemAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemDate: {
    fontSize: 12,
    fontWeight: '500',
  },
  itemStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  itemStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemArrow: {
    padding: 8,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
  },
  emptyIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTypeContainer: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 24,
    marginBottom: 24,
  },
  modalIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTypeLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  modalAmountLarge: {
    fontSize: 28,
    fontWeight: '800',
  },
  modalDetailsScroll: {
    maxHeight: 250,
  },
  modalDetails: {
    borderRadius: 20,
    padding: 8,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  detailLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  detailValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    justifyContent: 'flex-end',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadgeLarge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
