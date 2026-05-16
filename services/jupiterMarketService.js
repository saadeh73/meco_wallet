// services/jupiterMarketService.js

// ─── قائمة العملات ────────────────────────────────────────────────────────────
// ترتيب الأولوية: MECO أولاً كرمز أساسي، ثم العملات الكبرى، ثم meme coins
export const CORE_TOKENS = [
  // ── أساسية ──────────────────────────────────────────────────────────────
  {
    id: 'solana', symbol: 'SOL', name: 'Solana', decimals: 9, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    mint: 'So11111111111111111111111111111111111111112',
  },
  {
    id: 'MonyCoin', symbol: 'MECO', name: 'MonyCoin', decimals: 9, swapAvailable: true,
    image: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco.logo.png',
    mint: '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i',
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

  // ── بروتوكولات Solana الكبرى ──────────────────────────────────────────────
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

  // ── Meme Coins النشطة على Solana ──────────────────────────────────────────
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
    // ✅ بديل RNDR (متوقف على Solana) — POPCAT نشط وسائل عالية
    id: 'popcat', symbol: 'POPCAT', name: 'Popcat', decimals: 9, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/39382/large/popcat.png',
    mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
  },
  {
    // ✅ بديل TNSR (سيولة ضعيفة) — MEW من أشهر meme coins على Solana
    id: 'cat-in-a-dogs-world', symbol: 'MEW', name: 'cat in a dogs world', decimals: 6, swapAvailable: true,
    image: 'https://assets.coingecko.com/coins/images/36440/large/mew.png',
    mint: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
  },
];

// ─── ثوابت ────────────────────────────────────────────────────────────────────
const MECO_MINT        = '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i';
const MECO_TOTAL_SUPPLY = 1_000_000_000;
const FETCH_TIMEOUT    = 8000; // 8 ثوانٍ

// ─── Helper: fetch مع timeout ─────────────────────────────────────────────────
const fetchWithTimeout = (url, ms = FETCH_TIMEOUT) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

// ─── Helper: جلب بيانات DexScreener لقائمة minst ─────────────────────────────
// يُعيد Map<mintLower, { price, change24h }>
const fetchDexScreener = async (mints) => {
  const result = new Map();
  try {
    const url  = `https://api.dexscreener.com/latest/dex/tokens/${mints.join(',')}`;
    const res  = await fetchWithTimeout(url);
    if (!res.ok) return result;
    const data = await res.json();
    if (!data?.pairs) return result;

    // أفضل pair لكل token = أعلى سيولة
    for (const pair of data.pairs) {
      const mintLower = pair.baseToken?.address?.toLowerCase();
      if (!mintLower) continue;
      if (!result.has(mintLower) ||
          (pair.liquidity?.usd || 0) > (result.get(mintLower)?._liq || 0)) {
        result.set(mintLower, {
          price:     parseFloat(pair.priceUsd   || 0),
          change24h: parseFloat(pair.priceChange?.h24 || 0),
          _liq:      pair.liquidity?.usd || 0,
        });
      }
    }
  } catch (_) { /* صامت */ }
  return result;
};

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────
export async function getJupiterMarketData() {
  try {
    // العملات الأخرى غير MECO
    const otherTokens = CORE_TOKENS.filter(tk => tk.symbol !== 'MECO');
    const otherMints  = otherTokens.map(tk => tk.mint);

    // ── 1. Jupiter Price API v2 (للأسعار الدقيقة) ───────────────────────────
    let jupPriceMap = new Map(); // mint_lower → price
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
    } catch (_) {
      console.log('⚠️ Jupiter API failed, switching to DexScreener');
    }

    // ── 2. DexScreener (للـ 24h change الحقيقي + fallback للأسعار) ──────────
    // ✅ إصلاح: change24h حقيقي من DexScreener بدلاً من Math.random()
    const dexMap = await fetchDexScreener(otherMints);

    // ── 3. MECO منفصل من DexScreener ─────────────────────────────────────────
    let mecoPrice    = 0;
    let mecoChange   = 0;
    let mecoMarketCap = 0;
    try {
      const mecoMap = await fetchDexScreener([MECO_MINT]);
      const meco    = mecoMap.get(MECO_MINT.toLowerCase());
      if (meco && meco.price > 0) {
        mecoPrice     = meco.price;
        mecoChange    = meco.change24h;
        mecoMarketCap = mecoPrice * MECO_TOTAL_SUPPLY;
        console.log(`✅ MECO: $${mecoPrice} (${mecoChange > 0 ? '+' : ''}${mecoChange.toFixed(2)}%)`);
      } else {
        console.log('⚠️ MECO: لا يوجد سعر متاح حالياً');
      }
    } catch (_) {
      console.log('⚠️ MECO fetch error');
    }

    // ── 4. بناء البيانات النهائية ─────────────────────────────────────────────
    const finalData = CORE_TOKENS.map((token, index) => {
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

      // السعر: Jupiter أولاً (أدق) ثم DexScreener
      const jupPrice  = jupPriceMap.get(mintLower) || 0;
      const dexInfo   = dexMap.get(mintLower);
      const dexPrice  = dexInfo?.price    || 0;
      const dexChange = dexInfo?.change24h ?? 0;

      let price     = jupPrice > 0 ? jupPrice : dexPrice;
      // ✅ change24h حقيقي دائماً من DexScreener
      let change24h = dexChange;

      // 🛡️ حماية العملات المستقرة
      if (token.symbol === 'USDT' || token.symbol === 'USDC') {
        if (price < 0.95 || price > 1.05 || price === 0) price = 1.00;
        change24h = parseFloat(change24h.toFixed(2)) || 0.00;
      }

      // 🛡️ SOL — لا نضع سعراً ثابتاً، نترك 0 ليظهر "unavailable" للمستخدم
      // بدلاً من إظهار سعر قديم مضلل
      if (token.symbol === 'SOL' && price === 0) {
        console.log('⚠️ SOL price unavailable from all sources');
      }

      return {
        ...token,
        current_price:               price,
        price_change_percentage_24h: change24h,
        market_cap:                  0, // Jupiter لا يوفر market cap
        rank: index + 1,
      };
    });

    return finalData;

  } catch (error) {
    console.error('Market Service Error:', error.message);
    throw error;
  }
}
