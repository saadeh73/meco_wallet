// services/tradingService.js
import * as web3 from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { default as heliusService } from './heliusService';

const FEE_COLLECTOR_ADDRESS = 'BkaJsFAJKPQZgreBFLrY2pPUi44fTJzXhmeBc8LeuF5W';
const SERVICE_FEE_SOL       = 0.0005;
const JUPITER_API_KEY       = 'jup_c50a1fd6f89facc37df71bf8bb1dbc83ad49e3ce896d33fc171291d11e28efd2';
const MECO_MINT             = 'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W';

const JUPITER_QUOTE_API      = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API       = 'https://quote-api.jup.ag/v6/swap';
const JUPITER_LITE_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_LITE_SWAP_API  = 'https://lite-api.jup.ag/swap/v1/swap';
const JUPITER_LIMIT_API      = 'https://api.jup.ag/limit/v2';

const BROWSER_HEADERS = {
  'Accept':       'application/json',
  'Content-Type': 'application/json',
  'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin':       'https://jup.ag',
  'Referer':      'https://jup.ag/',
  'x-api-key':    JUPITER_API_KEY,
};

const fetchWT = async (url, options = {}, ms = 20000) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, credentials: 'omit' });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('انتهت مهلة الاتصال بالخادم');
    throw err;
  }
};

async function getKeypair(activeIndex) {
  let pk = await SecureStore.getItemAsync(`wallet_private_key_${activeIndex}`);
  if (!pk && activeIndex === 0) pk = await SecureStore.getItemAsync('wallet_private_key');
  if (!pk) throw new Error('المفتاح الخاص غير موجود');
  const secretKey = pk.startsWith('[') ? new Uint8Array(JSON.parse(pk)) : bs58.decode(pk);
  return web3.Keypair.fromSecretKey(secretKey);
}

async function getConnection() {
  try { return await heliusService.getConnection(); }
  catch (_) { return new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed'); }
}

// ─── Quote — مع معالجة MECO مطابقة لـ swapService ───────────────────────────
async function getQuote(inputMint, outputMint, amount, slippageBps = 50) {
  // ✅ نفس منطق swapService للـ MECO
  const isMeco          = inputMint === MECO_MINT || outputMint === MECO_MINT;
  const extraParams     = isMeco ? '&onlyDirectRoutes=false' : '';
  const effectiveSlippage = isMeco ? Math.max(slippageBps, 300) : slippageBps;

  const endpoints = [
    { name: 'Main V6',  url: JUPITER_QUOTE_API      },
    { name: 'Lite API', url: JUPITER_LITE_QUOTE_API },
  ];

  let lastError;
  for (const ep of endpoints) {
    try {
      const url = `${ep.url}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${effectiveSlippage}${extraParams}`;
      const res = await fetchWT(url, { method: 'GET', headers: BROWSER_HEADERS }, 15000);
      if (!res.ok) throw new Error(await res.text());
      const quote = await res.json();
      if (!quote?.routePlan?.length) throw new Error('لا يوجد مسار للتداول');
      return quote;
    } catch (err) { lastError = err; }
  }
  throw new Error(`تعذر الحصول على السعر: ${lastError?.message || ''}`);
}

// ─── Swap TX ──────────────────────────────────────────────────────────────────
async function buildSwapTx(quote, walletPublicKey) {
  const endpoints = [
    { url: JUPITER_SWAP_API      },
    { url: JUPITER_LITE_SWAP_API },
  ];
  let lastError;
  for (const ep of endpoints) {
    try {
      const res = await fetchWT(ep.url, {
        method: 'POST', headers: BROWSER_HEADERS,
        body: JSON.stringify({
          quoteResponse:             quote,
          userPublicKey:             walletPublicKey,
          wrapAndUnwrapSol:          true,
          dynamicComputeUnitLimit:   true,
          prioritizationFeeLamports: 'auto',
          asLegacyTransaction:       false,
        }),
      }, 20000);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!data.swapTransaction) throw new Error('بيانات المعاملة غير مكتملة');
      return data.swapTransaction;
    } catch (err) { lastError = err; }
  }
  throw new Error(`فشل بناء المعاملة: ${lastError?.message || ''}`);
}

