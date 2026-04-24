// services/priceChartService.js
// خدمة جديدة لجلب بيانات الرسم البياني للأسعار (OHLC)
// يستخدم CoinGecko API كمحرك أساسي

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const CACHE_DURATION = 60000; // 1 minute cache

// Map من رموز SOL tokens إلى CoinGecko IDs
const COINGECKO_IDS = {
  SOL: 'solana',
  MECO: 'monycoin',
  USDT: 'tether',
  USDC: 'usd-coin',
  JUP: 'jupiter-aggregator',
  RAY: 'raydium',
  BONK: 'bonk',
  WIF: 'dogwifcoin',
  PYTH: 'pyth-network',
  JTO: 'jito',
  RNDR: 'render-token',
  HNT: 'helium',
  ORCA: 'orca',
  MNDE: 'marinade-finance',
  BOME: 'book-of-meme',
  TNSR: 'tensor',
};

const CACHE = {};

/**
 * جلب بيانات OHLC (Open, High, Low, Close) للعملة
 * @param {string} symbol - رمز العملة
 * @param {string} days - عدد الأيام (1, 7, 30, 90, 365, max)
 * @returns {Object} بيانات OHLC مع حجم التداول
 */
export async function getOHLCData(symbol, days = 7) {
  const cacheKey = `${symbol}_${days}`;
  const now = Date.now();

  // Check cache
  if (CACHE[cacheKey] && (now - CACHE[cacheKey].timestamp) < CACHE_DURATION) {
    return CACHE[cacheKey].data;
  }

  const coinId = COINGECKO_IDS[symbol] || symbol.toLowerCase();

  try {
    // جلب بيانات OHLC من CoinGecko
    const url = `${COINGECKO_API}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const ohlcData = await response.json();

    if (!Array.isArray(ohlcData) || ohlcData.length === 0) {
      throw new Error('No OHLC data available');
    }

    // تحويل البيانات إلى تنسيق مناسب
    const formattedData = ohlcData.map(point => ({
      timestamp: point[0],
      open: point[1],
      high: point[2],
      low: point[3],
      close: point[4],
    }));

    // حساب قيم إضافية
    const latestClose = formattedData[formattedData.length - 1]?.close || 0;
    const firstOpen = formattedData[0]?.open || 0;
    const change24h = firstOpen > 0 ? ((latestClose - firstOpen) / firstOpen) * 100 : 0;

    const result = {
      symbol,
      days,
      data: formattedData,
      stats: {
        currentPrice: latestClose,
        openPrice: firstOpen,
        high24h: Math.max(...formattedData.map(d => d.high)),
        low24h: Math.min(...formattedData.map(d => d.low)),
        change24h,
        change24hFormatted: formatPriceChange(change24h),
      },
      timestamp: now,
    };

    CACHE[cacheKey] = {
      data: result,
      timestamp: now,
    };

    return result;
  } catch (error) {
    console.warn(`❌ [PriceChart] Failed to fetch OHLC for ${symbol}:`, error.message);
    return generateFallbackChart(symbol, days);
  }
}

/**
 * جلب بيانات Volume (حجم التداول)
 * @param {string} symbol - رمز العملة
 * @param {string} days - عدد الأيام
 * @returns {Array} بيانات Volume
 */
export async function getVolumeData(symbol, days = 7) {
  const coinId = COINGECKO_IDS[symbol] || symbol.toLowerCase();

  try {
    const url = `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&type=line`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.total_volumes || !Array.isArray(data.total_volumes)) {
      throw new Error('No volume data available');
    }

    return data.total_volumes.map(point => ({
      timestamp: point[0],
      volume: point[1],
    }));
  } catch (error) {
    console.warn(`❌ [PriceChart] Failed to fetch volume for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * جلب البيانات الكاملة للرسمة البيانية
 * @param {string} symbol - رمز العملة
 * @param {string} days - عدد الأيام
 * @returns {Object} بيانات كاملة للرسمة
 */
export async function getFullChartData(symbol, days = 7) {
  try {
    const [ohlcResult, volumeData] = await Promise.all([
      getOHLCData(symbol, days),
      getVolumeData(symbol, days),
    ]);

    return {
      ...ohlcResult,
      volumeData,
      sparklineData: generateSparklineData(ohlcResult.data),
    };
  } catch (error) {
    console.warn(`❌ [PriceChart] Failed to get full chart data for ${symbol}:`, error.message);
    return generateFallbackChart(symbol, days);
  }
}

/**
 * توليد بيانات Sparkline مبسطة
 */
function generateSparklineData(ohlcData) {
  if (!ohlcData || ohlcData.length === 0) return [];

  // اختيار نقاط عشوائية لتمثيل الرسم
  const step = Math.max(1, Math.floor(ohlcData.length / 20));
  const points = [];

  for (let i = 0; i < ohlcData.length; i += step) {
    points.push(ohlcData[i].close);
  }

  return points;
}

/**
 * توليد بيانات افتراضية عند فشل API
 */
function generateFallbackChart(symbol, days) {
  const now = Date.now();
  const hoursBack = days === '1' ? 24 : days * 24;
  const data = [];
  const basePrice = getBasePrice(symbol);

  // توليد نقاط وهمية
  for (let i = 0; i < 50; i++) {
    const timestamp = now - (hoursBack * 3600000 * (1 - i / 50));
    const randomFactor = 0.95 + Math.random() * 0.1;
    const price = basePrice * randomFactor;

    data.push({
      timestamp,
      open: price * 0.995,
      high: price * 1.02,
      low: price * 0.98,
      close: price,
    });
  }

  return {
    symbol,
    days,
    data,
    stats: {
      currentPrice: basePrice,
      openPrice: basePrice * 0.98,
      high24h: basePrice * 1.02,
      low24h: basePrice * 0.98,
      change24h: 2.0,
      change24hFormatted: '+2.0%',
    },
    timestamp: now,
    isFallback: true,
    volumeData: [],
    sparklineData: data.slice(-20).map(d => d.close),
  };
}

/**
 * تحديد السعر الأساسي لكل عملة
 */
function getBasePrice(symbol) {
  const prices = {
    SOL: 145.50,
    MECO: 0.000103,
    USDT: 1.0,
    USDC: 1.0,
    JUP: 0.89,
    RAY: 4.52,
    BONK: 0.000018,
    WIF: 2.15,
    PYTH: 0.35,
    JTO: 2.80,
    RNDR: 7.50,
    HNT: 6.20,
    ORCA: 1.85,
    MNDE: 0.85,
    BOME: 0.0095,
    TNSR: 0.85,
  };

  return prices[symbol] || 1.0;
}

/**
 * تنسيق تغيير السعر
 */
function formatPriceChange(change) {
  if (change === undefined || change === null || isNaN(change)) return '0%';
  const prefix = change >= 0 ? '+' : '';
  return `${prefix}${change.toFixed(2)}%`;
}

/**
 * مسح الكاش
 */
export function clearPriceChartCache() {
  Object.keys(CACHE).forEach(key => delete CACHE[key]);
}

export default {
  getOHLCData,
  getVolumeData,
  getFullChartData,
  clearPriceChartCache,
};
