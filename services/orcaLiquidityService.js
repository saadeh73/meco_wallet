// services/orcaLiquidityService.js
import * as web3 from '@solana/web3.js';
import { Buffer } from 'buffer';

const WHIRLPOOL_PROGRAM_ID = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

// ✅ مجمعا سيولة MECO
const MECO_POOLS = {
  '6SujZ9VU5vLyEZGkVdDDJB45ef1ugQvXAzht49Kbtfsc': {
    name: 'MECO/SOL', tokenA: 'MECO', tokenB: 'SOL',
    decimalsA: 9, decimalsB: 9, fee: '1%', color: '#9945FF',
  },
  '34Vqf9xFyUFVhp6wVt3ScB4CBJrGBm6BbVwR67jEn2Ed': {
    name: 'MECO/USDT', tokenA: 'MECO', tokenB: 'USDT',
    decimalsA: 9, decimalsB: 6, fee: '1%', color: '#26A17B',
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function readU128LE(buffer, offset) {
  const lo = buffer.readBigUInt64LE(offset);
  const hi = buffer.readBigUInt64LE(offset + 8);
  return hi * BigInt('18446744073709551616') + lo;
}

function sqrtPriceX64ToFloat(big) {
  const hi = Number(big >> BigInt(64));
  const lo = Number(big & BigInt('18446744073709551615')) / Math.pow(2, 64);
  return hi + lo;
}

function tickToSqrtPrice(tick) {
  return Math.sqrt(Math.pow(1.0001, tick));
}

function calcTokenAmounts(liquidity, sqrtCurrent, sqrtLower, sqrtUpper) {
  const liq = Number(liquidity);
  if (sqrtCurrent <= sqrtLower) {
    return {
      amountA: liq * (sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper),
      amountB: 0,
    };
  } else if (sqrtCurrent >= sqrtUpper) {
    return {
      amountA: 0,
      amountB: liq * (sqrtUpper - sqrtLower),
    };
  }
  return {
    amountA: liq * (sqrtUpper - sqrtCurrent) / (sqrtCurrent * sqrtUpper),
    amountB: liq * (sqrtCurrent - sqrtLower),
  };
}

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────
export async function getWhirlpoolPositions(walletTokenAccounts, connection, priceMap) {
  // NFTs = توكنز بكمية 1 (positions هي NFTs)
  const nftMints = walletTokenAccounts
    .filter(ta => Number(ta.amount) === 1)
    .map(ta => ta.mint)
    .filter(Boolean);

  if (nftMints.length === 0) return [];

  const positions = [];

  // معالجة دفعات لتجنب ضغط RPC
  const BATCH = 4;
  for (let i = 0; i < nftMints.length; i += BATCH) {
    const batch = nftMints.slice(i, i + BATCH);
    await Promise.all(batch.map(async (mint) => {
      try {
        // ── 1. حساب Position PDA ─────────────────────────────────────────────
        const [positionPda] = web3.PublicKey.findProgramAddressSync(
          [Buffer.from('position'), new web3.PublicKey(mint).toBuffer()],
          new web3.PublicKey(WHIRLPOOL_PROGRAM_ID)
        );

        // ── 2. جلب بيانات Position ──────────────────────────────────────────
        const posAcct = await connection.getAccountInfo(positionPda);
        if (!posAcct || posAcct.data.length < 144) return;

        const pd = Buffer.from(posAcct.data);

        // whirlpool address عند offset 8
        const whirlpoolAddr = new web3.PublicKey(pd.slice(8, 40)).toBase58();
        const poolInfo = MECO_POOLS[whirlpoolAddr];
        if (!poolInfo) return; // ليس من مجمعاتنا

        // ── 3. قراءة بيانات الـ Position ────────────────────────────────────
        const liquidity   = readU128LE(pd, 72);
        const tickLower   = pd.readInt32LE(88);
        const tickUpper   = pd.readInt32LE(92);
        const feeOwedA    = Number(pd.readBigUInt64LE(112)) / Math.pow(10, poolInfo.decimalsA);
        const feeOwedB    = Number(pd.readBigUInt64LE(136)) / Math.pow(10, poolInfo.decimalsB);

        // ── 4. جلب بيانات الـ Whirlpool (السعر الحالي) ──────────────────────
        const wpAcct = await connection.getAccountInfo(new web3.PublicKey(whirlpoolAddr));
        if (!wpAcct) return;

        const wd = Buffer.from(wpAcct.data);
        const sqrtPriceX64 = readU128LE(wd, 65);
        const sqrtCurrent  = sqrtPriceX64ToFloat(sqrtPriceX64);

        // ── 5. حساب كميات التوكنز ────────────────────────────────────────────
        const sqrtLower = tickToSqrtPrice(tickLower);
        const sqrtUpper = tickToSqrtPrice(tickUpper);
        const { amountA, amountB } = calcTokenAmounts(liquidity, sqrtCurrent, sqrtLower, sqrtUpper);

        const tokenAAmount = amountA / Math.pow(10, poolInfo.decimalsA);
        const tokenBAmount = amountB / Math.pow(10, poolInfo.decimalsB);

        // ── 6. القيمة بالدولار ───────────────────────────────────────────────
        const priceA   = priceMap[poolInfo.tokenA] || 0;
        const priceB   = priceMap[poolInfo.tokenB] || 0;
        const valueUSD = tokenAAmount * priceA + tokenBAmount * priceB;
        const feesUSD  = feeOwedA * priceA + feeOwedB * priceB;

        positions.push({
          type:      'lp_position',
          mint,
          symbol:    poolInfo.name,
          name:      `${poolInfo.fee} Fee`,
          poolInfo,
          liquidity,
          tickLower,
          tickUpper,
          tokenAAmount,
          tokenBAmount,
          feeOwedA,
          feeOwedB,
          valueUSD,
          feesUSD,
          hasUnclaimedFees: feeOwedA > 0.0001 || feeOwedB > 0.0001,
        });

      } catch (_) {
        // ليس position أو خطأ — تجاهل
      }
    }));
    // تأخير بسيط بين الدفعات
    if (i + BATCH < nftMints.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return positions;
}
