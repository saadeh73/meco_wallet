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

const MECO_VAULT_ADDRESS = '6Bqk1A2zJjigJ4ShTJoZUDdyKBu1yJdfKVQEr8GCGmAm';
const USDT_VAULT_ADDRESS = 'AXQiWBVfkzHsJ1bauiv7Ucni7UqGYcRRJU7ugQPKa4dX';

const MECO_VAULT = new web3.PublicKey(MECO_VAULT_ADDRESS);
const USDT_VAULT = new web3.PublicKey(USDT_VAULT_ADDRESS);

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

// 🌟 [إصلاح جذري]: استخدام toBytes() بدلاً من toBuffer() المسببة للانهيار في الهواتف
function getATAAddress(mint, owner) {
  return web3.PublicKey.findProgramAddressSync(
    [owner.toBytes(), splToken.TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    splToken.ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

// ==================== جلب معلومات المجمع ====================
export async function getPoolInfo() {
  console.log('🔍 [Staking] بدء جلب معلومات المجمع...');
  const connection = await getConnection();
  
  let mecoReserve = 0;
  let usdtReserve = 0;
  
  // 🌟 [إصلاح MECO Vault]: طلب الرصيد مباشرة من RPC لتجاوز فشل مكتبة splToken
  try {
    const mecoBal = await connection.getTokenAccountBalance(MECO_VAULT);
    mecoReserve = mecoBal.value.uiAmount || 0;
    console.log('✅ [Staking] MECO Vault:', mecoReserve);
  } catch (e) {
    console.warn('⚠️ [Staking] فشل جلب MECO Vault:', e.message);
  }
  
  try {
    const usdtBal = await connection.getTokenAccountBalance(USDT_VAULT);
    usdtReserve = usdtBal.value.uiAmount || 0;
    console.log('✅ [Staking] USDT Vault:', usdtReserve);
  } catch (e) {
    console.warn('⚠️ [Staking] فشل جلب USDT Vault:', e.message);
  }
  
  const estimatedApy = 15.5;
  const totalLiquidity = (mecoReserve * (usdtReserve / (mecoReserve || 1))) + usdtReserve;
  
  const result = {
    apy: estimatedApy,
    mecoReserve,
    usdtReserve,
    totalLiquidity: isNaN(totalLiquidity) ? 0 : totalLiquidity,
  };
  console.log('📊 [Staking] نتيجة getPoolInfo:', result);
  return result;
}

// ==================== جلب رصيد LP للمستخدم ====================
export async function getUserLPBalance() {
  try {
    const pubKeyStr = await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKeyStr) return 0;
    return await getTokenBalance(LP_MINT, true);
  } catch (error) {
    return 0;
  }
}

// ==================== إيداع سيولة ====================
export async function depositLiquidity(mecoAmount, usdtAmount, slippageBps = 100) {
  console.log(`🚀 [Staking] بدء إيداع: ${mecoAmount} MECO + ${usdtAmount} USDT`);
  try {
    const keypair = await getKeypair();
    const connection = await getConnection();
    const userPubkey = keypair.publicKey;

    const mecoMint = new web3.PublicKey(MECO_MINT);
    const usdtMint = new web3.PublicKey(USDT_MINT);
    const lpMint = new web3.PublicKey(LP_MINT);
    const poolState = new web3.PublicKey(POOL_STATE);
    const cpmmProgram = new web3.PublicKey(CPMM_PROGRAM_ID);

    console.log('🔄 [Staking] جلب عناوين الحسابات (ATA)...');
    const userMecoAta = getATAAddress(mecoMint, userPubkey);
    const userUsdtAta = getATAAddress(usdtMint, userPubkey);
    const userLpAta = getATAAddress(lpMint, userPubkey);

    const lpAtaInfo = await connection.getAccountInfo(userLpAta);
    if (!lpAtaInfo) {
      console.log(`🆕 [Staking] إنشاء حساب LP ATA...`);
      const createAtaTx = new web3.Transaction().add(
        splToken.createAssociatedTokenAccountInstruction(userPubkey, userLpAta, userPubkey, lpMint)
      );
      const blockhash = await connection.getLatestBlockhash('confirmed');
      createAtaTx.recentBlockhash = blockhash.blockhash;
      createAtaTx.feePayer = userPubkey;
      await web3.sendAndConfirmTransaction(connection, createAtaTx, [keypair], { commitment: 'confirmed' });
      console.log(`✅ [Staking] تم إنشاء LP ATA`);
    }

    const poolInfo = await getPoolInfo();
    const lpMintInfo = await splToken.getMint(connection, lpMint);
    const lpSupply = Number(lpMintInfo.supply) / 1e9;

    const shareMeco = mecoAmount / (poolInfo.mecoReserve > 0 ? poolInfo.mecoReserve : 1);
    const shareUsdt = usdtAmount / (poolInfo.usdtReserve > 0 ? poolInfo.usdtReserve : 1);
    const share = Math.min(shareMeco, shareUsdt);
    const estimatedLpAmount = Math.floor((isNaN(share) ? 0 : share) * lpSupply * 1e9);
    console.log(`📊 [Staking] estimatedLpAmount: ${estimatedLpAmount}`);

    const mecoRaw = Math.floor(mecoAmount * 1e9);
    const usdtRaw = Math.floor(usdtAmount * 1e6);

    // 🌟 [إصلاح Buffer]: إنشاء البيانات (Data) باستخدام DataView وهي متوافقة 100% مع الهواتف الذكية!
    const depositData = new Uint8Array(25);
    depositData[0] = 2; // instruction discriminator (0x02)
    const dataView = new DataView(depositData.buffer);
    dataView.setBigUint64(1, BigInt(estimatedLpAmount), true);
    dataView.setBigUint64(9, BigInt(mecoRaw), true);
    dataView.setBigUint64(17, BigInt(usdtRaw), true);

    // 🌟 [إصلاح Buffer]: إنشاء مصفوفة يدوية لكلمة "observation" بدلاً من Buffer.from
    const obsSeed = new Uint8Array([111, 98, 115, 101, 114, 118, 97, 116, 105, 111, 110]);
    const [observationState] = web3.PublicKey.findProgramAddressSync(
      [obsSeed, poolState.toBytes()],
      cpmmProgram
    );

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
        { pubkey: observationState, isSigner: false, isWritable: false },
      ],
      data: depositData, // البيانات الجاهزة والنقية
    });

    const transaction = new web3.Transaction().add(depositIx);

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

    console.log('🚀 [Staking] جاري إرسال المعاملة للبلوكشين...');
    const signature = await web3.sendAndConfirmTransaction(connection, transaction, [keypair], { commitment: 'confirmed' });

    console.log(`🎉 [Staking] إيداع ناجح: ${signature}`);
    return { success: true, signature, explorerUrl: `https://solscan.io/tx/${signature}` };
  } catch (error) {
    console.error('❌ [Staking] فشل الإيداع:', error);
    return { success: false, error: error.message };
  }
}

