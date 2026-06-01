import { Core } from '@walletconnect/core';
import { Web3Wallet } from '@walletconnect/web3wallet';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import i18n from '../i18n';
import { useAppStore } from '../store';
import * as web3 from '@solana/web3.js';
import bs58 from 'bs58';
import { Buffer } from 'buffer'; // ضروري لفك تشفير المعاملات

const PROJECT_ID = '21dc279d9fb09e92a14421d4a189efec';

export let web3wallet;

// ─── Helper: استخراج المفتاح الخاص للعمليات ───────────────────────────────────
async function getWalletKeypair() {
  try {
    const activeIndex = useAppStore.getState().activeAccountIndex;
    let privateKeyStr = await SecureStore.getItemAsync(`wallet_private_key_${activeIndex}`);
    
    if (!privateKeyStr && activeIndex === 0) {
      privateKeyStr = await SecureStore.getItemAsync('wallet_private_key');
    }

    if (!privateKeyStr) throw new Error('المفتاح الخاص غير موجود');

    let secretKey;
    if (privateKeyStr.startsWith('[')) {
      secretKey = new Uint8Array(JSON.parse(privateKeyStr));
    } else {
      secretKey = bs58.decode(privateKeyStr);
    }
    return web3.Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('❌ Error getting keypair for WalletConnect:', error);
    throw error;
  }
}

// ─── تهيئة WalletConnect ──────────────────────────────────────────────────────
export async function initWalletConnect() {
  try {
    if (web3wallet) {
      console.log('ℹ️ WalletConnect is already initialized. Skipping...');
      return web3wallet;
    }

    const core = new Core({
      projectId: PROJECT_ID,
    });

    const metadata = {
      name: 'MECO Wallet', 
      description: 'The First Arab Crypto Wallet on Solana',
      url: 'https://monycoin.github.io/meco_wallet-app/', 
      icons: ['https://raw.githubusercontent.com/MonyCoin/meco_wallet/refs/heads/main/assets/logo.png'],
      redirect: {
        native: 'meco-wallet://',
        universal: 'https://monycoin.github.io/meco_wallet-app/', 
      },
    };

    web3wallet = await Web3Wallet.init({
      core,
      metadata,
    });

    console.log('✅ WalletConnect Service Initialized for Solana');
    setupEventListeners();

    return web3wallet;
  } catch (error) {
    console.log('⚠️ WalletConnect init error:', error.message);
  }
}

// ─── إعداد مستمعي الأحداث (Event Listeners) ──────────────────────────────────
function setupEventListeners() {
  if (!web3wallet) return;

  web3wallet.on('session_proposal', async (proposal) => {
    const { name, url } = proposal.params.proposer.metadata;

    Alert.alert(
      i18n.t('walletConnect.connection_request', 'طلب اتصال 🔗'),
      i18n.t('walletConnect.connection_request_message', `يرغب موقع "${name}" (${url}) في الاتصال بمحفظتك (Solana).`, { name, url }),
      [
        {
          text: i18n.t('walletConnect.reject', 'رفض'),
          onPress: () => rejectSession(proposal),
          style: 'cancel',
        },
        {
          text: i18n.t('walletConnect.approve', 'موافقة'),
          onPress: () => approveSession(proposal),
        },
      ]
    );
  });

  // ✅ التعديل الجوهري: معالجة طلبات التوقيع هنا وليس فقط عرض Alert
  web3wallet.on('session_request', async (event) => {
    const { topic, params, id } = event;
    const { request } = params;

    Alert.alert(
      i18n.t('walletConnect.sign_request', 'طلب توقيع ✍️'),
      i18n.t('walletConnect.sign_request_message', `الموقع يطلب منك توقيع معاملة. هل توافق؟\n\nنوع الطلب: ${request.method}`),
      [
        {
          text: i18n.t('walletConnect.reject', 'رفض'),
          onPress: () => handleRequestRejection(topic, id),
          style: 'cancel',
        },
        {
          text: i18n.t('walletConnect.approve', 'موافقة'),
          onPress: () => handleRequestApproval(event),
        },
      ]
    );
  });

  web3wallet.on('session_delete', () => {
    console.log('ℹ️ WalletConnect session deleted.');
  });
}

// ─── دوال التعامل مع الجلسات ──────────────────────────────────────────────────
export async function approveSession(proposal) {
  try {
    const pubKey = useAppStore.getState().walletPublicKey;
    if (!pubKey) {
      throw new Error('لم يتم العثور على محفظة نشطة للربط');
    }

    const solanaAddress = `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${pubKey}`;

    // ✅ يجب إضافة solana_signAndSendTransaction لكي تقبله المنصات الكبرى
    const namespaces = buildApprovedNamespaces({
      proposal: proposal.params,
      supportedNamespaces: {
        solana: {
          chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
          methods: ['solana_signTransaction', 'solana_signMessage', 'solana_signAndSendTransaction'],
          events: [],
          accounts: [solanaAddress],
        },
      },
    });

    await web3wallet.approveSession({
      id: proposal.id,
      namespaces,
    });

    Alert.alert(
      i18n.t('walletConnect.connection_success', 'نجاح ✅'),
      i18n.t('walletConnect.connection_success_message', 'تم الاتصال بالشبكة بنجاح. يمكنك الآن التفاعل مع الموقع.')
    );
  } catch (error) {
    console.log('Approve Session Error:', error);
    Alert.alert(i18n.t('error', 'خطأ'), i18n.t('walletConnect.connection_failed', 'فشل الاتصال بالموقع.'));
    await rejectSession(proposal);
  }
}

