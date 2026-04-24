// services/marketOverviewService.js
// خدمة جديدة لجلب بيانات السوق العامة (Market Overview)
// يستخدم CoinGecko API كمحرك أساسي

const CACHE_DURATION = 60000; // 1 minute cache
const CACHE = {
  globalData: null,
  globalDataTime: 0,
  topMovers: null,
  topMoversTime: 0,
};

// ============ Global Market Data ============

/**
 * جلب بيانات السوق العامة
 * @returns {Object} بيانات السوق العامة
 */
export async function getGlobalMarketData() {
  const now = Date.now();

  // Check cache first
  if (CACHE.globalData && (now - CACHE.globalDataTime) < CACHE_DURATION) {
    return CACHE.globalData;
  }

  try {
    // CoinGecko Global API
    const response = await fetch('https://api.coingecko.com/api/v3/global', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.data) {
      const globalData = {
        totalMarketCap: data.data.total_market_cap?.usd || 0,
        totalVolume24h: data.data.total_volume?.usd || 0,
        btcDominance: data.data.market_cap_percentage?.btc || 0,
        ethDominance: data.data.market_cap_percentage?.eth || 0,
        activeCryptocurrencies: data.data.active_cryptocurrencies || 0,
        marketCapChange24h: data.data.market_cap_change_percentage_24h_usd || 0,
        lastUpdated: now,
      };

      // Format numbers for display
      globalData.totalMarketCapFormatted = formatLargeNumber(globalData.totalMarketCap);
      globalData.totalVolume24hFormatted = formatLargeNumber(globalData.totalVolume24h);
      globalData.marketCapChangeFormatted = formatPercentage(globalData.marketCapChange24h);

      CACHE.globalData = globalData;
      CACHE.globalDataTime = now;

      return globalData;
    }

    // Fallback if data is invalid
    return getDefaultGlobalData();
  } catch (error) {
    console.warn('❌ [MarketOverview] Failed to fetch global data:', error.message);
    return getDefaultGlobalData();
  }
}

/**
 * بيانات افتراضية في حالة فشل الـ API
 */
function getDefaultGlobalData() {
  return {
    totalMarketCap: 0,
    totalVolume24h: 0,
    btcDominance: 52.3,
    ethDominance: 17.8,
    activeCryptocurrencies: 0,
    marketCapChange24h: 0,
    totalMarketCapFormatted: 'N/A',
    totalVolume24hFormatted: 'N/A',
    marketCapChangeFormatted: '0%',
    lastUpdated: Date.now(),
    isFallback: true,
  };
}

// ============ Top Movers ============

/**
 * جلب أكبر الرابحين والخاسرين
 * @param {number} limit - عدد العملات لكل فئة
 * @returns {Object} الرابحين والخاسرين
 */
export async function getTopMovers(limit = 5) {
  const now = Date.now();

  // Check cache (5 minutes for top movers)
  if (CACHE.topMovers && (now - CACHE.topMoversTime) < 300000) {
    return CACHE.topMovers;
  }

  try {
    // CoinGecko Markets API for Solana tokens
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?' +
        'vs_currency=usd&order=volume_desc&per_page=100&page=1&sparkline=false',
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const coins = await response.json();

    // Sort by 24h change
    const sorted = [...coins].sort(
      (a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0)
    );

    const topMovers = {
      gainers: sorted
        .filter(c => (c.price_change_percentage_24h || 0) > 0)
        .slice(0, limit)
        .map(c => ({
          id: c.id,
          symbol: c.symbol?.toUpperCase(),
          name: c.name,
          price: c.current_price,
          change24h: c.price_change_percentage_24h || 0,
          image: c.image,
        })),
      losers: sorted
        .filter(c => (c.price_change_percentage_24h || 0) < 0)
        .slice(0, limit)
        .map(c => ({
          id: c.id,
          symbol: c.symbol?.toUpperCase(),
          name: c.name,
          price: c.current_price,
          change24h: c.price_change_percentage_24h || 0,
          image: c.image,
        })),
      lastUpdated: now,
    };

    CACHE.topMovers = topMovers;
    CACHE.topMoversTime = now;

    return topMovers;
  } catch (error) {
    console.warn('❌ [MarketOverview] Failed to fetch top movers:', error.message);
    return {
      gainers: [],
      losers: [],
      lastUpdated: Date.now(),
      isFallback: true,
    };
  }
}

// ============ Helper Functions ============

/**
 * تنسيق الأرقام الكبيرة (مثل 2.45T, 89.2B)
 */
function formatLargeNumber(num) {
  if (num === 0) return '\$0';

  const trillion = 1e12;
  const billion = 1e9;
  const million = 1e6;
  const thousand = 1e3;

  if (num >= trillion) {
    return `$${(num / trillion).toFixed(2)}T`;
  } else if (num >= billion) {
    return `$${(num / billion).toFixed(2)}B`;
  } else if (num >= million) {
    return `$${(num / million).toFixed(2)}M`;
  } else if (num >= thousand) {
    return `$${(num / thousand).toFixed(2)}K`;
  }

  return `$${num.toFixed(2)}`;
}

/**
 * تنسيق النسبة المئوية
 */
function formatPercentage(num) {
  if (num === undefined || num === null || isNaN(num)) return '0%';
  const prefix = num >= 0 ? '+' : '';
  return `${prefix}${num.toFixed(1)}%`;
}

/**
 * مسح الكاش
 */
export function clearMarketOverviewCache() {
  CACHE.globalData = null;
  CACHE.globalDataTime = 0;
  CACHE.topMovers = null;
  CACHE.topMoversTime = 0;
}

export default {
  getGlobalMarketData,
  getTopMovers,
  clearMarketOverviewCache,
};
