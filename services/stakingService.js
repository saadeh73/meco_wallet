import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { getTokenBalance } from './heliusService';
import { default as heliusService } from './heliusService';

// ==================== الثوابت ====================
const MECO_MINT = '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const LP_MINT = 'HjqZw7miRz4e3dBaJaBwDGt11AruMaLEg1JreeZh7VY2';
const POOL_STATE = '5C3brMitqhxJL1bANW57dyRbcTQnKnduxDEAUfepYxzrB';
const CPMM_PROGRAM_ID = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';

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

    const mecoMint = new web3.PublicKey(MECO_MINT);
    const usdtMint = new web3.PublicKey(USDT_MINT);
    const lpMint = new web3.PublicKey(LP_MINT);
    const poolState = new web3.PublicKey(POOL_STATE);
    const cpmmProgram = new web3.PublicKey(CPMM_PROGRAM_ID);

    const userMecoAta = await splToken.getAssociatedTokenAddress(mecoMint, userPubkey);
    const userUsdtAta = await splToken.getAssociatedTokenAddress(usdtMint, userPubkey);
    const userLpAta = await splToken.getAssociatedTokenAddress(lpMint, userPubkey);

    // --- 1. إنشاء حساب LP ATA إذا لزم الأمر (كمعاملة منفصلة للتأكد) ---
    const lpAtaInfo = await connection.getAccountInfo(userLpAta);
    if (!lpAtaInfo) {
      console.log(`🆕 [Staking] إنشاء حساب LP ATA...`);
      const createAtaTx = new web3.Transaction().add(
        splToken.createAssociatedTokenAccountInstruction(
          userPubkey,
          userLpAta,
          userPubkey,
          lpMint
        )
      );
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      createAtaTx.recentBlockhash = latestBlockhash.blockhash;
      createAtaTx.feePayer = userPubkey;
      const sig = await web3.sendAndConfirmTransaction(connection, createAtaTx, [keypair], { commitment: 'confirmed' });
      console.log(`✅ [Staking] تم إنشاء LP ATA: ${sig}`);
    }

    // --- 2. جلب معلومات المجمع وإجمالي عرض LP ---
    const poolInfo = await getPoolInfo();
    const lpMintInfo = await splToken.getMint(connection, lpMint);
    const lpSupply = Number(lpMintInfo.supply) / 1e9; // LP decimals = 9
    console.log(`📊 [Staking] LP Supply: ${lpSupply}`);

    // --- 3. حساب كمية LP المتوقعة باستخدام الصيغة الصحيحة ---
    const shareMeco = mecoAmount / poolInfo.mecoReserve;
    const shareUsdt = usdtAmount / poolInfo.usdtReserve;
    const share = Math.min(shareMeco, shareUsdt);
    const estimatedLpAmount = Math.floor(share * lpSupply * 1e9);
    console.log(`📊 [Staking] estimatedLpAmount: ${estimatedLpAmount}`);

    // --- 4. بناء تعليمة الإيداع بالبيانات الصحيحة ---
    const dataBuffer = Buffer.alloc(24);
    dataBuffer.writeBigUInt64LE(BigInt(estimatedLpAmount), 0);
    dataBuffer.writeBigUInt64LE(BigInt(Math.floor(mecoAmount * 1e9)), 8);
    dataBuffer.writeBigUInt64LE(BigInt(Math.floor(usdtAmount * 1e6)), 16);
    const depositData = Buffer.concat([Buffer.from([0x02]), dataBuffer]);

    const depositIx = new web3.TransactionInstruction({
      programId: cpmmProgram,
      keys: [
        { pubkey: userPubkey, isSigner: true, isWritable: false },
        { pubkey: poolState, isSigner: false, isWritable: true },
        { pubkey: userMecoAta, isSigner: false, isWritable: true },
        { pubkey: userUsdtAta, isSigner: false, isWritable: true },
        { pubkey: MECO_VAULT, isSigner: false, isWritable: true },
        { pubkey: USDT_VAULT, isSigner: false, isWritable: true },
        { pubkey: userLpAta, isSigner: false, isWritable: true },
        { pubkey: lpMint, isSigner: false, isWritable: true },
        { pubkey: splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: depositData,
    });

    const transaction = new web3.Transaction().add(depositIx);

    // إضافة رسم الخدمة
    const feeLamports = Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL);
    transaction.add(
      web3.SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: new web3.PublicKey(FEE_COLLECTOR_ADDRESS),
        lamports: feeLamports,
      })
    );

    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = userPubkey;

    const signature = await web3.sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );

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
    
    const mecoMint = new web3.PublicKey(MECO_MINT);
    const usdtMint = new web3.PublicKey(USDT_MINT);
    const lpMint = new web3.PublicKey(LP_MINT);
    const poolState = new web3.PublicKey(POOL_STATE);
    const cpmmProgram = new web3.PublicKey(CPMM_PROGRAM_ID);
    
    const userMecoAta = await splToken.getAssociatedTokenAddress(mecoMint, userPubkey);
    const userUsdtAta = await splToken.getAssociatedTokenAddress(usdtMint, userPubkey);
    const userLpAta = await splToken.getAssociatedTokenAddress(lpMint, userPubkey);
    
    const transaction = new web3.Transaction();
    
    const withdrawIx = new web3.TransactionInstruction({
      programId: cpmmProgram,
      keys: [
        { pubkey: userPubkey, isSigner: true, isWritable: false },
        { pubkey: poolState, isSigner: false, isWritable: true },
        { pubkey: userLpAta, isSigner: false, isWritable: true },
        { pubkey: MECO_VAULT, isSigner: false, isWritable: true },
        { pubkey: USDT_VAULT, isSigner: false, isWritable: true },
        { pubkey: userMecoAta, isSigner: false, isWritable: true },
        { pubkey: userUsdtAta, isSigner: false, isWritable: true },
        { pubkey: lpMint, isSigner: false, isWritable: true },
        { pubkey: splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([
        0x03,
        ...new Uint8Array(new BigUint64Array([BigInt(Math.floor(lpAmount * 1e9))]).buffer),
      ]),
    });
    
    transaction.add(withdrawIx);
    
    const feeLamports = Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL);
    transaction.add(
      web3.SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: new web3.PublicKey(FEE_COLLECTOR_ADDRESS),
        lamports: feeLamports,
      })
    );
    
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = userPubkey;
    
    const signature = await web3.sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );
    
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
