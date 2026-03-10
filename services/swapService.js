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

// ✅ الأصفار العشرية محلياً لتجاوز خطأ RPC
export const TOKEN_DECIMALS = {
  SOL: 9, MECO: 9, USDT: 6, USDC: 6,
};

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

async function getKeypair() {
  try {
    const secretKeyStr = await SecureStore.getItemAsync('wallet_private_key');
    if (!secretKeyStr) throw new Error('Private key not found');

    let secretKey;
    if (secretKeyStr.startsWith('[')) {
      secretKey = new Uint8Array(JSON.parse(secretKeyStr));
    } else {
      secretKey = bs58.decode(secretKeyStr);
    }
    return web3.Keypair.fromSecretKey(secretKey);
  } catch (error) {
    throw error;
  }
}

async function getConnection() {
  // ✅ استخدام سيرفر Ankr لضمان عدم حدوث Rate Limit في وضع الإنتاج
  return new web3.Connection('https://rpc.ankr.com/solana', 'confirmed');
}

export async function getSwapQuote(inputMint, outputMint, amount, slippageBps = 50) {
  try {
    const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&swapMode=ExactIn&onlyDirectRoutes=false`;

    // ✅ الاعتماد على الـ Headers الأساسية فقط لتجنب حظر Cloudflare (كما فعلت في الأسعار)
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) throw new Error(`تعذر إيجاد مسار سيولة لهذا التبادل`);

    const quote = await response.json();
    if (!quote || !quote.routePlan || quote.routePlan.length === 0) {
      throw new Error('لا يوجد سيولة كافية لهذا التبادل حالياً');
    }
    return quote;
  } catch (error) {
    throw error;
  }
}

export async function buildSwapTransaction(quote, userPublicKey) {
  try {
    const response = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      })
    });

    if (!response.ok) throw new Error(`فشل بناء المعاملة في Jupiter`);
    const swapData = await response.json();
    if (!swapData || !swapData.swapTransaction) throw new Error('بيانات المعاملة غير صالحة');

    return swapData;
  } catch (error) {
    throw error;
  }
}

export async function executeSwap(inputSymbol, outputSymbol, amount, slippageBps = 50) {
  try {
    if (!TOKEN_MINTS[inputSymbol] || !TOKEN_MINTS[outputSymbol]) {
      throw new Error('العملة غير مدعومة');
    }

    const keypair = await getKeypair();
    const connection = await getConnection();

    const inputDecimals = TOKEN_DECIMALS[inputSymbol] || 9;
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));

    const quote = await getSwapQuote(
      TOKEN_MINTS[inputSymbol], TOKEN_MINTS[outputSymbol], amountInSmallestUnit, slippageBps
    );

    const swapData = await buildSwapTransaction(quote, keypair.publicKey);

    const transactionBuffer = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = web3.VersionedTransaction.deserialize(transactionBuffer);
    transaction.sign([keypair]);

    // ✅ إرسال المعاملة بطريقة تتجاوز الفشل الوهمي للشبكة
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      preflightCommitment: 'confirmed',
    });

    const latestBlockhash = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) throw new Error(`فشلت المعاملة على الشبكة`);

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
    return { success: false, error: error.message };
  }
}

export async function getSwapRate(inputSymbol, outputSymbol, amount) {
  try {
    const inputDecimals = TOKEN_DECIMALS[inputSymbol] || 9;
    const amountInSmallestUnit = Math.floor(amount * Math.pow(10, inputDecimals));

    const quote = await getSwapQuote(TOKEN_MINTS[inputSymbol], TOKEN_MINTS[outputSymbol], amountInSmallestUnit);

    const outputDecimals = TOKEN_DECIMALS[outputSymbol] || 9;
    const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);

    return {
      rate: outputAmount / amount,
      outputAmount,
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
    const publicKey = keypair.publicKey;

    let balance;
    if (tokenSymbol === 'SOL') {
      balance = await connection.getBalance(publicKey) / web3.LAMPORTS_PER_SOL;
    } else {
      const mint = new web3.PublicKey(TOKEN_MINTS[tokenSymbol]);
      const ata = await splToken.getAssociatedTokenAddress(mint, publicKey);
      const accountInfo = await connection.getAccountInfo(ata);
      
      if (!accountInfo) {
        balance = 0;
      } else {
        const tokenAccount = splToken.AccountLayout.decode(accountInfo.data);
        const decimals = TOKEN_DECIMALS[tokenSymbol] || 9;
        balance = Number(tokenAccount.amount) / Math.pow(10, decimals);
      }
    }
    return { hasBalance: balance >= amount, balance, required: amount };
  } catch (error) {
    return { hasBalance: false, balance: 0, required: amount };
  }
}
