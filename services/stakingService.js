import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import * as SecureStore from 'expo-secure-store';
import bs58 from 'bs58';
import { getSolBalance, getTokenBalance } from './heliusService';
import { default as heliusService } from './heliusService';

// ==================== الثوابت ====================
const MECO_MINT = '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const LP_MINT = 'HjqZw7miRz4e3dBaJaBwDGt11AruMaLEg1JreeZh7VY2';
const POOL_STATE = '5C3brMitqhxJL1bANW57dyRbcTQnKnduxDEAUfepYxzrB';
const CPMM_PROGRAM_ID = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';

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

// ==================== استخراج حسابات المجمع ====================
async function getPoolAccounts() {
  const connection = await getConnection();
  const poolStatePubkey = new web3.PublicKey(POOL_STATE);
  
  const accountInfo = await connection.getAccountInfo(poolStatePubkey);
  if (!accountInfo) throw new Error('تعذر العثور على حساب المجمع');
  
  const data = accountInfo.data;
  
  // offsets لهيكل PoolState في CPMM
  const vaultAOffset = 8 + 1 + 32; // discriminator (8) + bump (1) + amm_config (32)
  const vaultBOffset = vaultAOffset + 32 + 8 + 8 + 32;
  
  const vaultA = new web3.PublicKey(data.slice(vaultAOffset, vaultAOffset + 32));
  const vaultB = new web3.PublicKey(data.slice(vaultBOffset, vaultBOffset + 32));
  
  const vaultAInfo = await splToken.getAccount(connection, vaultA);
  const vaultAMint = vaultAInfo.mint;
  
  let mecoVault, usdtVault;
  if (vaultAMint.toString() === MECO_MINT) {
    mecoVault = vaultA;
    usdtVault = vaultB;
  } else {
    mecoVault = vaultB;
    usdtVault = vaultA;
  }
  
  return {
    poolState: poolStatePubkey,
    lpMint: new web3.PublicKey(LP_MINT),
    mecoVault,
    usdtVault,
    cpmmProgram: new web3.PublicKey(CPMM_PROGRAM_ID),
  };
}

// ==================== جلب معلومات المجمع ====================
export async function getPoolInfo() {
  try {
    const connection = await getConnection();
    const accounts = await getPoolAccounts();
    
    const mecoVaultInfo = await splToken.getAccount(connection, accounts.mecoVault);
    const usdtVaultInfo = await splToken.getAccount(connection, accounts.usdtVault);
    
    const mecoReserve = Number(mecoVaultInfo.amount) / 1e9;
    const usdtReserve = Number(usdtVaultInfo.amount) / 1e6;
    
    // APY تقديري (يمكن تحسينه لاحقاً)
    const estimatedApy = 15.5;
    
    return {
      apy: estimatedApy,
      mecoReserve,
      usdtReserve,
      totalLiquidity: mecoReserve * (usdtReserve / mecoReserve) + usdtReserve,
    };
  } catch (error) {
    console.error('خطأ في جلب معلومات المجمع:', error);
    throw error;
  }
}

// ==================== جلب رصيد LP للمستخدم ====================
export async function getUserLPBalance() {
  try {
    const pubKeyStr = await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) return 0;
    
    const balance = await getTokenBalance(LP_MINT, true);
    return balance;
  } catch (error) {
    console.error('خطأ في جلب رصيد LP:', error);
    return 0;
  }
}

