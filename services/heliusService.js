import * as SecureStore from 'expo-secure-store';
import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';

// ✅ عنوان عقد عملة MECO
const MECO_MINT_ADDRESS = 'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W';

const HELIUS_URL = 'https://mainnet.helius-rpc.com/?api-key=fb28d3cf-7dd1-4667-9167-7941c3aceb66';

// ✅ قائمة RPCs (نجعل Helius هو الزعيم رقم 1 القوي، ونبقي المجانية كاحتياطي)
const RPC_ENDPOINTS = [
  ...(HELIUS_URL ? [{ url: HELIUS_URL, priority: 1 }] : []),
  { url: 'https://api.mainnet-beta.solana.com', priority: 2 },
  { url: 'https://solana-api.projectserum.com', priority: 3 },
  { url: 'https://rpc.ankr.com/solana', priority: 4 }
];

// ✅ إعدادات الكاش المحسنة
const CACHE_DURATION = 15000;
const BLOCKHASH_DURATION = 20000;
const PRICE_CACHE_DURATION = 60000;
const MAX_TOKEN_CACHE_SIZE = 100;

class LRUCache {
  constructor(maxSize = 100, maxAge = CACHE_DURATION) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
    this.cache = new Map();
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

const CACHE = {
  sol: {}, // ✅ تم تعديله ليصبح كائن فارغ يستوعب أرصدة حسابات متعددة
  tokens: new LRUCache(MAX_TOKEN_CACHE_SIZE, CACHE_DURATION),
  blockhash: null,
  blockhashTime: 0,
  prices: new LRUCache(20, PRICE_CACHE_DURATION)
};

class RPCManager {
  constructor(endpoints) {
    this.endpoints = endpoints.sort((a, b) => a.priority - b.priority);
    this.connections = new Map();
    this.currentIndex = 0;
    this.performance = new Map();
  }

  async getConnection() {
    if (this.connections.size > 0) {
      for (let i = 0; i < this.endpoints.length; i++) {
        const idx = (this.currentIndex + i) % this.endpoints.length;
        const { url } = this.endpoints[idx];
        const conn = this.connections.get(url);
        if (conn) {
          try {
            const start = Date.now();
            await Promise.race([
              conn.getEpochInfo(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
            ]);
            this.performance.set(url, Date.now() - start);
            this.currentIndex = idx;
            return conn;
          } catch {
            this.connections.delete(url);
          }
        }
      }
    }

    for (let i = 0; i < this.endpoints.length; i++) {
      const idx = (this.currentIndex + i) % this.endpoints.length;
      const { url } = this.endpoints[idx];
      try {
        const connection = new web3.Connection(url, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: 60000,
          disableRetryOnRateLimit: false,
          wsEndpoint: url.replace('https://', 'wss://')
        });

        const start = Date.now();
        await Promise.race([
          connection.getEpochInfo(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);

        this.connections.set(url, connection);
        this.performance.set(url, Date.now() - start);
        this.currentIndex = idx;

        console.log(`✅ Connected to ${url.split('//')[1]} (${Date.now() - start}ms)`);
        return connection;
      } catch (error) {
        console.warn(`❌ Failed ${url}:`, error.message);
        continue;
      }
    }

    throw new Error('جميع اتصالات RPC فشلت');
  }

  async execute(method, ...args) {
    let lastError;
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      try {
        const connection = await this.getConnection();
        return await connection[method](...args);
      } catch (error) {
        lastError = error;
        this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
        this.connections.delete(this.endpoints[this.currentIndex].url);
      }
    }
    throw lastError || new Error('RPC execution failed');
  }
}

const rpcManager = new RPCManager(RPC_ENDPOINTS);

async function withRetry(fn, context = 'operation', maxRetries = 2) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ ${context} attempt ${i + 1} failed:`, error.message);
      if (i < maxRetries) await delay(1000 * (i + 1));
    }
  }
  throw lastError;
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getLatestBlockhash(forceRefresh = false) {
  try {
    const now = Date.now();

    if (!forceRefresh &&
        CACHE.blockhash &&
        (now - CACHE.blockhashTime) < BLOCKHASH_DURATION) {
      return CACHE.blockhash;
    }

    const blockhash = await rpcManager.execute('getLatestBlockhash', 'confirmed');

    CACHE.blockhash = blockhash;
    CACHE.blockhashTime = now;

    return blockhash;
  } catch (error) {
    return {
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 0
    };
  }
}

export const getTokenMarketPrice = async (tokenSymbol) => {
  try {
    const cached = CACHE.prices.get(tokenSymbol);
    if (cached) return cached;

    // 🌟 التعديل الجراحي: إضافة جلب سعر MECO من DexScreener مباشرة
    if (tokenSymbol === 'MECO') {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${MECO_MINT_ADDRESS}`);
        const data = await response.json();
        
