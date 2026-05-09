import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

// ✅ استيراد دوال heliusService الموثوقة
import { getSolBalance, getTokenBalance } from './heliusService';
import { default as heliusService } from './heliusService';

// ✅ جميع العملات الـ 16
export const CORE_TOKENS = [
  { symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', image: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', swapAvailable: true },
  { symbol: 'MECO', name: 'Meco Token', mint: '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i', image: 'https://bafybeicr6h2x642z42k3t6s3mnhx4t3c6h35z7x7t6q2y3w6k4s7m5t6p4.ipfs.nftstorage.link/', swapAvailable: true },
  { symbol: 'USDT', name: 'Tether USD', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', image: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png', swapAvailable: true },
  { symbol: 'USDC', name: 'USD Coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', image: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png', swapAvailable: true }
];

export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  MECO: '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
};

export const TOKEN_DECIMALS = {
  SOL: 9, MECO: 9, USDT: 6, USDC: 6
};

// ✅ عنوان خزينة المشروع ورسم الخدمة
const FEE_COLLECTOR_ADDRESS = 'HgiM3jHagH1F6KsLRSfBPGcpSrf8CE9sEujz1Nb3FTWG';
const SERVICE_FEE_SOL = 0.0005;

// ✅ نقاط نهاية Jupiter
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const JUPITER_LITE_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_LITE_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap';

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

function getKeypairFromPrivateKey(privateKey) {
  if (!privateKey) throw new Error('المفتاح الخاص غير موجود');
  let secretKey;
  if (privateKey.startsWith('[')) {
    secretKey = new Uint8Array(JSON.parse(privateKey));
  } else {
    secretKey = bs58.decode(privateKey);
  }
  return web3.Keypair.fromSecretKey(secretKey);
}

async function getKeypair() {
  const secretKeyStr = await SecureStore.getItemAsync('wallet_private_key');
  if (!secretKeyStr) throw new Error('المفتاح الخاص غير موجود');
  return getKeypairFromPrivateKey(secretKeyStr);
}

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
    // 🛑 إضافة معاملات Jupiter لتخطي القائمة الصارمة والسماح بالسيولة الضعيفة
    const isMeco = inputMint === TOKEN_MINTS.MECO || outputMint === TOKEN_MINTS.MECO;
    const extraParams = isMeco ? '&onlyDirectRoutes=false&asLegacyTransaction=true' : '';
    
    const url = `${endpoint.url}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}${extraParams}`;
    console.log(`🔍 [Quote] محاولة ${endpoint.name}...`);
    try {
      const response = await fetchWithTimeout(url, { method: 'GET', headers: BROWSER_HEADERS }, 15000);
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`⚠️ [Quote] ${endpoint.name} فشل (${response.status}):`, errorText);
        throw new Error(errorText);
      }
      const quote = await response.json();
      if (!quote?.routePlan) throw new Error('لا يوجد مسار للتبادل (السيولة قد تكون ضعيفة جداً)');
      console.log(`✅ [Quote] نجح عبر ${endpoint.name}`);
      return quote;
    } catch (error) {
      console.warn(`❌ [Quote] ${endpoint.name} فشل:`, error.message);
      lastError = error;
    }
  }
  throw new Error(`تعذر الاتصال بخوادم Jupiter أو لا يوجد مسار للتبادل. ${lastError?.message || ''}`);
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
          prioritizationFeeLamports: "auto",
          asLegacyTransaction: true // لتفادي أخطاء الإصدارات الحديثة مع العملات الجديدة
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
export async function executeSwap(inputSymbol, outputSymbol, amount, slippageBps = 100, maxRetries = 3, publicKey, privateKey) {
  console.log(`🚀 [Swap] بدء التبادل: ${amount} ${inputSymbol} -> ${outputSymbol}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [Swap] المحاولة ${attempt} من ${maxRetries}...`);

      let keypair;
      if (privateKey) {
        keypair = getKeypairFromPrivateKey(privateKey);
      } else {
        keypair = await getKeypair();
      }

      const userPublicKey = publicKey || keypair.publicKey.toString();
      const connection = await getConnection();

      const balanceCheck = await checkBalance(inputSymbol, amount, userPublicKey);
      if (!balanceCheck.hasBalance) {
        throw new Error(`رصيد ${inputSymbol} غير كاف. أو لا تملك رسوم الشبكة والخدمة.`);
      }

      const inputDecimals = TOKEN_DECIMALS[inputSymbol] || 9;
      const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));

      console.log(`💸 [Fee] جاري بناء معاملة رسوم التطبيق (${SERVICE_FEE_SOL} SOL)...`);
      const feeTx = new web3.Transaction().add(
        web3.SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new web3.PublicKey(FEE_COLLECTOR_ADDRESS),
          lamports: Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL),
        })
      );
      let latestBlockhash = await connection.getLatestBlockhash('confirmed');
      feeTx.recentBlockhash = latestBlockhash.blockhash;
      feeTx.feePayer = keypair.publicKey;

      const quote = await getSwapQuote(TOKEN_MINTS[inputSymbol], TOKEN_MINTS[outputSymbol], amountInSmallestUnit, slippageBps);
      const swapData = await buildSwapTransaction(quote, new web3.PublicKey(userPublicKey));

      feeTx.sign(keypair);

      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const swapTx = web3.VersionedTransaction.deserialize(swapTransactionBuf);
      swapTx.sign([keypair]);

      console.log(`📡 [Swap] جاري إرسال معاملة الرسوم والمبادلة للشبكة...`);

      const feeSignature = await connection.sendRawTransaction(feeTx.serialize(), { skipPreflight: true });
      console.log(`✅ [Fee] تم إرسال الرسوم: ${feeSignature}`);

      const serializedSwapTx = swapTx.serialize();
      const uint8ArraySwapTx = new Uint8Array(serializedSwapTx.buffer, serializedSwapTx.byteOffset, serializedSwapTx.byteLength);

      let swapSignature;
      try {
        swapSignature = await connection.sendRawTransaction(uint8ArraySwapTx, {
          skipPreflight: true,
          maxRetries: 5,
          preflightCommitment: 'processed',
        });
      } catch (sendError) {
        swapSignature = await web3.sendAndConfirmTransaction(
          connection,
          swapTx,
          [keypair],
          { skipPreflight: true, commitment: 'confirmed' }
        );
      }

      console.log(`📤 [Swap] تم إرسال المبادلة: ${swapSignature}`);

      let confirmation;
      let confirmAttempt = 0;

      while (confirmAttempt < 3) {
        try {
          confirmation = await connection.confirmTransaction({
            signature: swapSignature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          }, 'confirmed');

          if (!confirmation.value.err) break;
          else throw new Error(`رفضت الشبكة المعاملة`);
        } catch (confirmError) {
          confirmAttempt++;
          if (confirmAttempt < 3) {
            latestBlockhash = await connection.getLatestBlockhash('confirmed');
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          throw confirmError;
        }
      }

      if (confirmation?.value?.err) throw new Error(`رفضت الشبكة المعاملة`);

      console.log(`🎉 [Swap] نجاح! تم تأكيد المعاملة: ${swapSignature}`);

      const outputDecimals = TOKEN_DECIMALS[outputSymbol] || 9;
      const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);

      return {
        success: true,
        signature: swapSignature,
        inputAmount: amount,
        outputAmount,
        inputSymbol,
        outputSymbol,
        explorerUrl: `https://solscan.io/tx/${swapSignature}`
      };

    } catch (error) {
      console.error(`💥 [Swap] المحاولة ${attempt} فشلت:`, error.message);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        return { success: false, error: error.message };
      }
    }
  }
  return { success: false, error: 'فشلت جميع محاولات التبادل' };
}

