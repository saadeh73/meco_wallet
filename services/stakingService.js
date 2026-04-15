import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { getTokenBalance } from './heliusService';
import { default as heliusService } from './heliusService';
import { Raydium } from '@raydium-io/raydium-sdk-v2';

// ==================== الثوابت (عناوين صحيحة من المعاملة) ====================
const MECO_MINT = '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const LP_MINT = 'HjqZw7miRz4e3dBaJaBwDGt11AruMaLEg1JreeZh7VY2';
const POOL_ID = '5C3brMitqhxJL1bANW57dyRbcTQnKnduxDEAUfepYxzrB'; // هذا هو poolId الصحيح

// ✅ عناوين Vault الصحيحة
const MECO_VAULT = new web3.PublicKey('6Bqk1A2zJjigJ4ShTJoZUDdyKBu1yJdfKVQEr8GCGmAm');
const USDT_VAULT = new web3.PublicKey('AXQiWBVfkzHsJ1bauiv7Ucni7UqGYcRRJU7ugQPKa4dX');

// رسوم الخدمة
const FEE_COLLECTOR_ADDRESS = 'HXkEZSKictbSYan9ZxQGaHpFrbA4eLDyNtEDxVBkdFy6';
const SERVICE_FEE_SOL = 0.0005;

// ==================== دوال مساعدة ====================
async function getKeypair() {
  const secretKeyStr = await SecureStore.getItemAsync('wallet_private_key');
  if (!secretKeyStr) throw new Error('المفتاح الخاص غير موجود');
  let secretKey = secretKeyStr.startsWith('[') ? new Uint8Array(JSON.parse(secretKeyStr)) : bs58.decode(secretKeyStr);
  return web3.Keypair.fromSecretKey(secretKey);
}

async function getConnection() {
  try {
    return await heliusService.getConnection();
  } catch (error) {
    return new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }
}

async function getRaydiumInstance() {
  const connection = await getConnection();
  const owner = (await getKeypair()).publicKey;
  return Raydium.load({
    connection,
    owner,
    cluster: 'mainnet',
    disableLoadToken: false,
  });
}

// ==================== جلب معلومات المجمع ====================
export async function getPoolInfo() {
  console.log('🔍 [Staking] بدء جلب معلومات المجمع...');
  try {
    const connection = await getConnection();
    
    const mecoVaultInfo = await splToken.getAccount(connection, MECO_VAULT);
    const usdtVaultInfo = await splToken.getAccount(connection, USDT_VAULT);
    
    const mecoReserve = Number(mecoVaultInfo.amount) / 1e9;
    const usdtReserve = Number(usdtVaultInfo.amount) / 1e6;
    
    const estimatedApy = 15.5;
    
    const result = {
      apy: estimatedApy,
      mecoReserve,
      usdtReserve,
      totalLiquidity: (mecoReserve * (usdtReserve / mecoReserve)) + usdtReserve,
    };
    console.log('✅ [Staking] معلومات المجمع:', result);
    return result;
  } catch (error) {
    console.error('❌ [Staking] فشل في getPoolInfo:', error);
    return { apy: 0, mecoReserve: 0, usdtReserve: 0, totalLiquidity: 0 };
  }
}

// ==================== جلب رصيد LP للمستخدم ====================
export async function getUserLPBalance() {
  try {
    const pubKeyStr = await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) return 0;
    return await getTokenBalance(LP_MINT, true);
  } catch (error) {
    console.error('❌ [Staking] فشل في getUserLPBalance:', error);
    return 0;
  }
}

// ==================== إيداع سيولة ====================
export async function depositLiquidity(mecoAmount, usdtAmount) {
  console.log(`🚀 [Staking] بدء إيداع: ${mecoAmount} MECO + ${usdtAmount} USDT`);
  try {
    const keypair = await getKeypair();
    const connection = await getConnection();
    const userPubkey = keypair.publicKey;
    console.log(`🔑 [Staking] المستخدم: ${userPubkey.toString()}`);

    // --- 1. تهيئة Raydium SDK ---
    const raydium = await getRaydiumInstance();

    // --- 2. الحصول على معلومات المجمع ---
    // نستخدم poolId الصحيح
    const poolInfo = await raydium.cpmm.getPoolInfo({ poolId: POOL_ID });
    if (!poolInfo) throw new Error('تعذر العثور على المجمع');

    // --- 3. حساب كميات الإيداع ---
    // SDK سيتولى حساب الكميات المثلى تلقائياً
    const mecoAmountIn = Math.floor(mecoAmount * 1e9);
    const usdtAmountIn = Math.floor(usdtAmount * 1e6);

    // --- 4. بناء معاملة الإيداع ---
    const { transaction, signers } = await raydium.cpmm.addLiquidity({
      poolInfo,
      inputAmountA: new splToken.u64(mecoAmountIn),
      inputAmountB: new splToken.u64(usdtAmountIn),
      slippage: 0.01, // 1% انزلاق
      txVersion: 'V0',
    });

    // --- 5. إضافة رسم الخدمة ---
    const feeLamports = Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL);
    transaction.add(
      web3.SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: new web3.PublicKey(FEE_COLLECTOR_ADDRESS),
        lamports: feeLamports,
      })
    );

    // --- 6. توقيع وإرسال المعاملة ---
    const allSigners = [...signers, keypair];
    transaction.sign(...allSigners);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction(signature, 'confirmed');

    console.log(`🎉 [Staking] إيداع ناجح: ${signature}`);
    return {
      success: true,
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    };
  } catch (error) {
    console.error('❌ [Staking] فشل الإيداع:', error);
    return { success: false, error: error.message };
  }
}

// ==================== سحب سيولة ====================
export async function withdrawLiquidity(lpAmount) {
  console.log(`🚀 [Staking] بدء سحب: ${lpAmount} LP`);
  try {
    const keypair = await getKeypair();
    const connection = await getConnection();
    const userPubkey = keypair.publicKey;
    
    const raydium = await getRaydiumInstance();
    
    // الحصول على معلومات المجمع
    const poolInfo = await raydium.cpmm.getPoolInfo({ poolId: POOL_ID });
    if (!poolInfo) throw new Error('تعذر العثور على المجمع');
    
    // حساب كمية LP
    const lpAmountIn = Math.floor(lpAmount * 1e9);
    
    // بناء معاملة السحب
    const { transaction, signers } = await raydium.cpmm.removeLiquidity({
      poolInfo,
      lpAmount: new splToken.u64(lpAmountIn),
      slippage: 0.01,
      txVersion: 'V0',
    });
    
    // إضافة رسم الخدمة
    const feeLamports = Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL);
    transaction.add(
      web3.SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: new web3.PublicKey(FEE_COLLECTOR_ADDRESS),
        lamports: feeLamports,
      })
    );
    
    const allSigners = [...signers, keypair];
    transaction.sign(...allSigners);
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`🎉 [Staking] سحب ناجح: ${signature}`);
    return {
      success: true,
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    };
  } catch (error) {
    console.error('❌ [Staking] فشل السحب:', error);
    return { success: false, error: error.message };
  }
}