        if (data.pairs && data.pairs.length > 0) {
          data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
          const mecoPrice = parseFloat(data.pairs[0].priceUsd || 0);
          CACHE.prices.set(tokenSymbol, mecoPrice);
          return mecoPrice;
        }
      } catch (e) {
        console.warn(`⚠️ MECO DexScreener fetch failed, using fallback`);
      }
      const fallbackPrice = 0 ;
      CACHE.prices.set(tokenSymbol, fallbackPrice);
      return fallbackPrice;
    }

    let mintAddress = null;
    if (tokenSymbol === 'SOL') mintAddress = 'So11111111111111111111111111111111111111112';
    else if (tokenSymbol === 'USDT') mintAddress = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
    else if (tokenSymbol === 'USDC') mintAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    if (!mintAddress) return 0;

    const endpoints = [
      {
        url: `https://api.jup.ag/price/v2?ids=${mintAddress}`,
        parser: (data) => data?.data?.[mintAddress]?.price,
      },
      {
        url: `https://price.jup.ag/v6/price?ids=${mintAddress}`,
        parser: (data) => data?.data?.[mintAddress]?.price,
      },
    ];

    for (const { url, parser } of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const rawPrice = parser(data);
          const price = parseFloat(rawPrice);

          if (price && !isNaN(price) && price > 0) {
            CACHE.prices.set(tokenSymbol, price);
            return price;
          }
        }
      } catch (e) {
        console.warn(`⚠️ Jupiter fetch failed for ${tokenSymbol}:`, e.message);
      }
    }

    try {
      const coingeckoUrl = `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${mintAddress}&vs_currencies=usd`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(coingeckoUrl, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const price = parseFloat(data[mintAddress]?.usd);

        if (price && !isNaN(price) && price > 0) {
          CACHE.prices.set(tokenSymbol, price);
          return price;
        }
      }
    } catch (e) {
      console.warn(`⚠️ CoinGecko fetch failed for ${tokenSymbol}:`, e.message);
    }

    return 0;

  } catch (error) {
    console.error(`❌ Unexpected error in getTokenMarketPrice for ${tokenSymbol}:`, error);
    return 0;
  }
};

// ✅ تم إضافة معامل address مع الحفاظ على التوافقية بنسبة 100%
export async function getSolBalance(forceRefresh = false, address = null) {
  try {
    const pubKeyStr = address || await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) return 0;

    const now = Date.now();
    if (!CACHE.sol[pubKeyStr]) CACHE.sol[pubKeyStr] = { balance: 0, timestamp: 0 };
    const cache = CACHE.sol[pubKeyStr];

    if (!forceRefresh && (now - cache.timestamp) < CACHE_DURATION) {
      return cache.balance;
    }

    const balanceLamports = await withRetry(
      () => rpcManager.execute('getBalance', new web3.PublicKey(pubKeyStr)),
      'getSolBalance'
    );

    const balance = balanceLamports / web3.LAMPORTS_PER_SOL;
    CACHE.sol[pubKeyStr] = { balance, timestamp: now };

    return balance;
  } catch (error) {
    return CACHE.sol[address || 'default']?.balance || 0;
  }
}