// ==================== إيداع سيولة ====================
export async function depositLiquidity(mecoAmount, usdtAmount) {
  try {
    const keypair = await getKeypair();
    const connection = await getConnection();
    const userPubkey = keypair.publicKey;
    
    const accounts = await getPoolAccounts();
    
    const mecoMint = new web3.PublicKey(MECO_MINT);
    const usdtMint = new web3.PublicKey(USDT_MINT);
    const lpMint = accounts.lpMint;
    
    const userMecoAta = await splToken.getAssociatedTokenAddress(mecoMint, userPubkey);
    const userUsdtAta = await splToken.getAssociatedTokenAddress(usdtMint, userPubkey);
    const userLpAta = await splToken.getAssociatedTokenAddress(lpMint, userPubkey);
    
    const transaction = new web3.Transaction();
    
    // إنشاء ATA لرمز LP إذا لم يكن موجوداً
    const lpAtaInfo = await connection.getAccountInfo(userLpAta);
    if (!lpAtaInfo) {
      transaction.add(
        splToken.createAssociatedTokenAccountInstruction(
          userPubkey,
          userLpAta,
          userPubkey,
          lpMint
        )
      );
    }
    
    // بناء تعليمة الإيداع
    const depositIx = new web3.TransactionInstruction({
      programId: accounts.cpmmProgram,
      keys: [
        { pubkey: userPubkey, isSigner: true, isWritable: false },
        { pubkey: accounts.poolState, isSigner: false, isWritable: true },
        { pubkey: userMecoAta, isSigner: false, isWritable: true },
        { pubkey: userUsdtAta, isSigner: false, isWritable: true },
        { pubkey: accounts.mecoVault, isSigner: false, isWritable: true },
        { pubkey: accounts.usdtVault, isSigner: false, isWritable: true },
        { pubkey: userLpAta, isSigner: false, isWritable: true },
        { pubkey: lpMint, isSigner: false, isWritable: true },
        { pubkey: splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([
        0x02, // deposit instruction discriminator
        ...new Uint8Array(new BigUint64Array([BigInt(Math.floor(mecoAmount * 1e9))]).buffer),
        ...new Uint8Array(new BigUint64Array([BigInt(Math.floor(usdtAmount * 1e6))]).buffer),
      ]),
    });
    
    transaction.add(depositIx);
    
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
    
    return {
      success: true,
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    };
  } catch (error) {
    console.error('خطأ في الإيداع:', error);
    return { success: false, error: error.message };
  }
}

// ==================== سحب سيولة ====================
export async function withdrawLiquidity(lpAmount) {
  try {
    const keypair = await getKeypair();
    const connection = await getConnection();
    const userPubkey = keypair.publicKey;
    
    const accounts = await getPoolAccounts();
    
    const mecoMint = new web3.PublicKey(MECO_MINT);
    const usdtMint = new web3.PublicKey(USDT_MINT);
    const lpMint = accounts.lpMint;
    
    const userMecoAta = await splToken.getAssociatedTokenAddress(mecoMint, userPubkey);
    const userUsdtAta = await splToken.getAssociatedTokenAddress(usdtMint, userPubkey);
    const userLpAta = await splToken.getAssociatedTokenAddress(lpMint, userPubkey);
    
    const transaction = new web3.Transaction();
    
    // بناء تعليمة السحب
    const withdrawIx = new web3.TransactionInstruction({
      programId: accounts.cpmmProgram,
      keys: [
        { pubkey: userPubkey, isSigner: true, isWritable: false },
        { pubkey: accounts.poolState, isSigner: false, isWritable: true },
        { pubkey: userLpAta, isSigner: false, isWritable: true },
        { pubkey: accounts.mecoVault, isSigner: false, isWritable: true },
        { pubkey: accounts.usdtVault, isSigner: false, isWritable: true },
        { pubkey: userMecoAta, isSigner: false, isWritable: true },
        { pubkey: userUsdtAta, isSigner: false, isWritable: true },
        { pubkey: lpMint, isSigner: false, isWritable: true },
        { pubkey: splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([
        0x03, // withdraw instruction discriminator
        ...new Uint8Array(new BigUint64Array([BigInt(Math.floor(lpAmount * 1e9))]).buffer),
      ]),
    });
    
    transaction.add(withdrawIx);
    
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
    
    return {
      success: true,
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    };
  } catch (error) {
    console.error('خطأ في السحب:', error);
    return { success: false, error: error.message };
  }
}
