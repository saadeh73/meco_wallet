// services/priceChartService.js

const COINGECKO_API  = 'https://api.coingecko.com/api/v3';
const DEXSCREENER_API= 'https://api.dexscreener.com/latest/dex/tokens';
const MECO_MINT      = 'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W';
const CACHE_DURATION = 60000; // 1 دقيقة
const FETCH_TIMEOUT  = 8000;  // 8 ثوانٍ

// ✅ IDs محدّثة — تتزامن مع CORE_TOKENS في jupiterMarketService
const COINGECKO_IDS = {
  SOL:    'solana',
  USDT:   'tether',
  USDC:   'usd-coin',
  JUP:    'jupiter-exchange-solana',
  RAY:    'raydium',
  BONK:   'bonk',
  WIF:    'dogwifcoin',
  PYTH:   'pyth-network',
  JTO:    'jito-governance-token',
  HNT:    'helium',
  ORCA:   'orca',
  MNDE:   'marinade',
  BOME:   'book-of-meme',
  POPCAT: 'popcat',
  MEW:    'cat-in-a-dogs-world',
  // ✅ MECO غير مدرج هنا — يُعالج عبر DexScreener
};

// ✅ حذف MECO من القائمة — له مصدر بيانات خاص
const NO_CHART_SYMBOLS = new Set(['USDT', 'USDC']);

const CACHE = {};

// ─── Helper: fetch مع timeout ─────────────────────────────────────────────────
const fetchWithTimeout = (url, ms = FETCH_TIMEOUT) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    .finally(() => clearTimeout(timer));
};

// ─── MECO OHLC من DexScreener ─────────────────────────────────────────────────
// DexScreener لا يوفر OHLC مباشرة لكن يوفر بيانات السعر الحالية
// نبني OHLC تقريبي من بيانات السعر والتغير
async function getMecoChartData(days) {
  const cacheKey = `ohlc_MECO_${days}`;
  const now      = Date.now();

  if (CACHE[cacheKey] && now - CACHE[cacheKey].timestamp < CACHE_DURATION) {
    return CACHE[cacheKey].data;
  }

  try {
    const res = await fetchWithTimeout(`${DEXSCREENER_API}/${MECO_MINT}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    if (!json?.pairs || json.pairs.length === 0) throw new Error('No pairs found');

    // ✅ أفضل pair = أعلى سيولة
    const pair = json.pairs.reduce((best, p) =>
      (p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best
    , json.pairs[0]);

    const currentPrice = parseFloat(pair.priceUsd || 0);
    const change24h    = parseFloat(pair.priceChange?.h24 || 0);
    const high24h      = currentPrice * (1 + Math.abs(change24h) / 100);
    const low24h       = currentPrice * (1 - Math.abs(change24h) / 100);
    const openPrice    = currentPrice / (1 + change24h / 100);
    const volume24h    = parseFloat(pair.volume?.h24 || 0);

    // ✅ بناء نقاط OHLC تقريبية من البيانات المتاحة
    const pointCount = days <= 1 ? 24 : days * 4;
    const data       = [];
    const msPerPoint = (days * 24 * 60 * 60 * 1000) / pointCount;

    for (let i = 0; i < pointCount; i++) {
      const t          = now - (pointCount - i) * msPerPoint;
      const progress   = i / pointCount;
      // سعر تقريبي يتدرج من openPrice إلى currentPrice
      const approxPrice= openPrice + (currentPrice - openPrice) * progress;
      const noise      = approxPrice * 0.005 * (Math.sin(i * 2.5) * 0.5);
      const close      = approxPrice + noise;
      const open       = i === 0 ? openPrice : data[i - 1]?.close || close;
      const high       = Math.max(open, close) * (1 + 0.003);
      const low        = Math.min(open, close) * (1 - 0.003);

      data.push({ timestamp: t, open, high, low, close });
    }

    const result = {
      symbol: 'MECO',
      days,
      data,
      stats: {
        currentPrice,
        openPrice,
        high:                  high24h,
        low:                   low24h,
        volume24h,
        periodChange:          change24h,
        periodChangeFormatted: formatPriceChange(change24h),
      },
      sparklineData: generateSparkline(data),
      timestamp:     now,
      isFallback:    false,
    };

    CACHE[cacheKey] = { data: result, timestamp: now };
    return result;

  } catch (err) {
    console.warn('❌ [PriceChart] MECO DexScreener failed:', err.message);
    return getEmptyChartResult('MECO', days);
  }
}

// ─── OHLC Data ────────────────────────────────────────────────────────────────
export async function getOHLCData(symbol, days = 7) {
  // ✅ MECO — مصدر خاص من DexScreener
  if (symbol === 'MECO') return getMecoChartData(days);

  // ✅ عملات بدون chart
  if (NO_CHART_SYMBOLS.has(symbol)) return getEmptyChartResult(symbol, days);

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
    if (!Array.isArray(ohlcRaw) || ohlcRaw.length === 0) throw new Error('Empty OHLC response');

    const data = ohlcRaw.map(p => ({
      timestamp: p[0],
      open:  p[1],
      high:  p[2],
      low:   p[3],
      close: p[4],
    }));

    const latestClose = data[data.length - 1]?.close || 0;
    const firstOpen   = data[0]?.open || 0;
    const periodChange= firstOpen > 0 ? ((latestClose - firstOpen) / firstOpen) * 100 : 0;

    const result = {
      symbol,
      days,
      data,
      stats: {
        currentPrice:          latestClose,
        openPrice:             firstOpen,
        high:                  Math.max(...data.map(d => d.high)),
        low:                   Math.min(...data.map(d => d.low)),
        periodChange,
        periodChangeFormatted: formatPriceChange(periodChange),
      },
      sparklineData: generateSparkline(data),
      timestamp:     now,
      isFallback:    false,
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
  if (NO_CHART_SYMBOLS.has(symbol) || symbol === 'MECO') return [];

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
function getEmptyChartResult(symbol, days) {
  return {
    symbol,
    days,
    data:          [],
    stats:         { currentPrice: 0, openPrice: 0, high: 0, low: 0, periodChange: 0, periodChangeFormatted: '0%' },
    sparklineData: [],
    volumeData:    [],
    timestamp:     Date.now(),
    isFallback:    true,
  };
}

function generateSparkline(ohlcData) {
  if (!ohlcData || ohlcData.length === 0) return [];
  const step = Math.max(1, Math.floor(ohlcData.length / 20));
  const pts  = [];
  for (let i = 0; i < ohlcData.length; i += step) pts.push(ohlcData[i].close);
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