// ✅ تم إضافة معامل address وفصل الكاش لكل حساب لمنع تداخل الأرصدة
export async function getTokenBalance(mintAddress, forceRefresh = false, address = null) {
  try {
    const pubKeyStr = address || await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) return 0;

    const cacheKey = `${pubKeyStr}_${mintAddress}`;
    const cache = CACHE.tokens.get(cacheKey);

    if (!forceRefresh && cache !== null && cache !== undefined) {
      return cache;
    }

    const pubKey = new web3.PublicKey(pubKeyStr);
    const mint = new web3.PublicKey(mintAddress);
    const ata = await splToken.getAssociatedTokenAddress(mint, pubKey);

    try {
      const accountInfo = await rpcManager.execute('getAccountInfo', ata);
      if (!accountInfo) {
        CACHE.tokens.set(cacheKey, 0);
        return 0;
      }
      const tokenAccount = splToken.AccountLayout.decode(accountInfo.data);
      const rawBalance = tokenAccount.amount;
      const mintInfo = await splToken.getMint(await rpcManager.getConnection(), mint);
      const balance = Number(rawBalance) / Math.pow(10, mintInfo.decimals);

      CACHE.tokens.set(cacheKey, balance);
      return balance;
    } catch (ataError) {
      CACHE.tokens.set(cacheKey, 0);
      return 0;
    }
  } catch (error) {
    const pubKeyStr = address || '';
    return CACHE.tokens.get(`${pubKeyStr}_${mintAddress}`) || 0;
  }
}

// ✅ تم إضافة معامل address مع الحفاظ على التوافقية
export async function getTokenAccounts(address = null) {
  try {
    const pubKeyStr = address || await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) return [];

    const pubKey = new web3.PublicKey(pubKeyStr);
    const tokenAccounts = await withRetry(
      () => rpcManager.execute('getParsedTokenAccountsByOwner', pubKey, { programId: splToken.TOKEN_PROGRAM_ID }),
      'getTokenAccounts'
    );

    return tokenAccounts.value.map(account => ({
      pubkey: account.pubkey.toBase58(),
      mint: account.account.data.parsed.info.mint,
      owner: account.account.data.parsed.info.owner,
      amount: account.account.data.parsed.info.tokenAmount.uiAmount,
      decimals: account.account.data.parsed.info.tokenAmount.decimals
    }));
  } catch (error) {
    return [];
  }
}

export async function validateSolanaAddress(address) {
  try {
    if (!address || typeof address !== 'string') return { isValid: false, exists: false, error: 'INVALID_FORMAT' };
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(address)) return { isValid: false, exists: false, error: 'INVALID_BASE58' };
    try {
      new web3.PublicKey(address);
    } catch {
      return { isValid: false, exists: false, error: 'INVALID_PUBKEY' };
    }
    return { isValid: true, exists: true, isExecutable: false, lamports: 0, error: null };
  } catch (error) {
    return { isValid: false, exists: false, error: error.message };
  }
}

export async function getCurrentNetworkFee() {
  try {
    const fees = await rpcManager.execute('getRecentPrioritizationFees');
    if (fees && fees.length > 0) {
      const recent = fees.slice(0, 5);
      const avgFee = recent.reduce((sum, f) => sum + (f.prioritizationFee || 0), 0) / recent.length;
      const feeInSol = (avgFee / web3.LAMPORTS_PER_SOL) / 1_000_000;
      const minFee = 0.000005;
      const maxFee = 0.0001;
      return Math.max(minFee, Math.min(feeInSol, maxFee));
    }
    return 0.000005;
  } catch (error) {
    return 0.000005;
  }
}

export async function sendSolTransaction(fromKeypair, toAddress, amount, fee = 0.000005) {
  if (amount <= 0) throw new Error('INVALID_AMOUNT');
  try {
    const connection = await rpcManager.getConnection();
    const { blockhash } = await getLatestBlockhash(true);

    const transaction = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new web3.PublicKey(toAddress),
        lamports: Math.floor(amount * web3.LAMPORTS_PER_SOL)
      })
    );

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromKeypair.publicKey;

    const signature = await web3.sendAndConfirmTransaction(
      connection,
      transaction, [fromKeypair],
      { commitment: 'confirmed' }
    );

    clearBalanceCache();
    return signature;
  } catch (error) {
    throw error;
  }
}

