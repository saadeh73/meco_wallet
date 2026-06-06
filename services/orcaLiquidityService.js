// services/orcaLiquidityService.js
import * as web3 from '@solana/web3.js';
import { Buffer } from 'buffer';

const WHIRLPOOL_PROGRAM_ID = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
const TOKEN_PROGRAM_ID     = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

const MECO_POOLS = {
  '6SujZ9VU5vLyEZGkVdDDJB45ef1ugQvXAzht49Kbtfsc': {
    name: 'MECO/SOL',  tokenA: 'MECO', tokenB: 'SOL',
    decimalsA: 9, decimalsB: 9, fee: '1%', color: '#9945FF',
  },
  '34Vqf9xFyUFVhp6wVt3ScB4CBJrGBm6BbVwR67jEn2Ed': {
    name: 'MECO/USDT', tokenA: 'MECO', tokenB: 'USDT',
    decimalsA: 9, decimalsB: 6, fee: '1%', color: '#26A17B',
  },
};

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
    return { amountA: liq * (sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper), amountB: 0 };
  } else if (sqrtCurrent >= sqrtUpper) {
    return { amountA: 0, amountB: liq * (sqrtUpper - sqrtLower) };
  }
  return {
    amountA: liq * (sqrtUpper - sqrtCurrent) / (sqrtCurrent * sqrtUpper),
    amountB: liq * (sqrtCurrent - sqrtLower),
  };
}

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────
export async function getWhirlpoolPositions(walletAddress, connection, priceMap) {
  try {
    // ✅ جلب كل token accounts مباشرة من RPC — يشمل NFTs
    const tokenAccountsResp = await connection.getParsedTokenAccountsByOwner(
      new web3.PublicKey(walletAddress),
      { programId: new web3.PublicKey(TOKEN_PROGRAM_ID) }
    );

    // فلترة NFTs فقط: amount=1, decimals=0
    const nftMints = tokenAccountsResp.value
      .filter(ta => {
        const info = ta.account.data.parsed?.info?.tokenAmount;
        return info?.uiAmount === 1 && info?.decimals === 0;
      })
      .map(ta => ta.account.data.parsed.info.mint);

    // [تشخيص] عدد NFTs المرشحة
    console.log(`[LP] Scanning ${nftMints.length} NFT(s) for ${walletAddress.slice(0,8)}...`);

    if (nftMints.length === 0) return [];

    const positions = [];
    const BATCH = 3;

    for (let i = 0; i < nftMints.length; i += BATCH) {
      const batch = nftMints.slice(i, i + BATCH);
      await Promise.all(batch.map(async (mint) => {
        try {
          // ── Position PDA ─────────────────────────────────────────────────
          const [positionPda] = web3.PublicKey.findProgramAddressSync(
            [Buffer.from('position'), new web3.PublicKey(mint).toBuffer()],
            new web3.PublicKey(WHIRLPOOL_PROGRAM_ID)
          );

          const posAcct = await connection.getAccountInfo(positionPda);
          if (!posAcct || posAcct.data.length < 144) {
            // [تشخيص] فحص حجم بيانات Position
            console.warn(`[LP] Position data missing/too small: ${posAcct?.data.length || 0} bytes (mint ${mint.slice(0,8)}...)`);
            return;
          }

          const pd = Buffer.from(posAcct.data);

          // تحقق من whirlpool address
          const whirlpoolAddr = new web3.PublicKey(pd.slice(8, 40)).toBase58();
          const poolInfo = MECO_POOLS[whirlpoolAddr];
          if (!poolInfo) {
            // [تشخيص] pool غير معروف — يظهر بوضوح
            console.warn(`[LP] Unknown whirlpool: ${whirlpoolAddr.slice(0,8)}... (NFT mint: ${mint.slice(0,8)}...)`);
            return;
          }

          // ── بيانات الـ Position ──────────────────────────────────────────
          const liquidity = readU128LE(pd, 72);
          const tickLower = pd.readInt32LE(88);
          const tickUpper = pd.readInt32LE(92);
          // ✅ تصحيح offsets: feeOwedA عند 96، feeOwedB عند 104 (ليس 112 و 136)
          const feeOwedA  = Number(pd.readBigUInt64LE(96))  / Math.pow(10, poolInfo.decimalsA);
          const feeOwedB  = Number(pd.readBigUInt64LE(104)) / Math.pow(10, poolInfo.decimalsB);

          // ── بيانات الـ Whirlpool (السعر الحالي) ─────────────────────────
          const wpAcct = await connection.getAccountInfo(new web3.PublicKey(whirlpoolAddr));
          if (!wpAcct || wpAcct.data.length < 200) {
            // [تشخيص] فحص حجم بيانات Whirlpool قبل قراءة sqrtPrice
            console.warn(`[LP] Whirlpool data missing/too small: ${wpAcct?.data.length || 0} bytes (need ≥200) for pool ${whirlpoolAddr.slice(0,8)}...`);
            return;
          }

          const wd = Buffer.from(wpAcct.data);
          const sqrtPriceX64 = readU128LE(wd, 65);
          const sqrtCurrent  = sqrtPriceX64ToFloat(sqrtPriceX64);

          // [تشخيص] قيم خام تساعد في فهم الحسابات
          console.log(`[LP] pool=${poolInfo.name} liq=${liquidity.toString().slice(0,15)}... sqrtCurrent=${sqrtCurrent.toFixed(6)} ticks=[${tickLower},${tickUpper}]`);

          // ── كميات التوكنز ────────────────────────────────────────────────
          const sqrtLower = tickToSqrtPrice(tickLower);
          const sqrtUpper = tickToSqrtPrice(tickUpper);
          // ✅ تقسيم liquidity على 1e10 لتفادي فقد الدقة عند Number() — يحول BigInt الضخم إلى نطاق آمن
          const liqSafe = Number(liquidity / BigInt(10000000000));
          const { amountA, amountB } = calcTokenAmounts(liqSafe, sqrtCurrent, sqrtLower, sqrtUpper);

          const tokenAAmount = amountA / Math.pow(10, poolInfo.decimalsA);
          const tokenBAmount = amountB / Math.pow(10, poolInfo.decimalsB);

          const priceA   = priceMap[poolInfo.tokenA] || 0;
          const priceB   = priceMap[poolInfo.tokenB] || 0;
          const valueUSD = tokenAAmount * priceA + tokenBAmount * priceB;
          const feesUSD  = feeOwedA * priceA + feeOwedB * priceB;

          positions.push({
            type:             'lp_position',
            mint,
            symbol:           poolInfo.name,
            name:             `${poolInfo.fee} Fee`,
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

        } catch (e) {
          // [تشخيص] بدلاً من catch صامت — يظهر سبب الفشل
          console.warn(`[LP] mint=${mint.slice(0,8)}... error: ${e.message}`);
        }
      }));

      if (i + BATCH < nftMints.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // [تشخيص] ملخص نهائي
    console.log(`[LP] Found ${positions.length} position(s) for ${walletAddress.slice(0,8)}...`);

    return positions;
  } catch (err) {
    console.warn('getWhirlpoolPositions error:', err.message);
    return [];
  }
}
