import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import bs58 from 'bs58';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { default as heliusService } from './heliusService';

// ==================== الثوابت ====================
const MECO_MINT = '7hBNyFfwYTv65z3ZudMAyKBw3BLMKxyKXsr5xM51Za4i';

// 💰 عنوان تحصيل الأرباح (رسوم التطبيق بالـ SOL)
const FEE_COLLECTOR_ADDRESS = 'FosXqkRpbRnvtn7D1995BYv4BFNgsTfXs8WXhVXCjQqZ';

// 🛑 عنوان خزينة التخزين (Staking) لاستقبال MECO المودع
const STAKING_TREASURY = '8aqoFLJeTUF6zsRGibMUZPkT7KAWjCm8wVS2BduDsnCH'; 

const SERVICE_FEE_SOL = 0.0005;

// ==================== إعدادات بوت التليجرام ====================
const TELEGRAM_BOT_TOKEN = "8748790084:AAGssxmgYqS3NopL-u_TLwGyIdGu6UNUaQM";
const CHAT_ID = "-1003964733877";

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
  console.log(`🚀 [Staking] بدء تخزين: ${amount} MECO (خطة ${plan})`);
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

    // إرسال MECO للخزينة
    transaction.add(
      splToken.createTransferInstruction(userMecoAta, treasuryMecoAta, userPubkey, amountRaw)
    );

    // إرسال رسوم الخدمة بالـ SOL
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

    const currentData = await getUserStakingData(userPubkey.toString());
    const newTotal = currentData.stakedAmount + amount;
    await saveUserStakingData(userPubkey.toString(), newTotal, apy, plan);

    console.log(`🎉 [Staking] تخزين ناجح: ${signature}`);
    return { success: true, signature };
  } catch (error) {
    console.error('❌ [Staking] فشل التخزين:', error);
    return { success: false, error: error.message };
  }
}

// ==================== سحب التخزين والإشعار (Unstake MECO) ====================
export async function unstakeMeco(privateKeyFromStore, amount) {
  try {
    const keypair = parseKeypair(privateKeyFromStore);
    const userPubkeyStr = keypair.publicKey.toString();
    
    const currentData = await getUserStakingData(userPubkeyStr);
    if (amount > currentData.stakedAmount) throw new Error("الكمية المطلوبة أكبر من المخزنة");

    const newTotal = currentData.stakedAmount - amount;
    await saveUserStakingData(userPubkeyStr, newTotal, currentData.apy, currentData.plan);

    // 🤖 الإرسال الفوري لغرفة العمليات عبر تليجرام
    const message = `
🚨 <b>طلب سحب جديد (MECO Staking)</b> 🚨

👤 <b>محفظة المستخدم:</b>
<code>${userPubkeyStr}</code>

💰 <b>الكمية المطلوبة:</b> <b>${amount} MECO</b>
📊 <b>من الباقة:</b> ${currentData.plan || 'غير محدد'}

⏱ <b>التوقيت:</b> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })}
`;

    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        })
      });
      console.log("✅ تم إرسال الإشعار لتليجرام بنجاح");
    } catch (telegramError) {
      console.warn("⚠️ فشل إرسال إشعار تليجرام:", telegramError);
    }

    return { 
      success: true, 
      message: "تم تقديم طلب السحب بنجاح. سيتم مراجعة الطلب وتحويل العملات إلى محفظتك خلال 24 ساعة من قبل الإدارة." 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
