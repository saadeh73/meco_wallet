import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

import { getSolBalance, getTokenBalance } from './heliusService';
import { default as heliusService } from './heliusService';

// ─── TOKEN_MINTS ──────────────────────────────────────────────────────────────
// ✅ جميع العملات الـ 16 متزامنة مع jupiterMarketService
export const TOKEN_MINTS = {
  SOL:    'So11111111111111111111111111111111111111112',
  MECO:   'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W',
  USDT:   'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC:   'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  JUP:    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbJedZ89LxcQ',
  RAY:    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  BONK:   'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF:    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  JTO:    'jtojtomepa8beP8AuQc6eEq5PG14zwVFmWeaKx1pC8X',
  PYTH:   'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3T7ef8R2mMWBwp',
  HNT:    'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux',
  ORCA:   'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  MNDE:   'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey',
  BOME:   'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82',
  POPCAT: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
  MEW:    'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
};

// ─── TOKEN_DECIMALS ───────────────────────────────────────────────────────────
// ✅ جميع العملات الـ 16 بالـ decimals الصحيحة
export const TOKEN_DECIMALS = {
  SOL:    9,
  MECO:   9,
  USDT:   6,
  USDC:   6,
  JUP:    6,
  RAY:    6,
  BONK:   5,
  WIF:    6,
  JTO:    9,
  PYTH:   6,
  HNT:    8,
  ORCA:   6,
  MNDE:   9,
  BOME:   6,
  POPCAT: 9,
  MEW:    6,
};

// ─── ثوابت ────────────────────────────────────────────────────────────────────
const FEE_COLLECTOR_ADDRESS = 'BkaJsFAJKPQZgreBFLrY2pPUi44fTJzXhmeBc8LeuF5W';
const SERVICE_FEE_SOL       = 0.0005;
const JUPITER_QUOTE_API     = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API      = 'https://quote-api.jup.ag/v6/swap';
const JUPITER_LITE_QUOTE_API= 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_LITE_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap';
const JUPITER_API_KEY       = 'jup_c50a1fd6f89facc37df71bf8bb1dbc83ad49e3ce896d33fc171291d11e28efd2';

const BROWSER_HEADERS = {
  'Accept':          'application/json',
  'Content-Type':    'application/json',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin':          'https://jup.ag',
  'Referer':         'https://jup.ag/',
  'x-api-key':       JUPITER_API_KEY,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, credentials: 'omit' });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('انتهت مهلة الاتصال بالخادم');
    if (err.message.includes('Network request failed')) throw new Error('تعذر الاتصال بالخادم (Network Error)');
    throw err;
  }
};

function getKeypairFromPrivateKey(privateKey) {
  if (!privateKey) throw new Error('المفتاح الخاص غير موجود');
  const secretKey = privateKey.startsWith('[')
    ? new Uint8Array(JSON.parse(privateKey))
    : bs58.decode(privateKey);
  return web3.Keypair.fromSecretKey(secretKey);
}

async function getKeypair() {
  const key = await SecureStore.getItemAsync('wallet_private_key');
  if (!key) throw new Error('المفتاح الخاص غير موجود');
  return getKeypairFromPrivateKey(key);
}

async function getConnection() {
  try {
    return await heliusService.getConnection();
  } catch (err) {
    console.warn('⚠️ [Swap] heliusService فشل، استخدام الاحتياطي:', err.message);
    return new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }
}

// ─── getSwapQuote ─────────────────────────────────────────────────────────────
export async function getSwapQuote(inputMint, outputMint, amount, slippageBps = 100) {
  // ✅ تحقق مبكر قبل استدعاء API
  if (!inputMint || !outputMint) {
    throw new Error('عملة غير مدعومة في التبادل');
  }

  const endpoints = [
    { name: 'Main V6', url: JUPITER_QUOTE_API       },
    { name: 'Lite API', url: JUPITER_LITE_QUOTE_API },
  ];

  const isMeco    = inputMint === TOKEN_MINTS.MECO || outputMint === TOKEN_MINTS.MECO;
  const extraParams = isMeco ? '&onlyDirectRoutes=false&asLegacyTransaction=true' : '';

  let lastError;
  for (const ep of endpoints) {
    const url = `${ep.url}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}${extraParams}`;
    console.log(`🔍 [Quote] محاولة ${ep.name}...`);
    try {
      const res = await fetchWithTimeout(url, { method: 'GET', headers: BROWSER_HEADERS }, 15000);
      if (!res.ok) throw new Error(await res.text());
      const quote = await res.json();
      if (!quote?.routePlan) throw new Error('لا يوجد مسار للتبادل (السيولة قد تكون ضعيفة)');
      console.log(`✅ [Quote] نجح عبر ${ep.name}`);
      return quote;
    } catch (err) {
      console.warn(`❌ [Quote] ${ep.name} فشل:`, err.message);
      lastError = err;
    }
  }
  throw new Error(`تعذر الحصول على سعر التبادل. ${lastError?.message || ''}`);
}

