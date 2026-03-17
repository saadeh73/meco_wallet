import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

// ✅ عناوين العملات
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  MECO: '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i',
  USDT: 'Es9vMFrzaCERc8Foa8XfRduKiSfrhEL5c7qr2WXXBWY5',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

export const TOKEN_DECIMALS = { SOL: 9, MECO: 9, USDT: 6, USDC: 6 };

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// 🛡️ هيدرات التنكر لاختراق حماية Cloudflare الخاصة بـ Jupiter
const GET_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const POST_HEADERS = {
  ...GET_HEADERS,
  'Content-Type': 'application/json',
};

async function getKeypair() {
  const secretKeyStr = await SecureStore.getItemAsync('wallet_private_key');
  if (!secretKeyStr) throw new Error('لم يتم العثور على المفتاح الخاص بالمحفظة');
  let secretKey = secretKeyStr.startsWith('[') ? new Uint8Array(JSON.parse(secretKeyStr)) : bs58.decode(secretKeyStr);
  return web3.Keypair.fromSecretKey(secretKey);
}

// 🚀 استخدام سيرفر Ankr السريع لأنه الأفضل في تحمل المعاملات المعقدة
async function getConnection() {
  return new web3.Connection('https://rpc.ankr.com/solana', 'confirmed');
}

export async function getSwapQuote(inputMint, outputMint, amount, slippageBps = 50) {
  try {
    const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&swapMode=ExactIn`;
    
    console.log("Fetching quote from Jupiter...");
    const response = await fetch(url, { method: 'GET', headers: GET_HEADERS });
    
    if (!response.ok) {
      const errTxt = await response.text();
      console.log("Jupiter Quote Error:", errTxt);
      throw new Error(`رفض من سيرفر Jupiter (Code: ${response.status})`);
    }
    
    const quote = await response.json();
    if (!quote || !quote.routePlan) throw new Error('لا يوجد مسار سيولة متاح حالياً');
    return quote;
  } catch (error) {
    if (error.message.includes('Network request failed')) {
      throw new Error('انقطع الاتصال بالإنترنت، يرجى التحقق من الشبكة.');
    }
    throw error;
  }
}

export async function buildSwapTransaction(quote, userPublicKey) {
  try {
    console.log("Building swap transaction...");
    const response = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: POST_HEADERS,
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto' // تفعيل الرسوم التلقائية لتسريع المعاملة
      })
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.log("Jupiter Build Error:", errTxt);
      throw new Error(`فشل بناء المعاملة في Jupiter (Code: ${response.status})`);
    }
    
    const data = await response.json();
    if (!data.swapTransaction) throw new Error('استجاب Jupiter ببيانات غير صالحة');
    return data;
  } catch (error) {
    if (error.message.includes('Network request failed')) {
      throw new Error('فشل الاتصال بسيرفرات التبادل، يرجى المحاولة لاحقاً.');
    }
    throw error;
  }
}

export async function executeSwap(inputSymbol, outputSymbol, amount, slippageBps = 50) {
  try {
    console.log(`Starting swap: ${amount} ${inputSymbol} to ${outputSymbol}`);
    const keypair = await getKeypair();
    const connection = await getConnection();

    const inputDecimals = TOKEN_DECIMALS[inputSymbol] || 9;
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));

    // 1. جلب التسعيرة
    const quote = await getSwapQuote(TOKEN_MINTS[inputSymbol], TOKEN_MINTS[outputSymbol], amountInSmallestUnit, slippageBps);
    
    // 2. بناء المعاملة
    const swapData = await buildSwapTransaction(quote, keypair.publicKey);

    // 3. التوقيع والإرسال
    console.log("Signing and sending transaction...");
    const transactionBuffer = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = web3.VersionedTransaction.deserialize(transactionBuffer);
    transaction.sign([keypair]);

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    
    // إرسال المعاملة بدون فحص مسبق (Skip Preflight) لتجنب فشل الشبكة الوهمي
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 3
    });

    console.log("Confirming transaction: ", signature);
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`تم رفض المعاملة من قبل شبكة Solana (Timeout/Error)`);
    }

    const outputDecimals = TOKEN_DECIMALS[outputSymbol] || 9;
    const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);

    return {
      success: true,
      signature,
      inputAmount: amount,
      outputAmount,
      inputSymbol,
      outputSymbol,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    };
  } catch (error) {
    console.error("Execute Swap Error:", error);
    // إرجاع رسالة الخطأ الدقيقة لتظهر في شاشة الـ Swap بدلاً من "فشل الشبكة"
    return { success: false, error: error.message }; 
  }
}

export async function getSwapRate(inputSymbol, outputSymbol, amount) {
  try {
    const inputDecimals = TOKEN_DECIMALS[inputSymbol] || 9;
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));
    const quote = await getSwapQuote(TOKEN_MINTS[inputSymbol], TOKEN_MINTS[outputSymbol], amountInSmallestUnit);
    const outputDecimals = TOKEN_DECIMALS[outputSymbol] || 9;
    return {
      rate: (parseInt(quote.outAmount) / Math.pow(10, outputDecimals)) / amount,
      outputAmount: parseInt(quote.outAmount) / Math.pow(10, outputDecimals),
      priceImpact: parseFloat(quote.priceImpactPct) || 0,
    };
  } catch (error) {
    throw error;
  }
}

export async function checkBalance(tokenSymbol, amount) {
  try {
    const keypair = await getKeypair();
    const connection = await getConnection();
    let balance = 0;
    if (tokenSymbol === 'SOL') {
      balance = await connection.getBalance(keypair.publicKey) / web3.LAMPORTS_PER_SOL;
    } else {
      const mint = new web3.PublicKey(TOKEN_MINTS[tokenSymbol]);
      const ata = await splToken.getAssociatedTokenAddress(mint, keypair.publicKey);
      const accountInfo = await connection.getAccountInfo(ata);
      if (accountInfo) {
        const tokenAccount = splToken.AccountLayout.decode(accountInfo.data);
        balance = Number(tokenAccount.amount) / Math.pow(10, TOKEN_DECIMALS[tokenSymbol]);
      }
    }
    return { hasBalance: balance >= amount, balance, required: amount };
  } catch (error) {
    return { hasBalance: false, balance: 0, required: amount };
  }
}
