// services/marketOverviewService.js

const CACHE_DURATION_GLOBAL = 60000;   // 1 دقيقة
const CACHE_DURATION_MOVERS = 300000;  // 5 دقائق
const FETCH_TIMEOUT         = 8000;    // 8 ثوانٍ

const CACHE = {
  globalData:     null,
  globalDataTime: 0,
  topMovers:      null,
  topMoversTime:  0,
};

// ─── Helper: fetch مع timeout ─────────────────────────────────────────────────
const fetchWithTimeout = (url, ms = FETCH_TIMEOUT) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    .finally(() => clearTimeout(timer));
};

// ─── Global Market Data ───────────────────────────────────────────────────────
export async function getGlobalMarketData() {
  const now = Date.now();
  if (CACHE.globalData && now - CACHE.globalDataTime < CACHE_DURATION_GLOBAL) {
    return CACHE.globalData;
  }

  try {
    const res = await fetchWithTimeout('https://api.coingecko.com/api/v3/global');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { data } = await res.json();
    if (!data) return getDefaultGlobalData();

    const globalData = {
      totalMarketCap:     data.total_market_cap?.usd || 0,
      totalVolume24h:     data.total_volume?.usd || 0,
      btcDominance:       data.market_cap_percentage?.btc || 0,
      ethDominance:       data.market_cap_percentage?.eth || 0,
      activeCryptocurrencies: data.active_cryptocurrencies || 0,
      marketCapChange24h: data.market_cap_change_percentage_24h_usd || 0,
      lastUpdated:        now,
    };

    globalData.totalMarketCapFormatted  = formatLargeNumber(globalData.totalMarketCap);
    globalData.totalVolume24hFormatted  = formatLargeNumber(globalData.totalVolume24h);
    globalData.marketCapChangeFormatted = formatPercentage(globalData.marketCapChange24h);

    CACHE.globalData     = globalData;
    CACHE.globalDataTime = now;
    return globalData;

  } catch (err) {
    console.warn('❌ [MarketOverview] Global data failed:', err.message);
    return getDefaultGlobalData();
  }
}

function getDefaultGlobalData() {
  return {
    totalMarketCap:             0,
    totalVolume24h:             0,
    btcDominance:               0,   // ✅ صفر بدلاً من رقم ثابت قديم
    ethDominance:               0,
    activeCryptocurrencies:     0,
    marketCapChange24h:         0,
    totalMarketCapFormatted:    'N/A',
    totalVolume24hFormatted:    'N/A',
    marketCapChangeFormatted:   '0%',
    lastUpdated:                Date.now(),
    isFallback:                 true,
  };
}

// ─── Top Movers ───────────────────────────────────────────────────────────────
export async function getTopMovers(limit = 5) {
  const now = Date.now();
  if (CACHE.topMovers && now - CACHE.topMoversTime < CACHE_DURATION_MOVERS) {
    return CACHE.topMovers;
  }

  try {
    const res = await fetchWithTimeout(
      'https://api.coingecko.com/api/v3/coins/markets' +
      '?vs_currency=usd&order=volume_desc&per_page=100&page=1&sparkline=false'
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const coins = await res.json();
    if (!Array.isArray(coins)) return getDefaultMovers();

    const toMoverItem = c => ({
      id:       c.id,
      symbol:   c.symbol?.toUpperCase(),
      name:     c.name,
      price:    c.current_price,
      change24h:c.price_change_percentage_24h || 0,
      image:    c.image,
    });

    // ✅ إصلاح: gainers تنازلي (أكبر ربح أولاً)، losers تصاعدي (أكبر خسارة أولاً)
    const gainers = [...coins]
      .filter(c => (c.price_change_percentage_24h || 0) > 0)
      .sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0))
      .slice(0, limit)
      .map(toMoverItem);

    const losers = [...coins]
      .filter(c => (c.price_change_percentage_24h || 0) < 0)
      .sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0)) // ✅ تصاعدي = أشد سلبية أولاً
      .slice(0, limit)
      .map(toMoverItem);

    const topMovers = { gainers, losers, lastUpdated: now };
    CACHE.topMovers     = topMovers;
    CACHE.topMoversTime = now;
    return topMovers;

  } catch (err) {
    console.warn('❌ [MarketOverview] Top movers failed:', err.message);
    return getDefaultMovers();
  }
}

function getDefaultMovers() {
  return { gainers: [], losers: [], lastUpdated: Date.now(), isFallback: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatLargeNumber(num) {
  if (!num || num === 0) return '$0';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9)  return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6)  return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3)  return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

function formatPercentage(num) {
  if (num === undefined || num === null || isNaN(num)) return '0%';
  return `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`;
}

export function clearMarketOverviewCache() {
  CACHE.globalData     = null;
  CACHE.globalDataTime = 0;
  CACHE.topMovers      = null;
  CACHE.topMoversTime  = 0;
}

export default { getGlobalMarketData, getTopMovers, clearMarketOverviewCache };
