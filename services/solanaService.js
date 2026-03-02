import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import * as SecureStore from 'expo-secure-store';

// استيراد الثوابت الأساسية فقط
import {
  MECO_MINT,
  RPC_URL,
} from '../constants';

// إعداد الاتصال
const connection = new web3.Connection(RPC_URL, 'confirmed');
const MECO_MINT_PUBKEY = new web3.PublicKey(MECO_MINT);

// =============================================
// 📊 دالات جلب الأرصدة والمعلومات
// =============================================

// 1. جلب رصيد SOL
export async function getSOLBalance() {
  try {
    const pubKey = await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKey) return 0;

    const result = await connection.getBalance(new web3.PublicKey(pubKey));
    return result / web3.LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error getting SOL balance:', error);
    return 0;
  }
}

// 2. جلب رصيد MECO
export async function getMECOBalance() {
  try {
    const pubKey = await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKey) return 0;

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new web3.PublicKey(pubKey),
      { programId: splToken.TOKEN_PROGRAM_ID }
    );

    const mecoAccount = tokenAccounts.value.find(
      account => account.account.data.parsed.info.mint === MECO_MINT
    );

    if (mecoAccount) {
      return mecoAccount.account.data.parsed.info.tokenAmount.uiAmount || 0;
    }

    return 0;
  } catch (error) {
    console.error('Error getting MECO balance:', error);
    return 0;
  }
}

// 3. حساب رسوم الشبكة (تم تعديل الاسم والمنطق ليتطابق مع الشاشات)
export async function getCurrentNetworkFee() {
  try {
    // نحاول جلب رسوم الأولويات الحالية
    const fees = await connection.getRecentPrioritizationFees();
    
    if (fees && fees.length > 0) {
      // حساب المتوسط
      const totalFees = fees.reduce((sum, f) => sum + f.prioritizationFee, 0);
      const averageFee = totalFees / fees.length;
      
      // تحويل من microLamports إلى SOL
      const feeInSol = averageFee / 1_000_000 / web3.LAMPORTS_PER_SOL;
      
      // وضع حدود آمنة (بين 0.000005 و 0.00001)
      // هذا يضمن أننا لا ندفع رسوماً مبالغاً فيها
      return Math.max(0.000005, Math.min(feeInSol, 0.00001));
    }
    
    // في حال عدم وجود بيانات، نعود للحد الأدنى القياسي لسولانا
    return 0.000005;
  } catch (error) {
    // في حال الخطأ، نعود للوضع الآمن
    return 0.000005;
  }
}

// =============================================
// 🔧 دالات مساعدة (Utilities)
// =============================================

// 4. التحقق من صحة عنوان المحفظة
export async function validateWalletAddress(address) {
  try {
    if (!address) return false;
    const pubKey = new web3.PublicKey(address);
    return web3.PublicKey.isOnCurve(pubKey);
  } catch {
    return false;
  }
}

// 5. جلب سجل المعاملات (بسيط)
export async function getTransactionHistory(limit = 10) {
  try {
    const pubKeyStr = await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) return [];

    const signatures = await connection.getSignaturesForAddress(
      new web3.PublicKey(pubKeyStr),
      { limit }
    );
    return signatures;
  } catch (error) {
    console.error('Error getting transaction history:', error);
    return [];
  }
}

// 6. محاكاة المعاملة
export async function simulateTransaction(transaction) {
  try {
    const simulation = await connection.simulateTransaction(transaction);
    return {
      success: !simulation.value.err,
      logs: simulation.value.logs || [],
      error: simulation.value.err,
    };
  } catch (error) {
    console.error('Error simulating transaction:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
