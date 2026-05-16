// services/priceChartService.js

const COINGECKO_API  = 'https://api.coingecko.com/api/v3';
const CACHE_DURATION = 60000; // 1 دقيقة
const FETCH_TIMEOUT  = 8000;  // 8 ثوانٍ

// ✅ IDs محدّثة — تتزامن مع CORE_TOKENS في jupiterMarketService
const COINGECKO_IDS = {
  SOL:    'solana',
  USDT:   'tether',
  USDC:   'usd-coin',
  JUP:    'jupiter-exchange-solana',   // ✅ تصحيح
  RAY:    'raydium',
  BONK:   'bonk',
  WIF:    'dogwifcoin',
  PYTH:   'pyth-network',
  JTO:    'jito-governance-token',
  HNT:    'helium',
  ORCA:   'orca',
  MNDE:   'marinade',
  BOME:   'book-of-meme',
  POPCAT: 'popcat',                    // ✅ بديل RNDR
  MEW:    'cat-in-a-dogs-world',       // ✅ بديل TNSR
  // MECO غير مدرج في CoinGecko — يُعالج بشكل صريح أدناه
};

// العملات التي لا تدعم chart من CoinGecko
const NO_CHART_SYMBOLS = new Set(['MECO', 'USDT', 'USDC']);

const CACHE = {};

// ─── Helper: fetch مع timeout ─────────────────────────────────────────────────
const fetchWithTimeout = (url, ms = FETCH_TIMEOUT) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    .finally(() => clearTimeout(timer));
};

// ─── OHLC Data ────────────────────────────────────────────────────────────────
export async function getOHLCData(symbol, days = 7) {
  // ✅ عملات بدون chart — نُعيد مباشرة بدون استدعاء API
  if (NO_CHART_SYMBOLS.has(symbol)) {
    return getEmptyChartResult(symbol, days);
  }

  const cacheKey = `ohlc_${symbol}_${days}`;
  const now      = Date.now();

  if (CACHE[cacheKey] && now - CACHE[cacheKey].timestamp < CACHE_DURATION) {
    return CACHE[cacheKey].data;
  }

  const coinId = COINGECKO_IDS[symbol];
  if (!coinId) {
    console.warn(`[PriceChart] No CoinGecko ID for ${symbol}`);
    return getEmptyChartResult(symbol, days);
  }

  try {
    const url = `${COINGECKO_API}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
    const res  = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const ohlcRaw = await res.json();
    if (!Array.isArray(ohlcRaw) || ohlcRaw.length === 0) {
      throw new Error('Empty OHLC response');
    }

    const data = ohlcRaw.map(p => ({
      timestamp: p[0],
      open:  p[1],
      high:  p[2],
      low:   p[3],
      close: p[4],
    }));

    const latestClose = data[data.length - 1]?.close || 0;
    const firstOpen   = data[0]?.open || 0;

    // ✅ التسمية الصحيحة: تغيير الفترة كلها وليس "24h" فقط
    const periodChange = firstOpen > 0
      ? ((latestClose - firstOpen) / firstOpen) * 100
      : 0;

    const result = {
      symbol,
      days,
      data,
      stats: {
        currentPrice:        latestClose,
        openPrice:           firstOpen,
        high:                Math.max(...data.map(d => d.high)),
        low:                 Math.min(...data.map(d => d.low)),
        periodChange,                                    // ✅ تغيير الفترة
        periodChangeFormatted: formatPriceChange(periodChange),
      },
      sparklineData: generateSparkline(data),
      timestamp: now,
      isFallback: false,
    };

    CACHE[cacheKey] = { data: result, timestamp: now };
    return result;

  } catch (err) {
    console.warn(`❌ [PriceChart] OHLC failed for ${symbol}:`, err.message);
    return getEmptyChartResult(symbol, days);
  }
}

// ─── Volume Data ──────────────────────────────────────────────────────────────
export async function getVolumeData(symbol, days = 7) {
  if (NO_CHART_SYMBOLS.has(symbol)) return [];

  // ✅ إضافة cache للـ volume
  const cacheKey = `vol_${symbol}_${days}`;
  const now      = Date.now();

  if (CACHE[cacheKey] && now - CACHE[cacheKey].timestamp < CACHE_DURATION) {
    return CACHE[cacheKey].data;
  }

  const coinId = COINGECKO_IDS[symbol];
  if (!coinId) return [];

  try {
    const url = `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
    const res  = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = await res.json();
    if (!Array.isArray(body?.total_volumes)) throw new Error('No volume data');

    const volumeData = body.total_volumes.map(p => ({
      timestamp: p[0],
      volume:    p[1],
    }));

    CACHE[cacheKey] = { data: volumeData, timestamp: now };
    return volumeData;

  } catch (err) {
    console.warn(`❌ [PriceChart] Volume failed for ${symbol}:`, err.message);
    return [];
  }
}

// ─── Full Chart Data ──────────────────────────────────────────────────────────
export async function getFullChartData(symbol, days = 7) {
  try {
    const [ohlcResult, volumeData] = await Promise.all([
      getOHLCData(symbol, days),
      getVolumeData(symbol, days),
    ]);

    return { ...ohlcResult, volumeData };

  } catch (err) {
    console.warn(`❌ [PriceChart] Full chart failed for ${symbol}:`, err.message);
    return getEmptyChartResult(symbol, days);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ✅ بيانات فارغة بدلاً من بيانات مزيفة بـ Math.random()
function getEmptyChartResult(symbol, days) {
  return {
    symbol,
    days,
    data:         [],
    stats:        { currentPrice: 0, openPrice: 0, high: 0, low: 0, periodChange: 0, periodChangeFormatted: '0%' },
    sparklineData:[],
    volumeData:   [],
    timestamp:    Date.now(),
    isFallback:   true,
  };
}

// Sparkline — نقاط مختصرة من بيانات OHLC الحقيقية
function generateSparkline(ohlcData) {
  if (!ohlcData || ohlcData.length === 0) return [];
  const step = Math.max(1, Math.floor(ohlcData.length / 20));
  const pts  = [];
  for (let i = 0; i < ohlcData.length; i += step) {
    pts.push(ohlcData[i].close);
  }
  return pts;
}

function formatPriceChange(change) {
  if (!change && change !== 0) return '0%';
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
}

// ─── Cache clear ──────────────────────────────────────────────────────────────
export function clearPriceChartCache() {
  Object.keys(CACHE).forEach(k => delete CACHE[k]);
}

export default { getOHLCData, getVolumeData, getFullChartData, clearPriceChartCache };