export async function sendTokenTransaction(fromKeypair, toAddress, mintAddress, amount) {
  if (amount <= 0) throw new Error('INVALID_AMOUNT');
  try {
    const connection = await rpcManager.getConnection();
    const { blockhash } = await getLatestBlockhash(true);

    const mint = new web3.PublicKey(mintAddress);
    const fromATA = await splToken.getAssociatedTokenAddress(mint, fromKeypair.publicKey);
    const toATA = await splToken.getAssociatedTokenAddress(mint, new web3.PublicKey(toAddress));

    const mintInfo = await splToken.getMint(connection, mint);
    const decimals = mintInfo.decimals;

    const amountRaw = BigInt(Math.floor(amount * Math.pow(10, decimals)));
    if (amountRaw === 0n) throw new Error('AMOUNT_TOO_SMALL');

    const tokenBalance = await getTokenBalance(mintAddress, true);
    if (tokenBalance < amount) throw new Error('INSUFFICIENT_BALANCE');

    const instructions = [];
    const toAccountInfo = await connection.getAccountInfo(toATA);
    if (!toAccountInfo) {
      instructions.push(
        splToken.createAssociatedTokenAccountInstruction(
          fromKeypair.publicKey,
          toATA,
          new web3.PublicKey(toAddress),
          mint
        )
      );
    }

    instructions.push(
      splToken.createTransferInstruction(
        fromATA,
        toATA,
        fromKeypair.publicKey,
        amountRaw
      )
    );

    const transaction = new web3.Transaction().add(...instructions);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromKeypair.publicKey;

    const signature = await web3.sendAndConfirmTransaction(
      connection,
      transaction,
      [fromKeypair],
      { commitment: 'confirmed' }
    );

    CACHE.tokens.clear(); // تفريغ كاش العملات لضمان التحديث بعد الإرسال
    return signature;
  } catch (error) {
    throw error;
  }
}

export async function heliusRpcRequest(method, params = []) {
  try {
    const connection = await rpcManager.getConnection();
    switch (method) {
      case 'getSignaturesForAddress':
        return await connection.getSignaturesForAddress(new web3.PublicKey(params[0]), params[1] || {});
      case 'getTransaction':
        return await connection.getTransaction(params[0], params[1] || { commitment: 'confirmed' });
      case 'getBalance':
        return await connection.getBalance(new web3.PublicKey(params[0]));
      case 'getTokenAccountsByOwner':
        return await connection.getTokenAccountsByOwner(new web3.PublicKey(params[0]), params[1] || { programId: splToken.TOKEN_PROGRAM_ID });
      case 'getAccountInfo':
        return await connection.getAccountInfo(new web3.PublicKey(params[0]), params[1] || {});
      default:
        if (typeof connection[method] === 'function') {
          return await connection[method](...params);
        }
        throw new Error(`Method ${method} not supported`);
    }
  } catch (error) {
    throw error;
  }
}

export function clearBalanceCache(mintAddress) {
  if (mintAddress) {
    CACHE.tokens.clear(); // تفريغ عام لتجنب مشاكل المفاتيح المركبة
  } else {
    CACHE.sol = {}; // تفريغ آمن لجميع الحسابات
    CACHE.tokens.clear();
  }
  CACHE.blockhash = null;
  CACHE.blockhashTime = 0;
}

