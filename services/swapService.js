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

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

const HEADERS = { 'Accept': 'application/json', 'Content-Type': 'application/json' };

async function getKeypair() {
  const secretKeyStr = await SecureStore.getItemAsync('wallet_private_key');
  if (!secretKeyStr) throw new Error('لم يتم العثور على المفتاح الخاص بالمحفظة');
  let secretKey = secretKeyStr.startsWith('[') ? new Uint8Array(JSON.parse(secretKeyStr)) : bs58.decode(secretKeyStr);
  return web3.Keypair.fromSecretKey(secretKey);
}

// 🚀 سيرفر Helius القوي لضمان تنفيذ المبادلة
async function getConnection() {
  const HELIUS_URL = process.env.EXPO_PUBLIC_HELIUS_RPC;
  if (HELIUS_URL) {
    return new web3.Connection(HELIUS_URL, 'confirmed');
  }
  return new web3.Connection('https://rpc.ankr.com/solana', 'confirmed');
}

export async function getSwapQuote(inputMint, outputMint, amount, slippageBps = 50) {
  try {
    const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    
    if (!response.ok) throw new Error(`تعذر إيجاد مسار سيولة (Code: ${response.status})`);
    
    const quote = await response.json();
    if (!quote || !quote.routePlan) throw new Error('لا يوجد سيولة كافية لهذا التبادل حالياً');
    return quote;
  } catch (error) {
    if (error.message.includes('Network request failed')) throw new Error('تأكد من اتصالك بالإنترنت');
    throw error;
  }
}

// 🛠️ الإصلاح الجذري: بناء المعاملة الحديثة (Versioned)
export async function executeSwap(inputSymbol, outputSymbol, amount, slippageBps = 50) {
  try {
    console.log(`🔄 بدء المبادلة: ${amount} ${inputSymbol} -> ${outputSymbol}`);
    
    const keypair = await getKeypair();
    const connection = await getConnection();

    const inputDecimals = TOKEN_DECIMALS[inputSymbol] || 9;
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));

    // 1. جلب التسعيرة
    const quote = await getSwapQuote(TOKEN_MINTS[inputSymbol], TOKEN_MINTS[outputSymbol], amountInSmallestUnit, slippageBps);

    // 2. بناء المعاملة مع رسوم أولوية لضمان عدم إسقاطها
    console.log("⚙️ بناء المعاملة في Jupiter...");
    const swapReq = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto" // 🚀 مهم جداً لسولانا حالياً
      })
    });

    if (!swapReq.ok) {
      const err = await swapReq.text();
      throw new Error(`فشل بناء المعاملة: ${err.slice(0, 30)}`);
    }

    const { swapTransaction } = await swapReq.json();
    if (!swapTransaction) throw new Error('بيانات المبادلة فارغة من السيرفر');

    // 3. التوقيع الحديث (Versioned Transaction)
    console.log("✍️ توقيع المعاملة...");
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = web3.VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([keypair]);

    // 4. الإرسال القوي وتجاوز الفشل الوهمي
    console.log("🚀 إرسال المعاملة للبلوكتشين...");
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true, // 🚀 تجاوز الفحص المسبق الذي يسبب خطأ الشبكة الوهمي
      maxRetries: 3
    });

    console.log(`⏳ انتظار التأكيد: ${signature}`);
    
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`تم رفض المعاملة من البلوكتشين (مزدحم أو الرصيد غير كافٍ)`);
    }

    const outputDecimals = TOKEN_DECIMALS[outputSymbol] || 9;
    const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);

    console.log("✅ المبادلة تمت بنجاح!");
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
    console.error("❌ Execute Swap Error:", error);
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
