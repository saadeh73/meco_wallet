// services/jupiterMarketService.js
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CORE_TOKENS = [
  { id:'solana',                   symbol:'SOL',    name:'Solana',              decimals:9, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/4128/large/solana.png',         mint:'So11111111111111111111111111111111111111112' },
  { id:'MonyCoin',                 symbol:'MECO',   name:'MonyCoin',            decimals:9, swapAvailable:true,  image:'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco.logo.png', mint:'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W' },
  { id:'tether',                   symbol:'USDT',   name:'Tether',              decimals:6, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/325/large/Tether.png',          mint:'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
  { id:'usd-coin',                 symbol:'USDC',   name:'USD Coin',            decimals:6, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/6319/large/usdc.png',           mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  { id:'jupiter-exchange-solana',  symbol:'JUP',    name:'Jupiter',             decimals:6, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/34188/large/jup.png',           mint:'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbJedZ89LxcQ' },
  { id:'raydium',                  symbol:'RAY',    name:'Raydium',             decimals:6, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/13928/large/PSigc4ie_400x400.jpg', mint:'4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R' },
  { id:'jito-governance-token',    symbol:'JTO',    name:'Jito',                decimals:9, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/33228/large/jto.png',           mint:'jtojtomepa8beP8AuQc6eEq5PG14zwVFmWeaKx1pC8X'  },
  { id:'orca',                     symbol:'ORCA',   name:'Orca',                decimals:6, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/17547/large/Orca_Logo.png',     mint:'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE'  },
  { id:'marinade',                 symbol:'MNDE',   name:'Marinade',            decimals:9, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/18612/large/mnde.png',          mint:'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey'  },
  { id:'pyth-network',             symbol:'PYTH',   name:'Pyth Network',        decimals:6, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/31068/large/pyth.png',          mint:'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3T7ef8R2mMWBwp'  },
  { id:'helium',                   symbol:'HNT',    name:'Helium',              decimals:8, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/4284/large/Helium_HNT.png',     mint:'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux'  },
  { id:'bonk',                     symbol:'BONK',   name:'Bonk',                decimals:5, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/28600/large/bonk.jpg',          mint:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'  },
  { id:'dogwifcoin',               symbol:'WIF',    name:'dogwifhat',           decimals:6, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/33566/large/dogwifhat.jpg',     mint:'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
  { id:'book-of-meme',             symbol:'BOME',   name:'Book of Meme',        decimals:6, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/36071/large/bome.png',          mint:'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82'   },
  { id:'popcat',                   symbol:'POPCAT', name:'Popcat',              decimals:9, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/39382/large/popcat.png',        mint:'7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr'   },
  { id:'cat-in-a-dogs-world',      symbol:'MEW',    name:'cat in a dogs world', decimals:6, swapAvailable:true,  image:'https://assets.coingecko.com/coins/images/36440/large/mew.png',          mint:'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5'    },
];

const MECO_MINT         = 'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W';
const MECO_TOTAL_SUPPLY = 1_000_000_000;
const FETCH_TIMEOUT     = 8000;
const CUSTOM_TOKENS_KEY = '@meco_custom_tokens';

const fetchWithTimeout = (url, ms = FETCH_TIMEOUT) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

// ─── DexScreener ──────────────────────────────────────────────────────────────
const fetchDexScreener = async (mints) => {
  const result = new Map();
  if (!mints?.length) return result;
  try {
    const url  = `https://api.dexscreener.com/latest/dex/tokens/${mints.join(',')}`;
    const res  = await fetchWithTimeout(url);
    if (!res.ok) return result;
    const data = await res.json();
    if (!data?.pairs) return result;
    for (const pair of data.pairs) {
      const ml = pair.baseToken?.address?.toLowerCase();
      if (!ml) continue;
      const ex = result.get(ml);
      if (!ex || (pair.liquidity?.usd||0) > (ex._liq||0)) {
        result.set(ml, {
          price:     parseFloat(pair.priceUsd        || 0),
          change24h: parseFloat(pair.priceChange?.h24 || 0),
          _liq:      pair.liquidity?.usd || 0,
        });
      }
    }
  } catch (_) {}
  return result;
};

// ─── Jupiter v3 — أسعار العملات الكبرى ───────────────────────────────────────
// ملاحظة: v2 (api.jup.ag/price/v2) أصبح deprecated رسميًا من Jupiter ولم يعد
// يرجّع شكل البيانات المتوقع، فكان بيرجع نتيجة فاضية دايمًا ويفضّي الأسعار على
// DexScreener بس. v3 (lite-api.jup.ag) هو البديل المجاني بدون API key.
const fetchJupiterPrices = async (mints) => {
  const result = new Map();
  if (!mints?.length) return result;
  try {
    const res  = await fetchWithTimeout(`https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`);
    if (!res.ok) return result;
    const body = await res.json();
    // v3 يرجّع object بالـ mint مباشرة كمفتاح (من غير data wrapper)،
    // والحقل بقى اسمه usdPrice، وبيدي priceChange24h من نفس المصدر أيضًا
    for (const [mint, info] of Object.entries(body || {})) {
      const p = parseFloat(info?.usdPrice || 0);
      if (p > 0) {
        result.set(mint.toLowerCase(), {
          price:     p,
          change24h: parseFloat(info?.priceChange24h || 0),
        });
      }
    }
  } catch (_) {}
  return result;
};

// ─── سعر SOL فقط بالدولار ─────────────────────────────────────────────────────
// دالة خفيفة تُستخدم في شاشات Send/Swap/Staking لعرض القيمة التقديرية بالدولار
// لرسوم المنصة الثابتة (0.0005 SOL)، بدون الحاجة لجلب بيانات السوق كاملة
export async function getSolPriceUsd() {
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  try {
    const map = await fetchJupiterPrices([SOL_MINT]);
    return map.get(SOL_MINT.toLowerCase())?.price || 0;
  } catch (_) {
    return 0;
  }
}

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────
export async function getJupiterMarketData() {
  try {
    const customTokens = await getCustomTokens();

    // ✅ العملات غير MECO
    const otherTokens = CORE_TOKENS.filter(t => t.symbol !== 'MECO');
    const otherMints  = otherTokens.map(t => t.mint);

    // ✅ MECO باستدعاء مستقل مضمون — لا يتأثر بفشل Batch
    const [jupMap, dexOthersMap, mecoMap] = await Promise.all([
      fetchJupiterPrices(otherMints),
      fetchDexScreener(otherMints),
      fetchDexScreener([MECO_MINT]),   // ✅ استدعاء منفصل لـ MECO
    ]);

    // ── بيانات MECO ───────────────────────────────────────────────────────────
    const mecoData  = mecoMap.get(MECO_MINT.toLowerCase());
    const mecoPrice = mecoData?.price    || 0;
    const mecoChg   = mecoData?.change24h ?? 0;

    // ── بناء البيانات النهائية ────────────────────────────────────────────────
    const coreData = CORE_TOKENS.map((token, index) => {
      if (token.symbol === 'MECO') {
        return {
          ...token,
          current_price:               mecoPrice,
          price_change_percentage_24h: mecoChg,
          market_cap:                  mecoPrice * MECO_TOTAL_SUPPLY,
          rank: index + 1,
        };
      }

      const ml  = token.mint.toLowerCase();
      const jup = jupMap.get(ml);
      const dex = dexOthersMap.get(ml);

      // ✅ نفضّل Jupiter كمصدر واحد متّسق للسعر ونسبة التغيّر معًا (نفس الاستدعاء)
      // بدل ما ناخد السعر من Jupiter ونسبة التغيّر من DexScreener لزوج تداول
      // مختلف تمامًا — وده كان بيسبب أرقام غير متّسقة ("أسعار غير منضبطة")
      let price, change24h;
      if (jup && jup.price > 0) {
        price     = jup.price;
        change24h = jup.change24h;
      } else {
        price     = dex?.price    || 0;
        change24h = dex?.change24h ?? 0;
      }

      // تصحيح Stablecoins
      if (token.symbol === 'USDT' || token.symbol === 'USDC') {
        if (price < 0.95 || price > 1.05 || price === 0) price = 1.00;
        // تغيّر أكبر من 5% لعملة مستقرة يكاد يكون مؤكد بيانات زوج غير ممثِّل
        change24h = Math.abs(change24h) > 5 ? 0 : (+(change24h.toFixed(2)) || 0);
      }

      return {
        ...token,
        current_price:               price,
        price_change_percentage_24h: change24h,
        market_cap:                  0,
        rank: index + 1,
      };
    });

    // ── رموز مخصصة ───────────────────────────────────────────────────────────
    let updatedCustom = [...customTokens];
    if (customTokens.length > 0) {
      const customMints  = customTokens.map(t => t.mint);
      const customDexMap = await fetchDexScreener(customMints);
      updatedCustom = customTokens.map((token, i) => {
        const info = customDexMap.get(token.mint.toLowerCase());
        return {
          ...token,
          current_price:               info?.price    ?? token.current_price    ?? 0,
          price_change_percentage_24h: info?.change24h ?? token.price_change_percentage_24h ?? 0,
          rank: CORE_TOKENS.length + i + 1,
        };
      });
    }

    return [...coreData, ...updatedCustom];
  } catch (err) {
    console.error('getJupiterMarketData error:', err.message);
    throw err;
  }
}

// ─── إدارة الرموز المخصصة ─────────────────────────────────────────────────────
export async function getCustomTokens() {
  try {
    const s = await AsyncStorage.getItem(CUSTOM_TOKENS_KEY);
    return s ? JSON.parse(s) : [];
  } catch (_) { return []; }
}

export async function saveCustomToken(token) {
  const existing = await getCustomTokens();
  if (existing.find(t => t.mint.toLowerCase() === token.mint.toLowerCase()))
    throw new Error('هذا الرمز مضاف بالفعل');
  const updated = [...existing, token];
  await AsyncStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(updated));
  return updated;
}

export async function deleteCustomToken(mintAddress) {
  const existing = await getCustomTokens();
  const updated  = existing.filter(t => t.mint.toLowerCase() !== mintAddress.toLowerCase());
  await AsyncStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(updated));
  return updated;
}

export async function fetchCustomTokenByMint(mintAddress) {
  if (!mintAddress || mintAddress.trim().length < 32) throw new Error('عنوان العقد غير صالح');
  const mint = mintAddress.trim();
  if (CORE_TOKENS.find(t => t.mint.toLowerCase() === mint.toLowerCase()))
    throw new Error('هذا الرمز موجود بالفعل في القائمة');

  const res = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, 10000);
  if (!res.ok) throw new Error('فشل الاتصال بالخادم');
  const data = await res.json();
  if (!data?.pairs?.length) throw new Error('لم يتم العثور على بيانات لهذا الرمز');

  const pair = data.pairs.reduce((b, p) =>
    (p.liquidity?.usd||0) > (b.liquidity?.usd||0) ? p : b, data.pairs[0]);

  return {
    id: mint, symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown Token',
    decimals: 9, swapAvailable: true,
    image: pair.info?.imageUrl || null, mint,
    current_price:               parseFloat(pair.priceUsd         || 0),
    price_change_percentage_24h: parseFloat(pair.priceChange?.h24 || 0),
    market_cap: 0, isCustom: true,
  };
}
