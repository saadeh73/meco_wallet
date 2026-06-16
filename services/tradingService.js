// services/tradingService.js
import * as web3 from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import heliusService from './heliusService';

const JUPITER_LIMIT_API = 'https://jup.ag/api/limit/v2';

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
      const sig = await connection.sendRawTransaction(tx.serialize({ requireAllSignatures:false }), { skipPreflight:false });
      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    }
    throw e;
  }
}

export async function executeMarketSwap({ inputMint, outputMint, amount, walletPublicKey, activeIndex }) {
  const quoteRes = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`);
  if (!quoteRes.ok) throw new Error(`Quote error: ${quoteRes.status}`);
  const quote = await quoteRes.json();
  if (quote.error) throw new Error(quote.error);
  if (!quote.routePlan?.length) throw new Error('No route available');

  const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ quoteResponse:quote, userPublicKey:walletPublicKey, wrapAndUnwrapSol:true, dynamicComputeUnitLimit:true, prioritizationFeeLamports:'auto' }),
  });
  if (!swapRes.ok) throw new Error(`Swap error: ${swapRes.status}`);
  const { swapTransaction } = await swapRes.json();
  if (!swapTransaction) throw new Error('No swap transaction');
  return signAndSend(swapTransaction, activeIndex);
}

export async function executeLimitOrder({ inputMint, outputMint, inAmount, outAmount, walletPublicKey, activeIndex }) {
  const res = await fetch(`${JUPITER_LIMIT_API}/createOrder`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ owner:walletPublicKey, inputMint, outputMint, inAmount:inAmount.toString(), outAmount:outAmount.toString(), expiredAt:null }),
  });
  if (!res.ok) throw new Error(`Limit order error: ${res.status}`);
  const data = await res.json();
  if (!data.tx) throw new Error('No limit order tx');
  return signAndSend(data.tx, activeIndex);
}

export async function cancelLimitOrder({ orderPubkey, walletPublicKey, activeIndex }) {
  const res = await fetch(`${JUPITER_LIMIT_API}/cancelOrders`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ owner:walletPublicKey, orders:[orderPubkey] }),
  });
  if (!res.ok) throw new Error(`Cancel error: ${res.status}`);
  const { txs } = await res.json();
  for (const tx of txs) await signAndSend(tx, activeIndex);
}

export async function getOpenLimitOrders(walletPublicKey) {
  try {
    const res = await fetch(`${JUPITER_LIMIT_API}/openOrders?wallet=${walletPublicKey}`);
    if (!res.ok) return [];
    return await res.json() || [];
  } catch (_) { return []; }
}
