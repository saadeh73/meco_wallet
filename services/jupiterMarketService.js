// services/jupiterMarketService.js

// ─── قائمة العملات ────────────────────────────────────────────────────────────
export const CORE_TOKENS = [
  {
    id: 'solana', symbol: 'SOL', name: 'Solana', decimals: 9, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    mint: 'So11111111111111111111111111111111111111112',
  },
  {
    id: 'MonyCoin', symbol: 'MECO', name: 'MonyCoin', decimals: 9, swapAvailable: true,
    image: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco.logo.png',
    mint: 'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W',
  },
  {
    id: 'tether', symbol: 'USDT', name: 'Tether', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
  {
    id: 'usd-coin', symbol: 'USDC', name: 'USD Coin', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  {
    id: 'jupiter-exchange-solana', symbol: 'JUP', name: 'Jupiter', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/34188/large/jup.png',
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbJedZ89LxcQ',
  },
  {
    id: 'raydium', symbol: 'RAY', name: 'Raydium', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/13928/large/PSym7VQ.png',
    mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  },
  {
    id: 'jito-governance-token', symbol: 'JTO', name: 'Jito', decimals: 9, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/33228/large/jto.png',
    mint: 'jtojtomepa8beP8AuQc6eEq5PG14zwVFmWeaKx1pC8X',
  },
  {
    id: 'orca', symbol: 'ORCA', name: 'Orca', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/17547/large/Orca_Logo.png',
    mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  },
  {
    id: 'marinade', symbol: 'MNDE', name: 'Marinade', decimals: 9, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/18612/large/mnde.png',
    mint: 'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey',
  },
  {
    id: 'pyth-network', symbol: 'PYTH', name: 'Pyth Network', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/31068/large/pyth.png',
    mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3T7ef8R2mMWBwp',
  },
  {
    id: 'helium', symbol: 'HNT', name: 'Helium', decimals: 8, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/4284/large/Helium_HNT.png',
    mint: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux',
  },
  {
    id: 'bonk', symbol: 'BONK', name: 'Bonk', decimals: 5, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/28600/large/bonk.jpg',
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  },
  {
    id: 'dogwifcoin', symbol: 'WIF', name: 'dogwifhat', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/33566/large/dogwifhat.jpg',
    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  },
  {
    id: 'book-of-meme', symbol: 'BOME', name: 'Book of Meme', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/36071/large/bome.png',
    mint: 'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82',
  },
  {
    id: 'popcat', symbol: 'POPCAT', name: 'Popcat', decimals: 9, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/39382/large/popcat.png',
    mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
  },
  {
    id: 'cat-in-a-dogs-world', symbol: 'MEW', name: 'cat in a dogs world', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/36440/large/mew.png',
    mint: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
  },
];

// ─── ثوابت ────────────────────────────────────────────────────────────────────
const MECO_MINT         = 'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W';
const MECO_TOTAL_SUPPLY = 1_000_000_000;
const FETCH_TIMEOUT     = 8000;
const CUSTOM_TOKENS_KEY = '@meco_custom_tokens'; // ✅ مفتاح التخزين للرموز المضافة

// ─── Helper: fetch مع timeout ─────────────────────────────────────────────────
const fetchWithTimeout = (url, ms = FETCH_TIMEOUT) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

// ─── Helper: DexScreener ──────────────────────────────────────────────────────
const fetchDexScreener = async (mints) => {
  const result = new Map();
  try {
    const url  = `https://api.dexscreener.com/latest/dex/tokens/${mints.join(',')}`;
    const res  = await fetchWithTimeout(url);
    if (!res.ok) return result;
    const data = await res.json();
    if (!data?.pairs) return result;

    for (const pair of data.pairs) {
      const mintLower = pair.baseToken?.address?.toLowerCase();
      if (!mintLower) continue;
      if (!result.has(mintLower) ||
          (pair.liquidity?.usd || 0) > (result.get(mintLower)?._liq || 0)) {
        result.set(mintLower, {
          price:     parseFloat(pair.priceUsd   || 0),
          change24h: parseFloat(pair.priceChange?.h24 || 0),
          name:      pair.baseToken?.name  || '',
          symbol:    pair.baseToken?.symbol || '',
          _liq:      pair.liquidity?.usd || 0,
        });
      }
    }
  } catch (_) {}
  return result;
};

// ─── ✅ جلب بيانات رمز مخصص من عنوان العقد (DexScreener) ──────────────────────
export async function fetchCustomTokenByMint(mintAddress) {
  try {
    if (!mintAddress || mintAddress.trim().length < 32) {
      throw new Error('عنوان العقد غير صالح');
    }

    const mint = mintAddress.trim();

    // ✅ التحقق من عدم وجود الرمز مسبقاً في CORE_TOKENS
    const existsInCore = CORE_TOKENS.find(
      tk => tk.mint.toLowerCase() === mint.toLowerCase()
    );
    if (existsInCore) {
      throw new Error('هذا الرمز موجود بالفعل في القائمة');
    }

    const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) throw new Error('فشل الاتصال بالخادم');

    const data = await res.json();
    if (!data?.pairs || data.pairs.length === 0) {
      throw new Error('لم يتم العثور على بيانات لهذا الرمز');
    }

    // أفضل pair = أعلى سيولة
    const pair = data.pairs.reduce((best, p) =>
      (p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best
    , data.pairs[0]);

    return {
      id:                          mint,
      symbol:                      pair.baseToken?.symbol || 'UNKNOWN',
      name:                        pair.baseToken?.name   || 'Unknown Token',
      decimals:                    9,
      swapAvailable:               true,
      image:                       pair.info?.imageUrl    || null,
      mint:                        mint,
      current_price:               parseFloat(pair.priceUsd || 0),
      price_change_percentage_24h: parseFloat(pair.priceChange?.h24 || 0),
      market_cap:                  0,
      isCustom:                    true, // ✅ علامة للتمييز عن CORE_TOKENS
    };
  } catch (err) {
    throw err;
  }
}

// ─── ✅ إدارة الرموز المخصصة في AsyncStorage ──────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getCustomTokens() {
  try {
    const stored = await AsyncStorage.getItem(CUSTOM_TOKENS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (_) {
    return [];
  }
}

export async function saveCustomToken(token) {
  try {
    const existing = await getCustomTokens();
    // ✅ منع التكرار
    if (existing.find(t => t.mint.toLowerCase() === token.mint.toLowerCase())) {
      throw new Error('هذا الرمز مضاف بالفعل');
    }
    const updated = [...existing, token];
    await AsyncStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    throw err;
  }
}

export async function deleteCustomToken(mintAddress) {
  try {
    const existing = await getCustomTokens();
    const updated  = existing.filter(t => t.mint.toLowerCase() !== mintAddress.toLowerCase());
    await AsyncStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(updated));
    return updated;
  } catch (_) {
    return [];
  }
}

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────
export async function getJupiterMarketData() {
  try {
    // ✅ جلب الرموز المخصصة من التخزين
    const customTokens = await getCustomTokens();

    const otherTokens = CORE_TOKENS.filter(tk => tk.symbol !== 'MECO');
    const otherMints  = otherTokens.map(tk => tk.mint);

    // ── Jupiter Price API v2 ──────────────────────────────────────────────────
    let jupPriceMap = new Map();
    try {
      const res = await fetchWithTimeout(
        `https://api.jup.ag/price/v2?ids=${otherMints.join(',')}`
      );
      if (res.ok) {
        const body = await res.json();
        for (const [mint, info] of Object.entries(body?.data || {})) {
          const p = parseFloat(info?.price || 0);
          if (p > 0) jupPriceMap.set(mint.toLowerCase(), p);
        }
      }
    } catch (_) {}

    // ── DexScreener للـ 24h change ────────────────────────────────────────────
    const dexMap = await fetchDexScreener(otherMints);

    // ── MECO منفصل ───────────────────────────────────────────────────────────
    let mecoPrice = 0, mecoChange = 0, mecoMarketCap = 0;
    try {
      const mecoMap = await fetchDexScreener([MECO_MINT]);
      const meco    = mecoMap.get(MECO_MINT.toLowerCase());
      if (meco && meco.price > 0) {
        mecoPrice     = meco.price;
        mecoChange    = meco.change24h;
        mecoMarketCap = mecoPrice * MECO_TOTAL_SUPPLY;
      }
    } catch (_) {}

    // ── بناء البيانات النهائية لـ CORE_TOKENS ─────────────────────────────────
    const coreData = CORE_TOKENS.map((token, index) => {
      if (token.symbol === 'MECO') {
        return {
          ...token,
          current_price:               mecoPrice,
          price_change_percentage_24h: mecoChange,
          market_cap:                  mecoMarketCap,
          rank: index + 1,
        };
      }

      const mintLower = token.mint.toLowerCase();
      const jupPrice  = jupPriceMap.get(mintLower) || 0;
      const dexInfo   = dexMap.get(mintLower);
      const dexPrice  = dexInfo?.price    || 0;
      const dexChange = dexInfo?.change24h ?? 0;
      let price       = jupPrice > 0 ? jupPrice : dexPrice;
      let change24h   = dexChange;

      if (token.symbol === 'USDT' || token.symbol === 'USDC') {
        if (price < 0.95 || price > 1.05 || price === 0) price = 1.00;
        change24h = parseFloat(change24h.toFixed(2)) || 0.00;
      }

      return {
        ...token,
        current_price:               price,
        price_change_percentage_24h: change24h,
        market_cap:                  0,
        rank: index + 1,
      };
    });

    // ✅ تحديث أسعار الرموز المخصصة من DexScreener
    const customMints = customTokens.map(t => t.mint);
    let updatedCustomTokens = [...customTokens];

    if (customMints.length > 0) {
      try {
        const customDexMap = await fetchDexScreener(customMints);
        updatedCustomTokens = customTokens.map((token, index) => {
          const info = customDexMap.get(token.mint.toLowerCase());
          return {
            ...token,
            current_price:               info?.price    ?? token.current_price ?? 0,
            price_change_percentage_24h: info?.change24h ?? token.price_change_percentage_24h ?? 0,
            rank: CORE_TOKENS.length + index + 1,
          };
        });
      } catch (_) {}
    }

    return [...coreData, ...updatedCustomTokens];

  } catch (error) {
    console.error('Market Service Error:', error.message);
    throw error;
  }
}
