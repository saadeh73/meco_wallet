import AsyncStorage from '@react-native-async-storage/async-storage';
import { heliusRpcRequest } from './heliusService';

const STORAGE_KEY  = 'transaction_log';
const MAX_LOG_SIZE = 100;

// ─── logTransaction ───────────────────────────────────────────────────────────
export async function logTransaction(data) {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    const logs     = existing ? JSON.parse(existing) : [];

    // ✅ دعم كلا الحقلين signature و transactionSignature
    const key = data.signature || data.transactionSignature;
    if (key && logs.some(l => (l.signature || l.transactionSignature) === key)) {
      console.log('⚠️ Transaction already logged, skipping.');
      return true;
    }

    const entry   = { ...data, savedAt: data.savedAt || Date.now() };
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
export async function getTransactions(address, limit = 10) {
  try {
    const signatures = await heliusRpcRequest('getSignaturesForAddress', [
      address,
      { limit },
    ]);

    if (!signatures || signatures.length === 0) return [];

    // ✅ جلب تفاصيل كل معاملة بشكل فردي موثوق بدلاً من batch غير مضمون
    const transactions = await Promise.all(
      signatures.map(async (sig) => {
        try {
          const tx = await heliusRpcRequest('getTransaction', [
            sig.signature,
            {
              encoding:                       'jsonParsed',
              maxSupportedTransactionVersion: 0,
            },
          ]);
          return {
            signature:  sig.signature,
            slot:       sig.slot,
            blockTime:  tx?.blockTime    || null,
            status:     sig.confirmationStatus || 'unknown',
            fee:        tx?.meta?.fee    || 0,
            err:        tx?.meta?.err    || null,
            type:       'onchain',
          };
        } catch (_) {
          return {
            signature: sig.signature,
            slot:      sig.slot,
            blockTime: null,
            status:    sig.confirmationStatus || 'unknown',
            fee:       0,
            err:       null,
            type:      'onchain',
          };
        }
      })
    );

    return transactions;
  } catch (err) {
    console.error('❌ Error fetching transactions:', err);
    return [];
  }
}

// ─── clearTransactionLog ──────────────────────────────────────────────────────
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