export async function rejectSession(proposal) {
  try {
    await web3wallet.rejectSession({
      id: proposal.id,
      reason: getSdkError('USER_REJECTED'),
    });
  } catch (error) {
    console.log('Reject Session Error:', error);
  }
}

// ─── ✅ دوال معالجة التوقيع الفعلي للمعاملات (هذا ما كان ينقصك) ─────────────────
async function handleRequestApproval(event) {
  const { topic, params, id } = event;
  const { request } = params;

  try {
    const keypair = await getWalletKeypair();
    let result;

    // 1. معالجة توقيع رسالة (Sign Message)
    if (request.method === 'solana_signMessage') {
      const messageToSign = request.params.message || request.params.pubkey; 
      const messageBytes = bs58.decode(messageToSign);
      const signatureBytes = require('tweetnacl').sign.detached(messageBytes, keypair.secretKey);
      result = { signature: bs58.encode(signatureBytes) };
    } 
    
    // 2. معالجة توقيع معاملة (Sign Transaction) -> هنا كانت المشكلة مع Orca
    else if (request.method === 'solana_signTransaction') {
      const transactionStr = request.params.transaction;
      const transactionBuffer = Buffer.from(transactionStr, 'base64');
      
      let signedTransactionBase64;

      try {
        // محاولة فك التشفير كمعاملة حديثة (VersionedTransaction) وهو ما تستخدمه Orca و Jupiter V6
        const versionedTx = web3.VersionedTransaction.deserialize(transactionBuffer);
        versionedTx.sign([keypair]);
        signedTransactionBase64 = Buffer.from(versionedTx.serialize()).toString('base64');
      } catch (e) {
        // إذا فشلت، نحاول فك التشفير كمعاملة تقليدية (Legacy Transaction)
        console.log('محاولة التوقيع كـ Legacy Transaction...');
        const legacyTx = web3.Transaction.from(transactionBuffer);
        legacyTx.partialSign(keypair);
        signedTransactionBase64 = legacyTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
      }

      result = { signature: signedTransactionBase64 };
    } 
    
    // 3. معالجة توقيع وإرسال المعاملة (Sign And Send Transaction)
    else if (request.method === 'solana_signAndSendTransaction') {
      const transactionStr = request.params.transaction;
      const transactionBuffer = Buffer.from(transactionStr, 'base64');
      const connection = new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      let signature;

      try {
        const versionedTx = web3.VersionedTransaction.deserialize(transactionBuffer);
        versionedTx.sign([keypair]);
        signature = await connection.sendRawTransaction(versionedTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
      } catch (e) {
        const legacyTx = web3.Transaction.from(transactionBuffer);
        legacyTx.partialSign(keypair);
        const serializedTx = legacyTx.serialize({ requireAllSignatures: false });
        signature = await connection.sendRawTransaction(serializedTx, { skipPreflight: false, preflightCommitment: 'confirmed' });
      }

      result = { signature: signature };
      console.log(`✅ [WalletConnect] تم الإرسال للبلوكشين: ${signature}`);
    } 
    else {
      throw new Error(`طريقة غير مدعومة: ${request.method}`);
    }

    // ✅ إرسال الرد بنجاح إلى الموقع (DApp) ليقوم هو بإكمال العملية
    await web3wallet.respondSessionRequest({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        result,
      },
    });

    console.log(`✅ [WalletConnect] تم الرد على طلب (${request.method}) بنجاح.`);

  } catch (error) {
    console.error('❌ [WalletConnect] خطأ أثناء التوقيع:', error);
    Alert.alert(i18n.t('error', 'خطأ'), `فشل التوقيع: ${error.message}`);
    await handleRequestRejection(topic, id);
  }
}

async function handleRequestRejection(topic, id) {
  try {
    await web3wallet.respondSessionRequest({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        error: getSdkError('USER_REJECTED'),
      },
    });
  } catch (error) {
    console.error('Error rejecting request:', error);
  }
}

// ─── دالة ربط الـ URI ────────────────────────────────────────────────────────
export async function pairWalletConnect(uri) {
  try {
    if (!web3wallet) {
      console.log('⚠️ WalletConnect غير مهيأ، جاري التهيئة...');
      await initWalletConnect();
    }

    console.log('🔄 جاري إرسال طلب الربط...');
    await web3wallet.core.pairing.pair({ uri });
  } catch (error) {
    console.log('❌ خطأ في عملية الربط (Pairing):', error.message);
    Alert.alert(
      i18n.t('walletConnect.pairing_error', 'خطأ في الربط'),
      i18n.t('walletConnect.pairing_error_message', 'فشل الربط، يرجى التأكد من صلاحية الكود.')
    );
  }
}