// ==================== سحب سيولة ====================
export async function withdrawLiquidity(lpAmount) {
  try {
    const keypair = await getKeypair();
    const connection = await getConnection();
    const userPubkey = keypair.publicKey;
    
    const mecoMint = new web3.PublicKey(MECO_MINT);
    const usdtMint = new web3.PublicKey(USDT_MINT);
    const lpMint = new web3.PublicKey(LP_MINT);
    const poolState = new web3.PublicKey(POOL_STATE);
    const cpmmProgram = new web3.PublicKey(CPMM_PROGRAM_ID);
    
    const userMecoAta = getATAAddress(mecoMint, userPubkey);
    const userUsdtAta = getATAAddress(usdtMint, userPubkey);
    const userLpAta = getATAAddress(lpMint, userPubkey);
    
    const obsSeed = new Uint8Array([111, 98, 115, 101, 114, 118, 97, 116, 105, 111, 110]);
    const [observationState] = web3.PublicKey.findProgramAddressSync(
      [obsSeed, poolState.toBytes()],
      cpmmProgram
    );

    const transaction = new web3.Transaction();
    
    // 🌟 [إصلاح Buffer]: إنشاء البيانات للسحب بنقاء بدون Buffer
    const withdrawData = new Uint8Array(9);
    withdrawData[0] = 3; // instruction discriminator (0x03)
    const withdrawView = new DataView(withdrawData.buffer);
    withdrawView.setBigUint64(1, BigInt(Math.floor(lpAmount * 1e9)), true);
    
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
        { pubkey: observationState, isSigner: false, isWritable: false },
      ],
      data: withdrawData,
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
    
    const signature = await web3.sendAndConfirmTransaction(connection, transaction, [keypair], { commitment: 'confirmed' });
    
    return { success: true, signature, explorerUrl: `https://solscan.io/tx/${signature}` };
  } catch (error) {
    console.error('❌ [Staking] فشل السحب:', error);
    return { success: false, error: error.message };
  }
}