// ─── buildSwapTransaction ─────────────────────────────────────────────────────
export async function buildSwapTransaction(quote, userPublicKey) {
  const endpoints = [
    { name: 'Main V6', url: JUPITER_SWAP_API       },
    { name: 'Lite API', url: JUPITER_LITE_SWAP_API },
  ];

  let lastError;
  for (const ep of endpoints) {
    try {
      console.log(`🛠️ [Build] محاولة ${ep.name}...`);
      const res = await fetchWithTimeout(ep.url, {
        method:  'POST',
        headers: BROWSER_HEADERS,
        body:    JSON.stringify({
          quoteResponse:              quote,
          userPublicKey:              userPublicKey.toString(),
          wrapAndUnwrapSol:           true,
          dynamicComputeUnitLimit:    true,
          prioritizationFeeLamports:  'auto',
          asLegacyTransaction:        true,
        }),
      }, 20000);

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!data.swapTransaction) throw new Error('بيانات المعاملة غير مكتملة');
      console.log(`✅ [Build] نجح عبر ${ep.name}`);
      return data;
    } catch (err) {
      console.warn(`❌ [Build] ${ep.name} فشل:`, err.message);
      lastError = err;
    }
  }
  throw new Error(`فشل بناء المعاملة: ${lastError?.message || ''}`);
}

// ─── executeSwap ──────────────────────────────────────────────────────────────
export async function executeSwap(
  inputSymbol, outputSymbol, amount,
  slippageBps = 100, maxRetries = 3,
  publicKey, privateKey
) {
  console.log(`🚀 [Swap] بدء: ${amount} ${inputSymbol} → ${outputSymbol}`);

  // ✅ تحقق مبكر من دعم العملات
  if (!TOKEN_MINTS[inputSymbol] || !TOKEN_MINTS[outputSymbol]) {
    return { success: false, error: 'عملة غير مدعومة في التبادل' };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [Swap] المحاولة ${attempt}/${maxRetries}...`);

      const keypair      = privateKey ? getKeypairFromPrivateKey(privateKey) : await getKeypair();
      const userPubKey   = publicKey  ? new web3.PublicKey(publicKey) : keypair.publicKey;
      const connection   = await getConnection();

      const balanceCheck = await checkBalance(inputSymbol, amount, userPubKey.toString());
      if (!balanceCheck.hasBalance) {
        throw new Error(`رصيد ${inputSymbol} غير كافٍ أو لا تملك رسوم الشبكة.`);
      }

      const inputDecimals     = TOKEN_DECIMALS[inputSymbol]  || 9;
      const outputDecimals    = TOKEN_DECIMALS[outputSymbol] || 9;
      const amountInLamports  = Math.floor(amount * Math.pow(10, inputDecimals));

      // ── Step 1: جلب quote ──────────────────────────────────────────────────
      const quote    = await getSwapQuote(TOKEN_MINTS[inputSymbol], TOKEN_MINTS[outputSymbol], amountInLamports, slippageBps);
      const swapData = await buildSwapTransaction(quote, userPubKey);

      // ── Step 2: جلب blockhash بعد الـ quote ✅ لتجنب انتهاء الصلاحية ────────
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');

      // ── Step 3: بناء معاملة الرسوم ─────────────────────────────────────────
      console.log(`💸 [Fee] بناء معاملة رسوم التطبيق (${SERVICE_FEE_SOL} SOL)...`);
      const feeTx = new web3.Transaction().add(
        web3.SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey:   new web3.PublicKey(FEE_COLLECTOR_ADDRESS),
          lamports:   Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL),
        })
      );
      feeTx.recentBlockhash = latestBlockhash.blockhash;
      feeTx.feePayer        = keypair.publicKey;
      feeTx.sign(keypair);

      // ── Step 4: توقيع معاملة الـ Swap ──────────────────────────────────────
      const swapTx = web3.VersionedTransaction.deserialize(
        Buffer.from(swapData.swapTransaction, 'base64')
      );
      swapTx.sign([keypair]);

      // ── Step 5: إرسال معاملة الرسوم ────────────────────────────────────────
      console.log(`📡 [Fee] إرسال معاملة الرسوم...`);
      const feeSignature = await connection.sendRawTransaction(feeTx.serialize(), { skipPreflight: true });
      console.log(`✅ [Fee] تم إرسال الرسوم: ${feeSignature}`);

      // ── Step 6: إرسال معاملة الـ Swap ──────────────────────────────────────
      const swapBytes = new Uint8Array(swapTx.serialize());
      let swapSignature;

      try {
        swapSignature = await connection.sendRawTransaction(swapBytes, {
          skipPreflight:        true,
          maxRetries:           5,
          preflightCommitment:  'processed',
        });
      } catch (sendErr) {
        // ✅ إصلاح: استخدام sendRawTransaction بدلاً من sendAndConfirmTransaction
        // sendAndConfirmTransaction لا يدعم VersionedTransaction
        console.warn('⚠️ [Swap] إعادة المحاولة بدون skipPreflight...');
        swapSignature = await connection.sendRawTransaction(swapBytes, {
          skipPreflight: false,
          maxRetries:    3,
        });
      }

      console.log(`📤 [Swap] تم الإرسال: ${swapSignature}`);

      // ── Step 7: تأكيد المعاملة ─────────────────────────────────────────────
      let confirmation;
      let currentBlockhash = latestBlockhash;

      for (let confirmAttempt = 0; confirmAttempt < 3; confirmAttempt++) {
        try {
          confirmation = await connection.confirmTransaction({
            signature:           swapSignature,
            blockhash:           currentBlockhash.blockhash,
            lastValidBlockHeight:currentBlockhash.lastValidBlockHeight,
          }, 'confirmed');

          if (!confirmation.value.err) break;
          throw new Error('رفضت الشبكة المعاملة');
        } catch (confirmErr) {
          if (confirmAttempt < 2) {
            currentBlockhash = await connection.getLatestBlockhash('confirmed');
            await new Promise(r => setTimeout(r, 2000));
          } else {
            throw confirmErr;
          }
        }
      }

      if (confirmation?.value?.err) throw new Error('رفضت الشبكة المعاملة');

      console.log(`🎉 [Swap] نجاح! ${swapSignature}`);

      return {
        success:      true,
        signature:    swapSignature,
        inputAmount:  amount,
        outputAmount: parseInt(quote.outAmount) / Math.pow(10, outputDecimals),
        inputSymbol,
        outputSymbol,
        explorerUrl:  `https://solscan.io/tx/${swapSignature}`,
      };

    } catch (err) {
      console.error(`💥 [Swap] المحاولة ${attempt} فشلت:`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 3000));
      } else {
        return { success: false, error: err.message };
      }
    }
  }
  return { success: false, error: 'فشلت جميع محاولات التبادل' };
}