export async function checkBalance(tokenSymbol, amount, publicKey) {
  try {
    const pubKeyStr = publicKey || await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) {
      return { hasBalance: false, balance: 0, required: amount };
    }

    const solBalance = await getSolBalance(true, pubKeyStr);

    if (tokenSymbol === 'SOL') {
      const requiredSol = amount + SERVICE_FEE_SOL + 0.00001;
      return { hasBalance: solBalance >= requiredSol, balance: solBalance, required: requiredSol };
    }

    else {
      const mint = TOKEN_MINTS[tokenSymbol];
      if (!mint) return { hasBalance: false, balance: 0, required: amount };

      const tokenBalance = await getTokenBalance(mint, true, pubKeyStr);

      const hasEnoughToken = tokenBalance >= amount;
      const hasEnoughSolForFee = solBalance >= (SERVICE_FEE_SOL + 0.00001);

      return {
        hasBalance: hasEnoughToken && hasEnoughSolForFee,
        balance: tokenBalance,
        required: amount
      };
    }
  } catch (error) {
    console.error('❌ [checkBalance] خطأ:', error.message);
    return { hasBalance: false, balance: 0, required: amount };
  }
}

export async function getSwapRate(inputSymbol, outputSymbol, amount) {
  try {
    const inputDecimals = TOKEN_DECIMALS[inputSymbol] || 9;
    const outputDecimals = TOKEN_DECIMALS[outputSymbol] || 9;
    
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));
    
    // استخدام Slipapge 300 (أي 3%) للعملات الجديدة لضمان التبادل
    const slippage = (inputSymbol === 'MECO' || outputSymbol === 'MECO') ? 300 : 100;

    const quote = await getSwapQuote(
      TOKEN_MINTS[inputSymbol],
      TOKEN_MINTS[outputSymbol],
      amountInSmallestUnit,
      slippage 
    );
    
    const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);
    const inputAmountReal = parseInt(quote.inAmount) / Math.pow(10, inputDecimals);
    
    const rate = outputAmount / inputAmountReal;
    const priceImpact = quote.routePlan?.[0]?.priceImpactPct || 0;
    
    return {
      rate,
      outputAmount,
      priceImpact,
      marketInfos: quote.routePlan?.map(route => ({
        percent: route.portionBps ? route.portionBps / 100 : 100,
        label: route.swapInfo?.label || 'Direct'
      }))
    };
  } catch (error) {
    console.error('[getSwapRate] خطأ:', error.message);
    throw error;
  }
}
