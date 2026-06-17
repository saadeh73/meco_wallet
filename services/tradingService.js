// services/tradingService.js
import * as web3 from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import heliusService from './heliusService';

const JUPITER_QUOTE_API = 'https://api.jup.ag/swap/v1';

async function getKeypair(activeIndex) {
  let pk = await SecureStore.getItemAsync(`wallet_private_key_${activeIndex}`);
  if (!pk && activeIndex === 0) pk = await SecureStore.getItemAsync('wallet_private_key');
  if (!pk) throw new Error('Private key not found');
  const secretKey = pk.startsWith('[') ? new Uint8Array(JSON.parse(pk)) : bs58.decode(pk);
  return web3.Keypair.fromSecretKey(secretKey);
}

async function signAndSend(txBase64, activeIndex) {
  const keypair    = await getKeypair(activeIndex);
  const connection = await heliusService.getConnection();
  const buffer     = Buffer.from(txBase64, 'base64');
  try {
    const vTx  = web3.VersionedTransaction.deserialize(buffer);
    const luts = await Promise.all(
      (vTx.message.addressTableLookups || []).map(async lut =>
        (await connection.getAddressLookupTable(lut.accountKey)).value
      )
    );
    const validLuts = luts.filter(Boolean);
    const msg = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: validLuts });
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    msg.recentBlockhash = blockhash;
    const rebuilt = new web3.VersionedTransaction(msg.compileToV0Message(validLuts));
    rebuilt.sign([keypair]);
    const sig = await connection.sendRawTransaction(rebuilt.serialize(), { skipPreflight:false, preflightCommitment:'confirmed' });
    await connection.confirmTransaction(sig, 'confirmed');
    return sig;
  } catch (e) {
    if (!e.message?.includes('Versioned') && !e.message?.includes('deserialize')) {
      const tx = web3.Transaction.from(buffer);
      tx.partialSign(keypair);
      const sig = await connection.sendRawTransaction(
        tx.serialize({ requireAllSignatures:false }), { skipPreflight:false }
      );
      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    }
    throw e;
  }
}

// ─── Market Swap — كما هو بدون تغيير ─────────────────────────────────────────
export async function executeMarketSwap({ inputMint, outputMint, amount, walletPublicKey, activeIndex }) {
  const quoteRes = await fetch(
    `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`
  );
  if (!quoteRes.ok) throw new Error(`Quote error: ${quoteRes.status}`);
  const quote = await quoteRes.json();
  if (quote.error) throw new Error(quote.error);
  if (!quote.routePlan?.length) throw new Error('No route available');

  const swapRes = await fetch(`${JUPITER_QUOTE_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse:             quote,
      userPublicKey:             walletPublicKey,
      wrapAndUnwrapSol:          true,
      dynamicComputeUnitLimit:   true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!swapRes.ok) throw new Error(`Swap error: ${swapRes.status}`);
  const { swapTransaction } = await swapRes.json();
  if (!swapTransaction) throw new Error('No swap transaction returned');
  return signAndSend(swapTransaction, activeIndex);
}

// ─── Limit Order — التعديل الوحيد ─────────────────────────────────────────────
// ✅ نجرب v1 أولاً (أسماء حقول مختلفة) ثم v2 كـ fallback
export async function executeLimitOrder({ inputMint, outputMint, inAmount, outAmount, walletPublicKey, activeIndex }) {

  // محاولة 1: api.jup.ag/limit/v1 — أسماء الحقول القديمة
  try {
    const res = await fetch('https://api.jup.ag/limit/v1/createOrder', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner:     walletPublicKey,
        inputMint, outputMint,
        inAmount:  inAmount.toString(),
        outAmount: outAmount.toString(),
        expiredAt: null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const tx   = data.tx || data.transaction;
      if (tx) return await signAndSend(tx, activeIndex);
    }
  } catch (_) {}

  // محاولة 2: api.jup.ag/limit/v2 — أسماء الحقول الجديدة
  try {
    const res = await fetch('https://api.jup.ag/limit/v2/createOrder', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maker:         walletPublicKey,
        inputMint,     outputMint,
        makingAmount:  inAmount.toString(),
        takingAmount:  outAmount.toString(),
        expiredAt:     null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const tx   = data.tx || data.transaction || data.order;
      if (tx) return await signAndSend(tx, activeIndex);
    }
  } catch (_) {}

  // محاولة 3: quote-api — نفس الـ domain الذي يعمل مع market
  try {
    const res = await fetch('https://api.jup.ag/limit/v2/createOrder', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify({
        owner:     walletPublicKey,
        inputMint, outputMint,
        inAmount:  inAmount.toString(),
        outAmount: outAmount.toString(),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const tx   = data.tx || data.transaction;
      if (tx) return await signAndSend(tx, activeIndex);
    }
  } catch (_) {}

  throw new Error('limit_order_unavailable');
}

// ─── Cancel Limit Order ───────────────────────────────────────────────────────
export async function cancelLimitOrder({ orderPubkey, walletPublicKey, activeIndex }) {
  for (const base of ['https://api.jup.ag/limit/v1', 'https://api.jup.ag/limit/v2']) {
    try {
      const res = await fetch(`${base}/cancelOrders`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: walletPublicKey, orders: [orderPubkey] }),
      });
      if (res.ok) {
        const data = await res.json();
        const txs  = data.txs || data.transactions || [];
        for (const tx of txs) await signAndSend(tx, activeIndex);
        return;
      }
    } catch (_) {}
  }
}

// ─── Open Orders ──────────────────────────────────────────────────────────────
export async function getOpenLimitOrders(walletPublicKey) {
  for (const base of ['https://api.jup.ag/limit/v1', 'https://api.jup.ag/limit/v2']) {
    try {
      const res = await fetch(`${base}/openOrders?wallet=${walletPublicKey}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length >= 0) return data;
      }
    } catch (_) {}
  }
  return [];
}