// ─── checkBalance ─────────────────────────────────────────────────────────────
export async function checkBalance(tokenSymbol, amount, publicKey) {
  try {
    const pubKeyStr = publicKey || await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) return { hasBalance: false, balance: 0, required: amount };

    // ✅ تحقق من دعم العملة
    if (!TOKEN_MINTS[tokenSymbol]) {
      console.warn(`[checkBalance] عملة غير مدعومة: ${tokenSymbol}`);
      return { hasBalance: false, balance: 0, required: amount };
    }

    const solBalance = await getSolBalance(true, pubKeyStr);

    if (tokenSymbol === 'SOL') {
      const required = amount + SERVICE_FEE_SOL + 0.00001;
      return { hasBalance: solBalance >= required, balance: solBalance, required };
    }

    const tokenBalance   = await getTokenBalance(TOKEN_MINTS[tokenSymbol], true, pubKeyStr);
    const hasEnoughToken = tokenBalance >= amount;
    const hasEnoughSol   = solBalance   >= SERVICE_FEE_SOL + 0.00001;

    return {
      hasBalance: hasEnoughToken && hasEnoughSol,
      balance:    tokenBalance,
      required:   amount,
    };
  } catch (err) {
    console.error('❌ [checkBalance]:', err.message);
    return { hasBalance: false, balance: 0, required: amount };
  }
}

// ─── getSwapRate ──────────────────────────────────────────────────────────────
export async function getSwapRate(inputSymbol, outputSymbol, amount) {
  // ✅ تحقق مبكر
  if (!TOKEN_MINTS[inputSymbol] || !TOKEN_MINTS[outputSymbol]) {
    throw new Error('عملة غير مدعومة في التبادل');
  }

  try {
    const inputDecimals  = TOKEN_DECIMALS[inputSymbol]  || 9;
    const outputDecimals = TOKEN_DECIMALS[outputSymbol] || 9;
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));
    const slippage = (inputSymbol === 'MECO' || outputSymbol === 'MECO') ? 300 : 100;

    const quote = await getSwapQuote(
      TOKEN_MINTS[inputSymbol],
      TOKEN_MINTS[outputSymbol],
      amountInSmallestUnit,
      slippage,
    );

    const outputAmount   = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);
    const inputAmountReal= parseInt(quote.inAmount)  / Math.pow(10, inputDecimals);
    const rate           = outputAmount / inputAmountReal;
    const priceImpact    = quote.routePlan?.[0]?.priceImpactPct || 0;

    return {
      rate,
      outputAmount,
      priceImpact,
      marketInfos: quote.routePlan?.map(r => ({
        percent: r.portionBps ? r.portionBps / 100 : 100,
        label:   r.swapInfo?.label || 'Direct',
      })),
    };
  } catch (err) {
    console.error('[getSwapRate]:', err.message);
    throw err;
  }
}
