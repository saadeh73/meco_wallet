import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import bs58 from 'bs58';
import { getTokenBalance } from './heliusService';
import { default as heliusService } from './heliusService';

// ==================== الثوابت ====================
const MECO_MINT = '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const LP_MINT = 'HjqZw7miRz4e3dBaJaBwDGt11AruMaLEg1JreeZh7VY2';
const POOL_STATE = '5C3brMitqhxJL1bANW57dyRbcTQnKnduxDEAUfepYxzrB';
const CPMM_PROGRAM_ID = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';

const MECO_VAULT = new web3.PublicKey('6Bqk1A2zJjigJ4ShTJoZUDdyKBu1yJdfKVQEr8GCGmAm');
const USDT_VAULT = new web3.PublicKey('AXQiWBVfkzHsJ1bauiv7Ucni7UqGYcRRJU7ugQPKa4dX');
const FEE_COLLECTOR_ADDRESS = 'HXkEZSKictbSYan9ZxQGaHpFrbA4eLDyNtEDxVBkdFy6';
const SERVICE_FEE_SOL = 0.0005;

// ==================== دوال مساعدة ====================
async function getConnection() {
  try {
    return await heliusService.getConnection();
  } catch (error) {
    return new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }
}

function parseKeypair(privateKeyData) {
  if (!privateKeyData) throw new Error('المفتاح الخاص غير متوفر من الـ Store!');
  let secretKey;
  if (typeof privateKeyData === 'string' && privateKeyData.startsWith('[')) {
    secretKey = new Uint8Array(JSON.parse(privateKeyData));
  } else if (typeof privateKeyData === 'string') {
    secretKey = bs58.decode(privateKeyData);
  } else {
    secretKey = privateKeyData;
  }
  return web3.Keypair.fromSecretKey(secretKey);
}

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
  
  try {
    const mecoVaultInfo = await splToken.getAccount(connection, MECO_VAULT);
    mecoReserve = Number(mecoVaultInfo.amount) / 1e9;
    console.log('✅ [Staking] MECO Vault:', mecoReserve);
  } catch (e) {
    console.warn('⚠️ [Staking] فشل جلب MECO Vault:', e.message);
  }
  
  try {
    const usdtVaultInfo = await splToken.getAccount(connection, USDT_VAULT);
    usdtReserve = Number(usdtVaultInfo.amount) / 1e6;
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

// ==================== إيداع سيولة (التعليمة المصححة) ====================
export async function depositLiquidity(privateKeyFromStore, mecoAmount, usdtAmount) {
  console.log(`🚀 [Staking] بدء إيداع: ${mecoAmount} MECO + ${usdtAmount} USDT`);
  try {
    const keypair = parseKeypair(privateKeyFromStore);
    const connection = await getConnection();
    const userPubkey = keypair.publicKey;

    console.log("✅ [Wallet] عنوان المستخدم:", userPubkey.toString());

    const mecoMint = new web3.PublicKey(MECO_MINT);
    const usdtMint = new web3.PublicKey(USDT_MINT);
    const lpMint = new web3.PublicKey(LP_MINT);
    const poolState = new web3.PublicKey(POOL_STATE);
    const cpmmProgram = new web3.PublicKey(CPMM_PROGRAM_ID);

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
    }

    const lpMintInfo = await splToken.getMint(connection, lpMint);
    const lpSupply = Number(lpMintInfo.supply) / 1e9;
    
    // حساب تقديري بسيط للـ LP
    const estimatedLpAmount = Math.floor((mecoAmount / 1000) * lpSupply * 1e9); 

    const mecoRaw = Math.floor(mecoAmount * 1e9);
    const usdtRaw = Math.floor(usdtAmount * 1e6);

    // 1. إعداد بيانات التعليمات بالترتيب الصحيح: lp_token_amount, maximum_amount_in_0, maximum_amount_in_1
    const depositData = new Uint8Array(25);
    depositData[0] = 2; // Discriminator for deposit
    const dataView = new DataView(depositData.buffer);
    dataView.setBigUint64(1, BigInt(estimatedLpAmount), true);
    dataView.setBigUint64(9, BigInt(mecoRaw), true);
    dataView.setBigUint64(17, BigInt(usdtRaw), true);

    // 2. الحصول على observation PDA (ضروري جداً)
    const obsSeed = new Uint8Array([111, 98, 115, 101, 114, 118, 97, 116, 105, 111, 110]);
    const [observationState] = web3.PublicKey.findProgramAddressSync(
      [obsSeed, poolState.toBytes()],
      cpmmProgram
    );

    // 3. بناء تعليمة الإيداع بالترتيب الصحيح للحسابات
    const depositIx = new web3.TransactionInstruction({
      programId: cpmmProgram,
      keys: [
        // ✅ ترتيب الحسابات الصحيح لـ CPMM deposit
        { pubkey: userPubkey, isSigner: true, isWritable: false },        // 0. owner (signer)
        { pubkey: poolState, isSigner: false, isWritable: true },          // 1. poolId
        { pubkey: userLpAta, isSigner: false, isWritable: true },          // 2. userLpAccount
        { pubkey: userMecoAta, isSigner: false, isWritable: true },        // 3. userVaultA (token 0)
        { pubkey: userUsdtAta, isSigner: false, isWritable: true },        // 4. userVaultB (token 1)
        { pubkey: MECO_VAULT, isSigner: false, isWritable: true },         // 5. vaultA
        { pubkey: USDT_VAULT, isSigner: false, isWritable: true },         // 6. vaultB
        { pubkey: lpMint, isSigner: false, isWritable: true },             // 7. lpMint
        { pubkey: splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 8. token program
        { pubkey: observationState, isSigner: false, isWritable: false },  // 9. observationState (PDA)
      ],
      data: depositData,
    });

    const transaction = new web3.Transaction();
    
    // إضافة تعليمة حساب أولوية المعاملة (Compute Budget) لتجنب timeout
    transaction.add(
      web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })
    );
    
    transaction.add(depositIx);
    transaction.add(
      web3.SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: new web3.PublicKey(FEE_COLLECTOR_ADDRESS),
        lamports: Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL),
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

// ==================== سحب سيولة (باستخدام نفس المنطق المصحح) ====================
export async function withdrawLiquidity(lpAmount) {
  try {
    const privateKeyStr = await SecureStore.getItemAsync('wallet_private_key');
    if (!privateKeyStr) throw new Error('المفتاح الخاص غير موجود');
    const keypair = parseKeypair(privateKeyStr);
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
    
    // تعليمات الأولوية
    transaction.add(
      web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })
    );
    
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
      data: Buffer.from([0x03, ...new Uint8Array(new BigUint64Array([BigInt(Math.floor(lpAmount * 1e9))]).buffer)]),
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
