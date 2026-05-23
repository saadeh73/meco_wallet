import AsyncStorage from '@react-native-async-storage/async-storage';
import { heliusRpcRequest } from './heliusService';

const STORAGE_KEY = 'transaction_log';

// 📝 حفظ عملية جديدة
export async function logTransaction(data) {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    const logs = existing ? JSON.parse(existing) : [];
    const updated = [data, ...logs];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log('📝 Transaction saved to local log');
    return true;
  } catch (err) {
    console.error('❌ Failed to log transaction:', err);
    return false;
  }
}

// 📦 جلب السجل من التخزين
export async function getTransactionLog() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error('❌ Failed to get transaction log:', err);
    return [];
  }
}

// 🔍 جلب آخر المعاملات من Helius (احتياطية إذا استدعتها شاشات أخرى)
export async function getTransactions(address) {
  try {
    const result = await heliusRpcRequest('getSignaturesForAddress', [
      address,
      { limit: 10 },
    ]);

    const transactions = await Promise.all(
      result.map(async (sig) => {
        const tx = await heliusRpcRequest('getTransaction', [sig.signature]);
        return {
          signature: sig.signature,
          slot: sig.slot,
          blockTime: tx?.blockTime,
          status: sig.confirmationStatus,
          fee: tx?.meta?.fee || 0,
          type: 'onchain',
        };
      })
    );

    return transactions;
  } catch (err) {
    console.error('❌ Error fetching transactions:', err);
    return [];
  }
}

// 🗑️ مسح سجل المعاملات
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

// 📊 إحصائيات التبادلات (تعتمد على السجل المحلي)
export async function getSwapStats() {
  try {
    const logs = await getTransactionLog();
    const swapLogs = logs.filter(log => log.type === 'swap');
    
    const stats = {
      totalSwaps: swapLogs.length,
      successfulSwaps: swapLogs.filter(log => log.status === 'completed').length,
      failedSwaps: swapLogs.filter(log => log.status === 'failed').length,
      totalVolume: swapLogs.reduce((sum, log) => sum + (log.fromAmount || 0), 0),
      totalFees: swapLogs.reduce((sum, log) => sum + (log.serviceFee || 0), 0),
      byToken: {}
    };
    
    // تحليل حسب الرمز
    swapLogs.forEach(log => {
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
