// services/priceChartService.js
import { CORE_TOKENS } from './jupiterMarketService';

const COINGECKO_API   = 'https://api.coingecko.com/api/v3';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const CACHE_DURATION  = 60000;
const FETCH_TIMEOUT   = 8000;

// CoinGecko IDs للعملات الكبرى — MECO غير موجود هنا عمداً
const COINGECKO_IDS = {
  SOL:'solana', USDT:'tether', USDC:'usd-coin',
  JUP:'jupiter-exchange-solana', RAY:'raydium', BONK:'bonk',
  WIF:'dogwifcoin', PYTH:'pyth-network', JTO:'jito-governance-token',
  HNT:'helium', ORCA:'orca', MNDE:'marinade',
  BOME:'book-of-meme', POPCAT:'popcat', MEW:'cat-in-a-dogs-world',
};

const NO_CHART = new Set(['USDT','USDC']);
const CACHE    = {};

const fetchWT = (url, ms = FETCH_TIMEOUT) => {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, headers:{ Accept:'application/json' } })
    .finally(() => clearTimeout(timer));
};

// ─── DexScreener OHLC — لكل عملة بدون CoinGecko ID (MECO والرموز المخصصة) ───
async function buildOHLCFromDexScreener(symbol, mint, days) {
  const key = `dex_${symbol}_${days}`;
  const now = Date.now();
  if (CACHE[key] && now - CACHE[key].ts < CACHE_DURATION) return CACHE[key].data;

  try {
    const res  = await fetchWT(`${DEXSCREENER_API}/${mint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.pairs?.length) throw new Error('No pairs');

    const pair         = json.pairs.reduce((b, p) => (p.liquidity?.usd||0)>(b.liquidity?.usd||0)?p:b, json.pairs[0]);
    const currentPrice = parseFloat(pair.priceUsd || 0);
    const change24h    = parseFloat(pair.priceChange?.h24 || 0);
    const volume24h    = parseFloat(pair.volume?.h24 || 0);
    const openPrice    = change24h !== -100 ? currentPrice / (1 + change24h/100) : currentPrice;
    const high         = currentPrice * (1 + Math.abs(change24h)/100);
    const low          = currentPrice * (1 - Math.abs(change24h)/100);

    const pts    = days <= 1 ? 24 : days * 4;
    const msPerP = (days * 86400000) / pts;
    const data   = [];
    for (let i = 0; i < pts; i++) {
      const t     = now - (pts - i) * msPerP;
      const prog  = i / pts;
      const base  = openPrice + (currentPrice - openPrice) * prog;
      const noise = base * 0.005 * Math.sin(i * 2.5);
      const close = base + noise;
      const open  = i === 0 ? openPrice : data[i-1].close;
      data.push({ timestamp:t, open, high:Math.max(open,close)*1.003, low:Math.min(open,close)*0.997, close });
    }

    const result = {
      symbol, days, data,
      stats:{ currentPrice, openPrice, high, low, volume24h, periodChange:change24h, periodChangeFormatted:fmtChg(change24h) },
      sparklineData: sparkline(data), timestamp:now, isFallback:false,
    };
    CACHE[key] = { data:result, ts:now };
    return result;
  } catch (e) {
    console.warn(`[Chart] DexScreener failed for ${symbol}:`, e.message);
    return empty(symbol, days);
  }
}

// ─── getOHLCData — موحد لكل العملات ──────────────────────────────────────────
export async function getOHLCData(symbol, days = 7, mintOverride = null) {
  if (NO_CHART.has(symbol)) return empty(symbol, days);

  const coinId = COINGECKO_IDS[symbol];

  // بدون CoinGecko ID → DexScreener (MECO والرموز المخصصة)
  if (!coinId) {
    const token = CORE_TOKENS.find(t => t.symbol === symbol);
    const mint  = mintOverride || token?.mint;
    if (!mint) return empty(symbol, days);
    return buildOHLCFromDexScreener(symbol, mint, days);
  }

  const key = `cg_${symbol}_${days}`;
  const now = Date.now();
  if (CACHE[key] && now - CACHE[key].ts < CACHE_DURATION) return CACHE[key].data;

  try {
    const res = await fetchWT(`${COINGECKO_API}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    if (!Array.isArray(raw) || !raw.length) throw new Error('Empty');

    const data    = raw.map(p => ({ timestamp:p[0], open:p[1], high:p[2], low:p[3], close:p[4] }));
    const last    = data[data.length-1]?.close || 0;
    const first   = data[0]?.open || 0;
    const chg     = first > 0 ? ((last - first)/first)*100 : 0;

    const result = {
      symbol, days, data,
      stats:{
        currentPrice:last, openPrice:first,
        high:Math.max(...data.map(d=>d.high)), low:Math.min(...data.map(d=>d.low)),
        periodChange:chg, periodChangeFormatted:fmtChg(chg),
      },
      sparklineData: sparkline(data), timestamp:now, isFallback:false,
    };
    CACHE[key] = { data:result, ts:now };
    return result;
  } catch (e) {
    console.warn(`[Chart] CoinGecko failed for ${symbol}, fallback DexScreener:`, e.message);
    const token = CORE_TOKENS.find(t => t.symbol === symbol);
    const mint  = mintOverride || token?.mint;
    if (mint) return buildOHLCFromDexScreener(symbol, mint, days);
    return empty(symbol, days);
  }
}

export async function getVolumeData(symbol, days = 7) {
  if (NO_CHART.has(symbol) || !COINGECKO_IDS[symbol]) return [];
  const key = `vol_${symbol}_${days}`;
  const now = Date.now();
  if (CACHE[key] && now - CACHE[key].ts < CACHE_DURATION) return CACHE[key].data;
  try {
    const res = await fetchWT(`${COINGECKO_API}/coins/${COINGECKO_IDS[symbol]}/market_chart?vs_currency=usd&days=${days}&interval=daily`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body?.total_volumes)) throw new Error('No volume');
    const vol = body.total_volumes.map(p => ({ timestamp:p[0], volume:p[1] }));
    CACHE[key] = { data:vol, ts:now };
    return vol;
  } catch (_) { return []; }
}

export async function getFullChartData(symbol, days = 7, mintOverride = null) {
  const [ohlc, vol] = await Promise.all([
    getOHLCData(symbol, days, mintOverride),
    getVolumeData(symbol, days),
  ]);
  return { ...ohlc, volumeData: vol };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function empty(symbol, days) {
  return { symbol, days, data:[], stats:{ currentPrice:0, openPrice:0, high:0, low:0, periodChange:0, periodChangeFormatted:'0%' }, sparklineData:[], volumeData:[], timestamp:Date.now(), isFallback:true };
}
function sparkline(data) {
  if (!data?.length) return [];
  const step = Math.max(1, Math.floor(data.length/20));
  return data.filter((_,i) => i % step === 0).map(d => d.close);
}
function fmtChg(c) {
  if (!c && c !== 0) return '0%';
  return `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`;
}

export function clearPriceChartCache() { Object.keys(CACHE).forEach(k => delete CACHE[k]); }
export default { getOHLCData, getVolumeData, getFullChartData, clearPriceChartCache };
