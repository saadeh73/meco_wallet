import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { getJupiterMarketData } from './jupiterMarketService';

// ✅ استيراد دوال heliusService الموثوقة
import { getSolBalance, getTokenBalance } from './heliusService';
import { default as heliusService } from './heliusService';

// ✅ جميع العملات الـ 16
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  MECO: '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbJedZ89LxcQ',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3T7ef8R2mMWBwp',
  JTO: 'jtojtomepa8beP8AuQc6eEq5PG14zwVFmWeaKx1pC8X',
  RNDR: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nn4PnD2ruG',
  HNT: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  MNDE: 'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey',
  BOME: 'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82',
  TNSR: 'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddZ3uFaGE'
};

export const TOKEN_DECIMALS = { 
  SOL: 9, MECO: 9, USDT: 6, USDC: 6, 
  JUP: 6, RAY: 6, BONK: 5, WIF: 6, 
  PYTH: 6, JTO: 9, RNDR: 8, HNT: 8, 
  ORCA: 6, MNDE: 9, BOME: 6, TNSR: 9 
};

// ✅ عنوان خزينة المشروع ورسم الخدمة
const FEE_COLLECTOR_ADDRESS = 'HXkEZSKictbSYan9ZxQGaHpFrbA4eLDyNtEDxVBkdFy6';
const SERVICE_FEE_SOL = 0.0005;

// ✅ نقاط نهاية Jupiter
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const JUPITER_LITE_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_LITE_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap';

// ✅ مفتاح Jupiter API مباشرة
const JUPITER_API_KEY = 'jup_c50a1fd6f89facc37df71bf8bb1dbc83ad49e3ce896d33fc171291d11e28efd2';

// ✅ الترويسات
const BROWSER_HEADERS = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin': 'https://jup.ag',
  'Referer': 'https://jup.ag/',
  'x-api-key': JUPITER_API_KEY,
};

// --- دوال مساعدة ---
const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, credentials: 'omit' });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('انتهت مهلة الاتصال بالخادم');
    if (error.message.includes('Network request failed')) throw new Error('تعذر الاتصال بالخادم (Network Error)');
    throw error;
  }
};

async function getKeypair() {
  const secretKeyStr = await SecureStore.getItemAsync('wallet_private_key');
  if (!secretKeyStr) throw new Error('المفتاح الخاص غير موجود');
  let secretKey = secretKeyStr.startsWith('[') ? new Uint8Array(JSON.parse(secretKeyStr)) : bs58.decode(secretKeyStr);
  return web3.Keypair.fromSecretKey(secretKey);
}

// ✅ دالة اتصال تستخدم heliusService الموثوق (لا تعتمد على متغيرات البيئة)
async function getConnection() {
  try {
    return await heliusService.getConnection();
  } catch (error) {
    console.warn('⚠️ [Swap] فشل heliusService، استخدام الاحتياطي العام:', error.message);
    return new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }
}