// ─── تنفيذ المعاملة — الرسوم atomic ─────────────────────────────────────────
async function executeVersionedTx(swapTxBase64, keypair, connection, walletPublicKey) {
  const buffer = Buffer.from(swapTxBase64, 'base64');
  let tx       = web3.VersionedTransaction.deserialize(buffer);

  const luts = await Promise.all(
    tx.message.addressTableLookups.map(async lut =>
      (await connection.getAddressLookupTable(lut.accountKey)).value
    )
  );
  const validLuts = luts.filter(Boolean);

  const msg = web3.TransactionMessage.decompile(tx.message, {
    addressLookupTableAccounts: validLuts,
  });

  msg.instructions.push(
    web3.SystemProgram.transfer({
      fromPubkey: new web3.PublicKey(walletPublicKey),
      toPubkey:   new web3.PublicKey(FEE_COLLECTOR_ADDRESS),
      lamports:   Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL),
    })
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  msg.recentBlockhash = blockhash;
  tx = new web3.VersionedTransaction(msg.compileToV0Message(validLuts));
  tx.sign([keypair]);

  let sig;
  try {
    sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true, maxRetries: 5, preflightCommitment: 'processed',
    });
  } catch (_) {
    sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false, maxRetries: 3,
    });
  }

  let blockhashData = { blockhash, lastValidBlockHeight };
  for (let i = 0; i < 3; i++) {
    try {
      const conf = await connection.confirmTransaction(
        { signature: sig, ...blockhashData }, 'confirmed'
      );
      if (conf.value?.err) throw new Error('رفضت الشبكة المعاملة');
      break;
    } catch (err) {
      if (i < 2) {
        blockhashData = await connection.getLatestBlockhash('confirmed');
        await new Promise(r => setTimeout(r, 2000));
      } else throw err;
    }
  }

  return sig;
}

// ─── Market Swap ✅ ────────────────────────────────────────────────────────────
export async function executeMarketSwap({
  inputMint, outputMint, amount, walletPublicKey, activeIndex,
}) {
  const keypair    = await getKeypair(activeIndex);
  const connection = await getConnection();
  const quote      = await getQuote(inputMint, outputMint, amount);
  const swapTx     = await buildSwapTx(quote, walletPublicKey);
  return executeVersionedTx(swapTx, keypair, connection, walletPublicKey);
}

// ─── Limit Order ─────────────────────────────────────────────────────────────
export async function executeLimitOrder({
  inputMint, outputMint, inAmount, outAmount, walletPublicKey, activeIndex,
}) {
  const res = await fetchWT(`${JUPITER_LIMIT_API}/createOrder`, {
    method: 'POST', headers: BROWSER_HEADERS,
    body: JSON.stringify({
      owner: walletPublicKey, inputMint, outputMint,
      inAmount: inAmount.toString(), outAmount: outAmount.toString(), expiredAt: null,
    }),
  });
  if (!res.ok) throw new Error(`Limit order error: ${res.status}`);
  const data = await res.json();
  if (!data.tx) throw new Error('No limit order transaction returned');
  const keypair    = await getKeypair(activeIndex);
  const connection = await getConnection();
  return executeVersionedTx(data.tx, keypair, connection, walletPublicKey);
}

// ─── Cancel Limit Order ───────────────────────────────────────────────────────
export async function cancelLimitOrder({ orderPubkey, walletPublicKey, activeIndex }) {
  const res = await fetchWT(`${JUPITER_LIMIT_API}/cancelOrders`, {
    method: 'POST', headers: BROWSER_HEADERS,
    body: JSON.stringify({ owner: walletPublicKey, orders: [orderPubkey] }),
  });
  if (!res.ok) throw new Error(`Cancel error: ${res.status}`);
  const { txs } = await res.json();
  if (!txs?.length) throw new Error('No cancel transactions');
  const keypair    = await getKeypair(activeIndex);
  const connection = await getConnection();
  for (const tx of txs) await executeVersionedTx(tx, keypair, connection, walletPublicKey);
}

// ─── Open Orders ──────────────────────────────────────────────────────────────
export async function getOpenLimitOrders(walletPublicKey) {
  try {
    const res = await fetchWT(
      `${JUPITER_LIMIT_API}/openOrders?wallet=${walletPublicKey}`,
      { headers: BROWSER_HEADERS }
    );
    if (!res.ok) return [];
    return await res.json() || [];
  } catch (_) { return []; }
}