// ✅ تم إضافة معامل address مع الحفاظ على التوافقية والمحلل الذكي
export async function getTransactionHistory(limit = 20, address = null) {
  try {
    const pubKeyStr = address || await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) return [];

    const connection = await rpcManager.getConnection();
    const pubKey = new web3.PublicKey(pubKeyStr);

    const signatures = await connection.getSignaturesForAddress(pubKey, {
      limit,
      commitment: 'confirmed'
    });

    const transactions = [];

    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });

        if (!tx || tx.meta?.err) continue;

        const accountKeys = tx.transaction.message.accountKeys.map(k =>
          typeof k.pubkey === 'string' ? k.pubkey : k.pubkey.toBase58()
        );
        const userIndex = accountKeys.findIndex(k => k === pubKeyStr);
        if (userIndex === -1) continue;

        const isFeePayer = userIndex === 0;
        const fee = tx.meta?.fee ? tx.meta.fee / web3.LAMPORTS_PER_SOL : 0;
        const preToken = tx.meta?.preTokenBalances || [];
        const postToken = tx.meta?.postTokenBalances || [];

        const instructions = tx.transaction.message.instructions;
        let found = false;

        for (const ix of instructions) {
          if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
            const from = ix.parsed.info.source;
            const to = ix.parsed.info.destination;
            const lamports = ix.parsed.info.lamports;

            if (from === pubKeyStr || to === pubKeyStr) {
              transactions.push({
                signature: sig.signature,
                blockTime: sig.blockTime,
                timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
                slot: sig.slot,
                from,
                to,
                amount: lamports / web3.LAMPORTS_PER_SOL,
                token: 'SOL',
                mint: null,
                type: from === pubKeyStr ? 'send' : 'receive',
                fee: tx.meta.fee / web3.LAMPORTS_PER_SOL,
                status: 'success'
              });
              found = true;
              break;
            }
          }

          if (ix.program === 'spl-token' && (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked')) {
            const parsedInfo = ix.parsed.info;
            const from = parsedInfo.authority || parsedInfo.owner || pubKeyStr;
            const destinationAta = parsedInfo.destination;
            const mint = parsedInfo.mint || preToken.find(t => t.accountIndex === accountKeys.indexOf(destinationAta))?.mint;

            let toOwner = destinationAta;
            let exactAmount = 0;

            const destIndex = accountKeys.findIndex(k => k === destinationAta);
            if (destIndex !== -1) {
              const tokenData = postToken.find(t => t.accountIndex === destIndex);
              if (tokenData && tokenData.owner) {
                toOwner = tokenData.owner;
              }
              if (tokenData && tokenData.uiTokenAmount) {
                const preAmt = preToken.find(t => t.accountIndex === destIndex)?.uiTokenAmount?.uiAmount || 0;
                const postAmt = tokenData.uiTokenAmount.uiAmount || 0;
                exactAmount = postAmt - preAmt;
              }
            }

            if (exactAmount <= 0) {
              let decimals = 9;
              if (parsedInfo.tokenAmount && parsedInfo.tokenAmount.decimals) {
                decimals = parsedInfo.tokenAmount.decimals;
              } else {
                const tData = postToken.find(t => t.mint === mint);
                if (tData && tData.uiTokenAmount) decimals = tData.uiTokenAmount.decimals;
              }
              const rawAmount = parsedInfo.amount || parsedInfo.tokenAmount?.amount || 0;
              exactAmount = rawAmount / Math.pow(10, decimals);
            }

            if (from === pubKeyStr || toOwner === pubKeyStr) {
              let tSymbol = 'TOKEN';
              if (mint === MECO_MINT_ADDRESS) tSymbol = 'MECO';
              else if (mint === 'Es9vMFrzaCERc8Foa8XfRduKiSfrhEL5c7qr2WXXBWY5') tSymbol = 'USDT';
              else if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') tSymbol = 'USDC';

              transactions.push({
                signature: sig.signature,
                blockTime: sig.blockTime,
                timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
                slot: sig.slot,
                from,
                to: toOwner,
                amount: Math.abs(exactAmount),
                token: tSymbol,
                mint,
                type: from === pubKeyStr ? 'send' : 'receive',
                fee: tx.meta.fee / web3.LAMPORTS_PER_SOL,
                status: 'success'
              });
              found = true;
              break;
            }
          }
        }

        if (!found) {
          const userPreTokens = preToken.filter(t => t.owner === pubKeyStr || t.accountIndex === userIndex);
          const userPostTokens = postToken.filter(t => t.owner === pubKeyStr || t.accountIndex === userIndex);

          let amount = 0;
          let tokenSymbol = 'SOL';
          let mint = null;
          let type = null;
          let otherParty = null;
          let isTokenTx = false;

          for (const post of userPostTokens) {
            const pre = userPreTokens.find(p => p.mint === post.mint) || { uiTokenAmount: { uiAmount: 0 } };
            const postAmt = post.uiTokenAmount.uiAmount || 0;
            const preAmt = pre.uiTokenAmount.uiAmount || 0;
            const delta = postAmt - preAmt;

            if (Math.abs(delta) > 0.000001) {
              isTokenTx = true;
              mint = post.mint;
              if (delta > 0) {
                type = 'receive';
                amount = delta;
                const senderToken = preToken.find(t => t.mint === mint && t.owner !== pubKeyStr &&
                  ((postToken.find(pt => pt.accountIndex === t.accountIndex)?.uiTokenAmount.uiAmount || 0) < t.uiTokenAmount.uiAmount)
                );
                if (senderToken) otherParty = senderToken.owner;
              } else {
                type = 'send';
                amount = Math.abs(delta);
                const receiverToken = postToken.find(t => t.mint === mint && t.owner !== pubKeyStr &&
                  ((t.uiTokenAmount.uiAmount || 0) > (preToken.find(pt => pt.accountIndex === t.accountIndex)?.uiTokenAmount.uiAmount || 0))
                );
                if (receiverToken) otherParty = receiverToken.owner;
              }
              tokenSymbol = mint === MECO_MINT_ADDRESS ? 'MECO' : (mint === 'Es9vMFrzaCERc8Foa8XfRduKiSfrhEL5c7qr2WXXBWY5' ? 'USDT' : (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 'USDC' : 'TOKEN'));
              break;
            }
          }

          if (!isTokenTx) {
            const preSol = (tx.meta?.preBalances[userIndex] || 0) / web3.LAMPORTS_PER_SOL;
            const postSol = (tx.meta?.postBalances[userIndex] || 0) / web3.LAMPORTS_PER_SOL;

            let delta = postSol - preSol;
            if (isFeePayer) delta += fee;

            if (delta > 0.00001) {
              type = 'receive';
              amount = delta;
              const senderIndex = tx.meta?.preBalances.findIndex((pre, i) => {
                if (i === userIndex) return false;
                let d = (tx.meta?.postBalances[i] - pre) / web3.LAMPORTS_PER_SOL;
                if (i === 0) d += fee;
                return d < -0.00001;
              });
              if (senderIndex >= 0) otherParty = accountKeys[senderIndex];
            } else if (delta < -0.00001) {
              type = 'send';
              amount = Math.abs(delta);
              const receiverIndex = tx.meta?.preBalances.findIndex((pre, i) => {
                if (i === userIndex) return false;
                let d = (tx.meta?.postBalances[i] - pre) / web3.LAMPORTS_PER_SOL;
                if (i === 0) d += fee;
                return d > 0.00001;
              });
              if (receiverIndex >= 0) otherParty = accountKeys[receiverIndex];
            }
          }

          if (amount > 0 && type) {
            transactions.push({
              signature: sig.signature,
              blockTime: sig.blockTime,
              timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
              slot: sig.slot,
              confirmationStatus: sig.confirmationStatus,
              from: type === 'send' ? pubKeyStr : (otherParty || 'Smart Contract'),
              to: type === 'receive' ? pubKeyStr : (otherParty || 'Smart Contract'),
              amount: amount,
              token: tokenSymbol,
              mint: mint,
              type: type,
              err: tx.meta?.err || null,
              fee: fee,
              status: tx.meta?.err ? 'failed' : 'success'
            });
          }
        }
      } catch (e) {
        console.warn('Error parsing transaction', e);
      }
    }

    return transactions;
  } catch (error) {
    console.error('getTransactionHistory error:', error);
    return [];
  }
}