// --- جلب عرض السعر (Quote) ---
export async function getSwapQuote(inputMint, outputMint, amount, slippageBps = 100) {
  const endpoints = [
    { name: 'Main V6', url: JUPITER_QUOTE_API },
    { name: 'Lite API', url: JUPITER_LITE_QUOTE_API }
  ];

  let lastError;
  for (const endpoint of endpoints) {
    const url = `${endpoint.url}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
    console.log(`🔍 [Quote] محاولة ${endpoint.name}...`);
    try {
      const response = await fetchWithTimeout(url, { method: 'GET', headers: BROWSER_HEADERS }, 15000);
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`⚠️ [Quote] ${endpoint.name} فشل (${response.status}):`, errorText);
        throw new Error(errorText);
      }
      const quote = await response.json();
      if (!quote?.routePlan) throw new Error('لا يوجد مسار');
      console.log(`✅ [Quote] نجح عبر ${endpoint.name}`);
      return quote;
    } catch (error) {
      console.warn(`❌ [Quote] ${endpoint.name} فشل:`, error.message);
      lastError = error;
    }
  }
  throw new Error(`تعذر الاتصال بخوادم Jupiter. ${lastError?.message || 'جميع المحاولات فشلت'}`);
}

// --- بناء المعاملة (Swap Transaction) ---
export async function buildSwapTransaction(quote, userPublicKey) {
  const endpoints = [
    { name: 'Main V6', url: JUPITER_SWAP_API },
    { name: 'Lite API', url: JUPITER_LITE_SWAP_API }
  ];

  let lastError;
  for (const endpoint of endpoints) {
    try {
      console.log(`🛠️ [Build] محاولة بناء المعاملة عبر ${endpoint.name}...`);
      const response = await fetchWithTimeout(endpoint.url, {
        method: 'POST',
        headers: BROWSER_HEADERS,
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: userPublicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto"
        })
      }, 20000);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`⚠️ [Build] ${endpoint.name} فشل (${response.status}):`, errorText);
        throw new Error(errorText);
      }

      const data = await response.json();
      if (!data.swapTransaction) throw new Error('بيانات المعاملة غير مكتملة');
      console.log(`✅ [Build] تم بناء المعاملة بنجاح عبر ${endpoint.name}`);
      return data;
    } catch (error) {
      console.warn(`❌ [Build] ${endpoint.name} فشل مع الخطأ:`, error.message);
      lastError = error;
    }
  }
  throw new Error(`فشل بناء المعاملة: ${lastError?.message || 'جميع المحاولات باءت بالفشل'}`);
}

// --- تنفيذ التبادل ---
export async function executeSwap(inputSymbol, outputSymbol, amount, slippageBps = 100, maxRetries = 3) {
  console.log(`🚀 [Swap] بدء التبادل: ${amount} ${inputSymbol} -> ${outputSymbol}`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [Swap] المحاولة ${attempt} من ${maxRetries}...`);
      
      const keypair = await getKeypair();
      const connection = await getConnection();
      console.log(`🔑 [Swap] المفتاح العام: ${keypair.publicKey.toString()}`);

      const balanceCheck = await checkBalance(inputSymbol, amount);
      if (!balanceCheck.hasBalance) {
        throw new Error(`رصيد ${inputSymbol} غير كاف. المطلوب: ${amount}, المتاح: ${balanceCheck.balance}`);
      }
      console.log(`💰 [Swap] الرصيد كافٍ`);

      const inputDecimals = TOKEN_DECIMALS[inputSymbol] || 9;
      const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));

      // 1. عرض السعر
      const quote = await getSwapQuote(TOKEN_MINTS[inputSymbol], TOKEN_MINTS[outputSymbol], amountInSmallestUnit, slippageBps);
      console.log(`📊 [Swap] عرض السعر: 1 ${inputSymbol} ≈ ${quote.outAmount / Math.pow(10, TOKEN_DECIMALS[outputSymbol] || 9)} ${outputSymbol}`);

      // 2. بناء المعاملة
      const swapData = await buildSwapTransaction(quote, keypair.publicKey);

      // 3. توقيع المعاملة
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = web3.VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([keypair]);
      console.log(`✍️ [Swap] تم توقيع المعاملة`);

      // 4. إرسال المعاملة للشبكة
      console.log(`📡 [Swap] جاري إرسال المعاملة للشبكة...`);
      
      const serializedTx = transaction.serialize();
      const uint8ArrayTx = new Uint8Array(serializedTx.buffer, serializedTx.byteOffset, serializedTx.byteLength);
      
      let signature;
      let latestBlockhash = await connection.getLatestBlockhash('confirmed');
      
      try {
        signature = await connection.sendRawTransaction(uint8ArrayTx, {
          skipPreflight: true,
          maxRetries: 5,
          preflightCommitment: 'processed',
        });
      } catch (sendError) {
        console.warn(`⚠️ [Swap] sendRawTransaction فشل:`, sendError.message);
        const txSignature = await web3.sendAndConfirmTransaction(
          connection,
          transaction,
          [keypair],
          { skipPreflight: true, commitment: 'confirmed', preflightCommitment: 'processed' }
        );
        signature = txSignature;
      }

      console.log(`📤 [Swap] تم الإرسال، التوقيع: ${signature}`);

      // 5. تأكيد المعاملة
      console.log(`⏳ [Swap] في انتظار التأكيد...`);
      
      let confirmation;
      let confirmAttempt = 0;
      const maxConfirmAttempts = 3;
      
      while (confirmAttempt < maxConfirmAttempts) {
        try {
          confirmation = await connection.confirmTransaction({
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          }, 'confirmed');
          
          if (!confirmation.value.err) break;
          else throw new Error(`رفضت الشبكة المعاملة: ${JSON.stringify(confirmation.value.err)}`);
        } catch (confirmError) {
          confirmAttempt++;
          console.warn(`⚠️ [Swap] تأكيد المحاولة ${confirmAttempt} فشل:`, confirmError.message);
          
          if (confirmError.message.includes('block height exceeded') || 
              confirmError.message.includes('Blockhash not found') ||
              confirmError.message.includes('expired')) {
            
            if (confirmAttempt < maxConfirmAttempts) {
              console.log(`🔄 [Swap] تجديد blockhash وإعادة محاولة التأكيد...`);
              latestBlockhash = await connection.getLatestBlockhash('confirmed');
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
          }
          throw confirmError;
        }
      }

      if (confirmation?.value?.err) throw new Error(`رفضت الشبكة المعاملة: ${JSON.stringify(confirmation.value.err)}`);

      console.log(`🎉 [Swap] نجاح! تم تأكيد المعاملة: ${signature}`);

      const outputDecimals = TOKEN_DECIMALS[outputSymbol] || 9;
      const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);

      return {
        success: true,
        signature,
        inputAmount: amount,
        outputAmount,
        inputSymbol,
        outputSymbol,
        explorerUrl: `https://solscan.io/tx/${signature}`
      };

    } catch (error) {
      console.error(`💥 [Swap] المحاولة ${attempt} فشلت:`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ [Swap] انتظار 3 ثوان قبل إعادة المحاولة...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        return { success: false, error: error.message };
      }
    }
  }
  
  return { success: false, error: 'فشلت جميع محاولات التبادل' };
}

