import AsyncStorage from '@react-native-async-storage/async-storage';
import { heliusRpcRequest } from './heliusService';
import * as SecureStore from 'expo-secure-store';
import * as web3 from '@solana/web3.js';
import bs58 from 'bs58';

const STORAGE_KEY = 'transaction_log';

// 📝 حفظ عملية جديدة
export async function logTransaction(data) {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    const logs = existing ? JSON.parse(existing) : [];
    const updated = [data, ...logs];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log('📝 Transaction saved');
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

// 🔍 جلب آخر المعاملات من Helius
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

// 🔑 التحقق من المفتاح الخاص
async function validatePrivateKey() {
  try {
    const secretKeyStr = await SecureStore.getItemAsync('wallet_private_key');
    if (!secretKeyStr) {
      return { valid: false, error: 'Missing private key' };
    }

    let parsedKey;
    try {
      if (secretKeyStr.startsWith('[')) {
        parsedKey = Uint8Array.from(JSON.parse(secretKeyStr));
      } else {
        parsedKey = bs58.decode(secretKeyStr);
      }
    } catch (error) {
      return { valid: false, error: 'Invalid private key format' };
    }

    let keypair;
    if (parsedKey.length === 64) {
      keypair = web3.Keypair.fromSecretKey(parsedKey);
    } else if (parsedKey.length === 32) {
      keypair = web3.Keypair.fromSeed(parsedKey.slice(0, 32));
    } else {
      return { valid: false, error: 'Invalid private key length' };
    }

    return { valid: true, keypair };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// ℹ️ معلومات الرمز المميز
function getTokenInfo(symbol) {
  const tokens = {
    'SOL': {
      symbol: 'SOL',
      name: 'Solana',
      mint: 'So11111111111111111111111111111111111111112',
      decimals: 9
    },
    'USDT': {
      symbol: 'USDT',
      name: 'Tether USD',
      mint: 'Es9vMFrzaCERc8Foa8XfRduKiSfrhEL5c7qr2WXXBWY5',
      decimals: 6
    },
    'MECO': {
      symbol: 'MECO',
      name: 'MonyCoin',
      mint: 'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W',
      decimals: 6
    },
    'USDC': {
      symbol: 'USDC',
      name: 'USD Coin',
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6
    },
  };
  
  return tokens[symbol] || null;
}

// 🔄 دالة تنفيذ التبادل الحقيقي عبر Jupiter
export async function executeRealSwap(swapData) {
  const {
    fromToken,
    toToken,
    fromAmount,
    quote,
    walletPublicKey,
    networkFee = 0.0005,
  } = swapData;

  try {
    console.log('🚀 Starting REAL swap execution...');
    console.log('📊 Swap Data:', swapData);

    // 1. التحقق من المفتاح الخاص
    const privateKeyValidation = await validatePrivateKey();
    if (!privateKeyValidation.valid) {
      throw new Error(`Invalid private key: ${privateKeyValidation.error}`);
    }
    
    const { keypair } = privateKeyValidation;
    const publicKey = keypair.publicKey.toString();
    
    // 2. الحصول على معلومات الرموز
    const fromTokenInfo = getTokenInfo(fromToken);
    const toTokenInfo = getTokenInfo(toToken);
    
    if (!fromTokenInfo || !toTokenInfo) {
      throw new Error('Invalid token selection');
    }

    // 3. التحقق من الرصيد
    const connection = new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    let fromBalance;
    if (fromToken === 'SOL') {
      const balanceLamports = await connection.getBalance(keypair.publicKey);
      fromBalance = balanceLamports / web3.LAMPORTS_PER_SOL;
    } else {
      // جلب أرصدة التوكن من Helius
      const response = await fetch(`https://api.helius.xyz/v0/addresses/${publicKey}/balances?api-key=YOUR_HELIUS_API_KEY`);
      const data = await response.json();
      const tokenBalance = data.tokens?.find(t => t.mint === fromTokenInfo.mint);
      fromBalance = tokenBalance ? tokenBalance.amount : 0;
    }
    
    if (fromAmount > fromBalance) {
      throw new Error(`Insufficient ${fromToken} balance. Available: ${fromBalance.toFixed(6)}`);
    }

    // 4. الحصول على معاملة التبادل من Jupiter
    console.log('🔄 Getting swap transaction from Jupiter...');
    
    const inputMint = fromToken === 'SOL' 
      ? 'So11111111111111111111111111111111111111112' 
      : fromTokenInfo.mint;
    
    const outputMint = toToken === 'SOL'
      ? 'So11111111111111111111111111111111111111112'
      : toTokenInfo.mint;
    
    // تحويل الكمية إلى أصغر وحدة
    const amountInSmallestUnit = Math.floor(
      fromAmount * Math.pow(10, fromTokenInfo.decimals)
    );

    // Step 1: الحصول على quote جديد
    const quoteResponse = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInSmallestUnit}&slippageBps=50`
    );
    
    const quoteData = await quoteResponse.json();
    
    if (!quoteData || quoteData.error) {
      throw new Error(quoteData?.error || 'Failed to get fresh quote');
    }

    // Step 2: الحصول على معاملة التبادل
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: publicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        computeUnitPriceMicroLamports: 100000,
      }),
    });

    const swapTransactionData = await swapResponse.json();
    
    if (swapTransactionData.error) {
      throw new Error(swapTransactionData.error);
    }

    // 5. إزالة الترميز Base64 للمعاملة
    const swapTransactionBuf = Buffer.from(swapTransactionData.swapTransaction, 'base64');
    const transaction = web3.Transaction.from(swapTransactionBuf);

    // 6. إضافة رسوم الخدمة إذا كانت هناك
    const FEE_COLLECTOR = 'BkaJsFAJKPQZgreBFLrY2pPUi44fTJzXhmeBc8LeuF5W';
    const SERVICE_FEE_PERCENTAGE = 0.0005; 
    
    if (fromToken === 'SOL' && fromAmount > 0) {
      const serviceFee = fromAmount * SERVICE_FEE_PERCENTAGE;
      const serviceFeeLamports = Math.floor(serviceFee * web3.LAMPORTS_PER_SOL);
      
      if (serviceFeeLamports > 0) {
        const feeInstruction = web3.SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new web3.PublicKey(FEE_COLLECTOR),
          lamports: serviceFeeLamports,
        });
        
        transaction.add(feeInstruction);
        console.log(`💰 Added service fee: ${serviceFee} SOL (${serviceFeeLamports} lamports)`);
      }
    }

    // 7. تحديث blockhash و fee payer
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    // 8. توقيع المعاملة
    console.log('✍️ Signing transaction...');
    transaction.sign(keypair);

    // 9. إرسال المعاملة
    console.log('📤 Sending transaction to Solana network...');
    const rawTransaction = transaction.serialize();
    const signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('⏳ Waiting for confirmation...');
    
    // 10. انتظار التأكيد
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight: (await connection.getBlockHeight()) + 150,
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }

    // 11. حساب الكمية المستلمة
    const outputAmount = Number(quoteData.outAmount) / Math.pow(10, toTokenInfo.decimals);
    
    // 12. تسجيل المعاملة الناجحة
    const logData = {
      type: 'swap',
      from: fromToken,
      to: toToken,
      fromAmount,
      toAmount: outputAmount,
      rate: quote?.rate || quoteData.outAmount / amountInSmallestUnit,
      priceImpact: quoteData.priceImpactPct || '0',
      networkFee,
      serviceFee: fromToken === 'SOL' ? fromAmount * SERVICE_FEE_PERCENTAGE : 0,
      transactionSignature: signature,
      timestamp: new Date().toISOString(),
      status: 'completed',
      explorerUrl: `https://solscan.io/tx/${signature}`,
      walletAddress: publicKey,
      note: `Swapped ${fromAmount} ${fromToken} for ${outputAmount} ${toToken} via Jupiter`,
      jupiterQuoteId: quoteData.quoteId
    };

    await logTransaction(logData);

    console.log('✅ REAL SWAP COMPLETED!');
    console.log('📝 Transaction details:', logData);

    return {
      success: true,
      signature: signature,
      outputAmount: outputAmount,
      message: `✅ Successfully swapped ${fromAmount} ${fromToken} for ${outputAmount} ${toToken}`,
      data: logData,
      explorerUrl: logData.explorerUrl
    };

  } catch (error) {
    console.error('❌ REAL SWAP FAILED:', error);
    
    // تسجيل المعاملة الفاشلة
    await logTransaction({
      type: 'swap',
      from: fromToken,
      to: toToken,
      fromAmount,
      toAmount: 0,
      rate: quote?.rate || 0,
      timestamp: new Date().toISOString(),
      status: 'failed',
      error: error.message,
      walletAddress: walletPublicKey || 'unknown'
    });
    
    return {
      success: false,
      error: error.message,
      message: `❌ Swap failed: ${error.message}`
    };
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

// 📊 إحصائيات التبادلات
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

// 🔄 دالة مختصرة للتبادل السريع
export async function quickSwap(fromToken, toToken, amount) {
  try {
    const walletPublicKey = await SecureStore.getItemAsync('wallet_public_key');
    
    // الحصول على quote أولاً
    const fromTokenInfo = getTokenInfo(fromToken);
    const toTokenInfo = getTokenInfo(toToken);
    
    const amountInSmallestUnit = Math.floor(
      amount * Math.pow(10, fromTokenInfo.decimals)
    );
    
    const quoteResponse = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${fromTokenInfo.mint}&outputMint=${toTokenInfo.mint}&amount=${amountInSmallestUnit}&slippageBps=100`
    );
    
    const quoteData = await quoteResponse.json();
    
    // تنفيذ التبادل
    return await executeRealSwap({
      fromToken,
      toToken,
      fromAmount: amount,
      quote: quoteData,
      walletPublicKey,
    });
    
  } catch (error) {
    console.error('Quick swap error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
