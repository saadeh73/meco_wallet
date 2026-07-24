// MECO Wallet - Shared Constants
// Last Updated: 2026-04-12
// يتضمن جميع الثوابت المستخدمة في التطبيق: عناوين التوكنات، نقاط RPC، واجهات API، إعدادات التطبيق

export const MINT_ADDRESSES = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  MECO: 'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W',
};

export const RPC_ENDPOINTS = {
  // Helius (أساسي)
  PRIMARY: 'https://rpc.helius.xyz/?api-key=2d5e82d1-2f55-4c8f-8f7a-f08f6e09e3f6',
  // Ankr (احتياطي)
  FALLBACK: 'https://rpc.ankr.com/solana',
  // عام (احتياطي ثانوي)
  PUBLIC: 'https://api.mainnet-beta.solana.com',
};

export const API_ENDPOINTS = {
  JUPITER_QUOTE: 'https://quote-api.jup.ag/v6/quote',
  JUPITER_SWAP: 'https://quote-api.jup.ag/v6/swap',
  JUPITER_PRICE: 'https://price.jup.ag/v6/price',
  COINGECKO_MARKETS: 'https://api.coingecko.com/api/v3/coins/markets',
  COINGECKO_SIMPLE: 'https://api.coingecko.com/api/v3/simple/price',
};

export const APP_CONFIG = {
  NAME: 'MECO Wallet',
  SCHEME: 'meco-wallet', // يجب أن يتطابق مع scheme في app.json
  VERSION: '1.17.0',
  BUILD: 10,
  MINIMUM_SOL_BALANCE: 0.001, // الحد الأدنى من SOL لتغطية رسوم الشبكة
  DEFAULT_SLIPPAGE_BPS: 100,   // 1% انزلاق سعري افتراضي
};

// قائمة التوكنات المدعومة مع بيانات العرض (تُستخدم في شاشة إضافة التوكنات المخصصة)
export const SUPPORTED_TOKENS = [
  {
    symbol: 'SOL',
    name: 'Solana',
    mint: MINT_ADDRESSES.SOL,
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: MINT_ADDRESSES.USDC,
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    mint: MINT_ADDRESSES.USDT,
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
  },
  {
    symbol: 'MECO',
    name: 'MonyCoin',
    mint: MINT_ADDRESSES.MECO,
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco.logo.png',
  },
];