// ✅ دالة checkBalance معدلة لاستخدام heliusService الموثوق
export async function checkBalance(tokenSymbol, amount) {
  try {
    const pubKeyStr = await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) {
      return { hasBalance: false, balance: 0, required: amount };
    }
    
    let balance = 0;
    if (tokenSymbol === 'SOL') {
      balance = await getSolBalance(true);
    } else {
      const mint = TOKEN_MINTS[tokenSymbol];
      if (!mint) {
        return { hasBalance: false, balance: 0, required: amount };
      }
      balance = await getTokenBalance(mint, true);
    }
    
    return { hasBalance: balance >= amount, balance, required: amount };
  } catch (error) {
    console.error('❌ [checkBalance] خطأ:', error.message);
    return { hasBalance: false, balance: 0, required: amount };
  }
}

export async function getSwapRate(inputSymbol, outputSymbol, amount) {
  try {
    const marketData = await getJupiterMarketData();
    const inputTokenData = marketData.find(t => t.symbol === inputSymbol);
    const outputTokenData = marketData.find(t => t.symbol === outputSymbol);
    if (!inputTokenData || !outputTokenData) throw new Error('بيانات التسعير غير متوفرة');
    const inputPriceUsd = inputTokenData.current_price;
    const outputPriceUsd = outputTokenData.current_price;
    if (inputPriceUsd === 0 || outputPriceUsd === 0) throw new Error('لا يوجد سيولة');
    const totalUsdValue = amount * inputPriceUsd;
    const outputAmountAfterSlippage = (totalUsdValue / outputPriceUsd) * 0.99;
    return { rate: outputPriceUsd / inputPriceUsd, outputAmount: outputAmountAfterSlippage, priceImpact: 1.0 };
  } catch (error) { throw error; }
}
