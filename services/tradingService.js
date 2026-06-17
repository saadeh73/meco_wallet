// services/tradingService.js
import * as web3 from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import heliusService from './heliusService';

// ✅ Market Swap — endpoint مثبت وعامل
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';

// ✅ Limit Order — نجرب كل endpoints بالتوالي
const LIMIT_ENDPOINTS = [
  'https://api.jup.ag/limit/v1',
  'https://jup.ag/api/limit/v1',
  'https://api.jup.ag/limit/v2',
  'https://jup.ag/api/limit/v2',
];

const LIMIT_ORDERS_KEY = '@meco_limit_orders';

// ─── جلب المفتاح الخاص ────────────────────────────────────────────────────────
async function getKeypair(activeIndex) {
  let pk = await SecureStore.getItemAsync(`wallet_private_key_${activeIndex}`);
  if (!pk && activeIndex === 0) pk = await SecureStore.getItemAsync('wallet_private_key');
  if (!pk) throw new Error('Private key not found');
  const secretKey = pk.startsWith('[') ? new Uint8Array(JSON.parse(pk)) : bs58.decode(pk);
  return web3.Keypair.fromSecretKey(secretKey);
}

// ─── توقيع وإرسال ─────────────────────────────────────────────────────────────
async function signAndSend(txBase64, activeIndex) {
  const keypair    = await getKeypair(activeIndex);
  const connection = await heliusService.getConnection();
  const buffer     = Buffer.from(txBase64, 'base64');
  try {
    // ✅ Versioned أولاً دائماً
    const vTx  = web3.VersionedTransaction.deserialize(buffer);
    const luts = await Promise.all(
      (vTx.message.addressTableLookups || []).map(async lut =>
        (await connection.getAddressLookupTable(lut.accountKey)).value
      )
    );
    const validLuts = luts.filter(Boolean);
    const msg = web3.TransactionMessage.decompile(vTx.message, {
      addressLookupTableAccounts: validLuts,
    });
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    msg.recentBlockhash = blockhash;
    const rebuilt = new web3.VersionedTransaction(msg.compileToV0Message(validLuts));
    rebuilt.sign([keypair]);
    const sig = await connection.sendRawTransaction(rebuilt.serialize(), {
      skipPreflight: false, preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(sig, 'confirmed');
    return sig;
  } catch (e) {
    // ✅ Legacy fallback فقط إذا فشل Versioned
    if (!e.message?.includes('Versioned') && !e.message?.includes('deserialize')) {
      const tx = web3.Transaction.from(buffer);
      tx.partialSign(keypair);
      const sig = await connection.sendRawTransaction(
        tx.serialize({ requireAllSignatures: false }),
        { skipPreflight: false }
      );
      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    }
    throw e;
  }
}

// ─── Jupiter Quote ────────────────────────────────────────────────────────────
async function getQuote(inputMint, outputMint, amount) {
  const res = await fetch(
    `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`
  );
  if (!res.ok) throw new Error(`Quote failed: ${res.status}`);
  const quote = await res.json();
  if (quote.error) throw new Error(quote.error);
  if (!quote.routePlan?.length) throw new Error('No route available');
  return quote;
}

// ─── Jupiter Swap TX ──────────────────────────────────────────────────────────
async function buildSwapTx(quote, walletPublicKey) {
  const res = await fetch(`${JUPITER_QUOTE_API}/swap`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse:             quote,
      userPublicKey:             walletPublicKey,
      wrapAndUnwrapSol:          true,
      dynamicComputeUnitLimit:   true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!res.ok) throw new Error(`Swap build failed: ${res.status}`);
  const data = await res.json();
  if (!data.swapTransaction) throw new Error('No swap transaction returned');
  return data.swapTransaction;
}

// ─── Market Swap ✅ ────────────────────────────────────────────────────────────
export async function executeMarketSwap({
  inputMint, outputMint, amount, walletPublicKey, activeIndex
}) {
  const quote  = await getQuote(inputMint, outputMint, amount);
  const swapTx = await buildSwapTx(quote, walletPublicKey);
  return signAndSend(swapTx, activeIndex);
}

// ─── Limit Order — نجرب كل endpoints حتى يعمل أحدها ✅ ─────────────────────
async function tryCreateLimitOrder(body) {
  const errors = [];
  for (const base of LIMIT_ENDPOINTS) {
    try {
      const res = await fetch(`${base}/createOrder`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        // بعض الـ endpoints تُرجع tx وأخرى تُرجع transaction
        const txBase64 = data.tx || data.transaction || data.swapTransaction;
        if (txBase64) return txBase64;
      }
      errors.push(`${base}: ${res.status}`);
    } catch (e) {
      errors.push(`${base}: ${e.message}`);
    }
  }
  throw new Error(`Limit order failed on all endpoints:\n${errors.join('\n')}`);
}

export async function executeLimitOrder({
  inputMint, outputMint, inAmount, outAmount, walletPublicKey, activeIndex
}) {
  const txBase64 = await tryCreateLimitOrder({
    owner:      walletPublicKey,
    inputMint,  outputMint,
    inAmount:   inAmount.toString(),
    outAmount:  outAmount.toString(),
    expiredAt:  null,
  });
  return signAndSend(txBase64, activeIndex);
}

// ─── Cancel Limit Order ───────────────────────────────────────────────────────
async function tryCancelLimitOrder(body) {
  const errors = [];
  for (const base of LIMIT_ENDPOINTS) {
    try {
      const res = await fetch(`${base}/cancelOrders`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const txs  = data.txs || data.transactions || [];
        if (txs.length) return txs;
      }
      errors.push(`${base}: ${res.status}`);
    } catch (e) {
      errors.push(`${base}: ${e.message}`);
    }
  }
  throw new Error(`Cancel failed on all endpoints:\n${errors.join('\n')}`);
}

export async function cancelLimitOrder({ orderPubkey, walletPublicKey, activeIndex }) {
  const txs = await tryCancelLimitOrder({ owner: walletPublicKey, orders: [orderPubkey] });
  for (const tx of txs) await signAndSend(tx, activeIndex);
}

// ─── Open Orders — نجرب كل endpoints ─────────────────────────────────────────
export async function getOpenLimitOrders(walletPublicKey) {
  for (const base of LIMIT_ENDPOINTS) {
    try {
      const res = await fetch(`${base}/openOrders?wallet=${walletPublicKey}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (_) {}
  }
  // fallback → أوامر محلية
  return getLocalOpenOrders(walletPublicKey);
}

// ─── Local Orders (AsyncStorage) — احتياطي دائم ───────────────────────────────
export async function saveLocalLimitOrder(order) {
  try {
    const existing = await AsyncStorage.getItem(LIMIT_ORDERS_KEY);
    const orders   = existing ? JSON.parse(existing) : [];
    orders.unshift({
      ...order,
      id:        Date.now().toString(),
      publicKey: Date.now().toString(),
      status:    'open',
      createdAt: new Date().toISOString(),
    });
    await AsyncStorage.setItem(LIMIT_ORDERS_KEY, JSON.stringify(orders));
  } catch (_) {}
}

export async function getLocalOpenOrders(walletPublicKey) {
  try {
    const stored = await AsyncStorage.getItem(LIMIT_ORDERS_KEY);
    if (!stored) return [];
    return JSON.parse(stored).filter(o =>
      o.wallet === walletPublicKey && o.status === 'open'
    );
  } catch (_) { return []; }
}

export async function cancelLocalLimitOrder(orderId) {
  try {
    const stored = await AsyncStorage.getItem(LIMIT_ORDERS_KEY);
    if (!stored) return;
    const orders  = JSON.parse(stored);
    const updated = orders.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o);
    await AsyncStorage.setItem(LIMIT_ORDERS_KEY, JSON.stringify(updated));
  } catch (_) {}
}
