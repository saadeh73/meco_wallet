import AsyncStorage from '@react-native-async-storage/async-storage';
import { heliusRpcRequest } from './heliusService';

const STORAGE_KEY   = 'transaction_log';
const MAX_LOG_SIZE  = 100; // ✅ حد أقصى لمنع تضخم التخزين

// ─── logTransaction ───────────────────────────────────────────────────────────
// 📝 حفظ عملية جديدة مع deduplication وحد أقصى للسجل
export async function logTransaction(data) {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    const logs     = existing ? JSON.parse(existing) : [];

    // ✅ deduplication — لا تحفظ إذا كان التوقيع موجوداً مسبقاً
    if (data.signature && logs.some(l => l.signature === data.signature)) {
      console.log('⚠️ Transaction already logged, skipping.');
      return true;
    }

    // ✅ إضافة timestamp إذا لم يكن موجوداً
    const entry   = { ...data, savedAt: data.savedAt || Date.now() };

    // ✅ حد أقصى MAX_LOG_SIZE — احذف الأقدم عند التجاوز
    const updated = [entry, ...logs].slice(0, MAX_LOG_SIZE);

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log('📝 Transaction saved to local log');
    return true;
  } catch (err) {
    console.error('❌ Failed to log transaction:', err);
    return false;
  }
}

// ─── getTransactionLog ────────────────────────────────────────────────────────
// 📦 جلب السجل المحلي كاملاً
export async function getTransactionLog() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error('❌ Failed to get transaction log:', err);
    return [];
  }
}

// ─── getTransactions ──────────────────────────────────────────────────────────
// 🔍 جلب آخر المعاملات من Helius بدفعة واحدة (batch) بدلاً من N+1 requests
export async function getTransactions(address, limit = 10) {
  try {
    // الخطوة 1: جلب التوقيعات
    const signatures = await heliusRpcRequest('getSignaturesForAddress', [
      address,
      { limit },
    ]);

    if (!signatures || signatures.length === 0) return [];

    // ✅ الخطوة 2: جلب تفاصيل المعاملات دفعة واحدة بدلاً من N+1
    const txDetails = await heliusRpcRequest('getTransactions', [
      signatures.map(s => s.signature),
      {
        encoding:                       'jsonParsed',
        maxSupportedTransactionVersion: 0, // ✅ دعم Versioned Transactions
      },
    ]);

    // الخطوة 3: دمج البيانات مع التحقق من null
    return signatures.map((sig, index) => {
      const tx = txDetails?.[index] || null;
      return {
        signature:  sig.signature,
        slot:       sig.slot,
        blockTime:  tx?.blockTime    || null,
        status:     sig.confirmationStatus || 'unknown',
        fee:        tx?.meta?.fee    || 0,
        err:        tx?.meta?.err    || null,
        type:       'onchain',
      };
    });

  } catch (err) {
    console.error('❌ Error fetching transactions:', err);
    return [];
  }
}

// ─── clearTransactionLog ──────────────────────────────────────────────────────
// 🗑️ مسح سجل المعاملات المحلي
export async function clearTransactionLog() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('🗑️ Transaction log cleared');
    return true;
  } catch (err) {
    console.error('❌ Failed to clear transaction log:', err);
    return false;
  }
}

// ─── getSwapStats ─────────────────────────────────────────────────────────────
// 📊 إحصائيات التبادلات من السجل المحلي
export async function getSwapStats() {
  try {
    const logs     = await getTransactionLog();
    const swapLogs = logs.filter(log => log.type === 'swap');

    const stats = {
      totalSwaps:      swapLogs.length,
      successfulSwaps: swapLogs.filter(log => log.status === 'completed').length,
      failedSwaps:     swapLogs.filter(log => log.status === 'failed').length,
      totalVolume:     swapLogs.reduce((sum, log) => sum + (log.fromAmount  || 0), 0),
      totalFees:       swapLogs.reduce((sum, log) => sum + (log.serviceFee || 0), 0),
      byToken:         {},
    };

    swapLogs.forEach(log => {
      if (!log.from) return;
      if (!stats.byToken[log.from]) {
        stats.byToken[log.from] = { count: 0, volume: 0 };
      }
      stats.byToken[log.from].count++;
      stats.byToken[log.from].volume += log.fromAmount || 0;
    });

    return stats;
  } catch (err) {
    console.error('❌ Failed to get swap stats:', err);
    return null;
  }
}
