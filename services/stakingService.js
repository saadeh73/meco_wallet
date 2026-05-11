import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import bs58 from 'bs58';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { default as heliusService } from './heliusService';

// ==================== الثوابت والعناوين ====================
const MECO_MINT = '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i';
const FEE_COLLECTOR_ADDRESS = 'BkaJsFAJKPQZgreBFLrY2pPUi44fTJzXhmeBc8LeuF5W';
const STAKING_TREASURY = 'FoNBts4U25jm1YbZ3siT5hHzCmfuvrkzsRRJ4MWQkMQs'; 
const SERVICE_FEE_SOL = 0.0005;

// ==================== حماية بيانات التليجرام ====================
const ENCODED_BOT_TOKEN = "ODc0ODc5MDA4NDpBQUdzc3htZ1lxUzNOb3BMLXVfVEx3R3lJZEd1NlVOVWFRTQ==";
const ENCODED_CHAT_ID = "LTEwMDM5NjQ3MzM4Nzc=";

const getDecryptedSecret = (encodedStr) => {
  return Buffer.from(encodedStr, 'base64').toString('utf8');
};

// ==================== دوال مساعدة ====================
async function getConnection() {
  try {
    return await heliusService.getConnection();
  } catch (error) {
    return new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }
}

function parseKeypair(privateKeyData) {
  if (!privateKeyData) throw new Error('المفتاح الخاص غير متوفر!');
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

// ==================== إدارة بيانات التخزين محلياً ====================
export async function getUserStakingData(publicKey) {
  try {
    const dataStr = await AsyncStorage.getItem(`@staking_${publicKey}`);
    if (dataStr) {
      const data = JSON.parse(dataStr);
      const secondsElapsed = (Date.now() - data.lastStakeTime) / 1000;
      const yearInSeconds = 31536000;
      const earned = data.stakedAmount * (data.apy / 100) * (secondsElapsed / yearInSeconds);
      
      return { ...data, pendingRewards: earned };
    }
  } catch (e) {}
  return { stakedAmount: 0, pendingRewards: 0, apy: 0, plan: null, lastStakeTime: null };
}

async function saveUserStakingData(publicKey, stakedAmount, apy, plan) {
  const data = {
    stakedAmount,
    apy,
    plan,
    lastStakeTime: Date.now()
  };
  await AsyncStorage.setItem(`@staking_${publicKey}`, JSON.stringify(data));
}

// ==================== إيداع التخزين (Stake MECO) ====================
export async function stakeMeco(privateKeyFromStore, amount, apy, plan) {
  try {
    const keypair = parseKeypair(privateKeyFromStore);
    const connection = await getConnection();
    const userPubkey = keypair.publicKey;

    const mecoMint = new web3.PublicKey(MECO_MINT);
    const treasuryPubkey = new web3.PublicKey(STAKING_TREASURY);

    const userMecoAta = await splToken.getAssociatedTokenAddress(mecoMint, userPubkey);
    const treasuryMecoAta = await splToken.getAssociatedTokenAddress(mecoMint, treasuryPubkey);

    const transaction = new web3.Transaction();

    const treasuryAtaInfo = await connection.getAccountInfo(treasuryMecoAta);
    if (!treasuryAtaInfo) {
      transaction.add(
        splToken.createAssociatedTokenAccountInstruction(userPubkey, treasuryMecoAta, treasuryPubkey, mecoMint)
      );
    }

    const amountRaw = BigInt(Math.floor(amount * 1e9));

    transaction.add(
      splToken.createTransferInstruction(userMecoAta, treasuryMecoAta, userPubkey, amountRaw)
    );

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

    const signature = await web3.sendAndConfirmTransaction(connection, transaction, [keypair], { commitment: 'confirmed' });

    const currentData = await getUserStakingData(userPubkey.toString());
    const newTotal = currentData.stakedAmount + currentData.pendingRewards + amount; 
    
    await saveUserStakingData(userPubkey.toString(), newTotal, apy, plan);

    return { success: true, signature };
  } catch (error) {
    console.error('Staking Error:', error);
    
    const errorString = error.toString();
    if (errorString.includes('insufficient funds for rent') || errorString.includes('Transaction results in an account (0) with insufficient funds for rent')) {
      return { 
        success: false, 
        errorKey: 'errors.rentError'
      };
    }
    
    return { success: false, error: error.message };
  }
}

// ==================== سحب التخزين والمحاسبة الدقيقة (Unstake MECO) ====================
export async function unstakeMeco(privateKeyFromStore, amount) {
  try {
    const keypair = parseKeypair(privateKeyFromStore);
    const userPubkeyStr = keypair.publicKey.toString();
    
    const currentData = await getUserStakingData(userPubkeyStr);
    if (amount > currentData.stakedAmount) throw new Error("الكمية المطلوبة أكبر من المخزنة");

    const exactRewards = currentData.pendingRewards;
    const totalToSend = amount + exactRewards;

    const newTotal = currentData.stakedAmount - amount;
    await saveUserStakingData(userPubkeyStr, newTotal, currentData.apy, currentData.plan);

    const botToken = getDecryptedSecret(ENCODED_BOT_TOKEN);
    const chatId = getDecryptedSecret(ENCODED_CHAT_ID);

    const message = `
🚨 <b>طلب سحب جديد (MECO Staking)</b> 🚨

👤 <b>محفظة المستخدم:</b>
<code>${userPubkeyStr}</code>

📦 <b>أصل المبلغ المسحوب:</b> ${amount} MECO
🎁 <b>الأرباح المستحقة:</b> ${exactRewards.toFixed(6)} MECO
──────────────
💳 <b>إجمالي المطلوب إرساله:</b> <b>${totalToSend.toFixed(6)} MECO</b>

📊 <b>الخطة السابقة:</b> ${currentData.plan || 'مرن'}
⏱ <b>التوقيت:</b> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })}
`;

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        })
      });
    } catch (telegramError) {
      console.warn("⚠️ فشل إرسال إشعار تليجرام:", telegramError);
    }

    return { 
      success: true, 
      message: `تم تقديم طلب السحب. الإجمالي المستحق لك هو ${totalToSend.toFixed(4)} MECO سيتم تحويله لمحفظتك.` 
    };
  } catch (error) {
    console.error('Unstake Error:', error);
    
    const errorString = error.toString();
    if (errorString.includes('insufficient funds for rent') || errorString.includes('Transaction results in an account (0) with insufficient funds for rent')) {
      return { 
        success: false, 
        errorKey: 'errors.rentError'
      };
    }
    
    return { success: false, error: error.message };
  }
}
