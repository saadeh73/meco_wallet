import { Core } from '@walletconnect/core';
import { Web3Wallet } from '@walletconnect/web3wallet';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import i18n from '../i18n';
import { useAppStore } from '../store';
import * as web3 from '@solana/web3.js';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

const PROJECT_ID = '21dc279d9fb09e92a14421d4a189efec';

export let web3wallet;

// ─── جلب المفتاح الخاص ────────────────────────────────────────────────────────
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
    console.error('❌ Error getting keypair:', error);
    throw error;
  }
}

// ─── التهيئة ────────────────────────────────────────────────────────────────
export async function initWalletConnect() {
  try {
    if (web3wallet) return web3wallet;

    const core = new Core({ projectId: PROJECT_ID });
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

    web3wallet = await Web3Wallet.init({ core, metadata });
    setupEventListeners();
    return web3wallet;
  } catch (error) {
    console.log('⚠️ WalletConnect init error:', error.message);
  }
}

// ─── الاستماع للأحداث (هنا كان الخطأ وتم إصلاحه) ──────────────────────────────
function setupEventListeners() {
  if (!web3wallet) return;

  // 1. طلب الربط
  web3wallet.on('session_proposal', async (proposal) => {
    const { name, url } = proposal.params.proposer.metadata;
    Alert.alert(
      i18n.t('walletConnect.connection_request', 'طلب اتصال 🔗'),
      i18n.t('walletConnect.connection_request_message', `يرغب موقع "${name}" (${url}) في الاتصال بمحفظتك.`, { name, url }),
      [
        { text: i18n.t('walletConnect.reject', 'رفض'), onPress: () => rejectSession(proposal), style: 'cancel' },
        { text: i18n.t('walletConnect.approve', 'موافقة'), onPress: () => approveSession(proposal) },
      ]
    );
  });

  // 2. ✅ طلب التوقيع (تم إصلاحه ليوجه للمعالجة الحقيقية)
  web3wallet.on('session_request', async (event) => {
    const { topic, params, id } = event;
    const { request } = params;

    Alert.alert(
      i18n.t('walletConnect.sign_request', 'طلب توقيع ✍️'),
      i18n.t('walletConnect.sign_request_message', `الموقع يطلب توقيع معاملة.\nالنوع: ${request.method}`),
      [
        { text: i18n.t('walletConnect.reject', 'رفض'), onPress: () => handleRequestRejection(topic, id), style: 'cancel' },
        { text: i18n.t('walletConnect.approve', 'موافقة'), onPress: () => handleRequestApproval(event) },
      ]
    );
  });
}

// ─── الموافقة على الربط ────────────────────────────────────────────────────────
export async function approveSession(proposal) {
  try {
    const pubKey = useAppStore.getState().walletPublicKey;
    if (!pubKey) throw new Error('محفظة غير نشطة');

    const solanaAddress = `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${pubKey}`;
    const namespaces = buildApprovedNamespaces({
      proposal: proposal.params,
      supportedNamespaces: {
        solana: {
          chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
          // ✅ إضافة جميع أنواع التوقيع التي تطلبها المواقع
          methods: ['solana_signTransaction', 'solana_signMessage', 'solana_signAndSendTransaction'],
          events: [],
          accounts: [solanaAddress],
        },
      },
    });

    await web3wallet.approveSession({ id: proposal.id, namespaces });
    Alert.alert(i18n.t('success', 'نجاح'), i18n.t('walletConnect.connection_success_message', 'تم الاتصال بنجاح.'));
  } catch (error) {
    Alert.alert(i18n.t('error', 'خطأ'), 'فشل الاتصال.');
    await rejectSession(proposal);
  }
}

export async function rejectSession(proposal) {
  try {
    await web3wallet.rejectSession({ id: proposal.id, reason: getSdkError('USER_REJECTED') });
  } catch (e) {}
}

// ─── ✅ المعالجة الحقيقية للتوقيع (The Engine) ────────────────────────────────
async function handleRequestApproval(event) {
  const { topic, params, id } = event;
  const { request } = params;

  try {
    const keypair = await getWalletKeypair();
    let result;

    if (request.method === 'solana_signMessage') {
      const messageBytes = bs58.decode(request.params.message || request.params.pubkey);
      const signatureBytes = require('tweetnacl').sign.detached(messageBytes, keypair.secretKey);
      result = { signature: bs58.encode(signatureBytes) };
    } 
    
    else if (request.method === 'solana_signTransaction') {
      const transactionBuffer = Buffer.from(request.params.transaction, 'base64');
      let signedTransactionBase64;
      try {
        const versionedTx = web3.VersionedTransaction.deserialize(transactionBuffer);
        versionedTx.sign([keypair]);
        signedTransactionBase64 = Buffer.from(versionedTx.serialize()).toString('base64');
      } catch (e) {
        const legacyTx = web3.Transaction.from(transactionBuffer);
        legacyTx.partialSign(keypair);
        signedTransactionBase64 = legacyTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
      }
      result = { signature: signedTransactionBase64 };
    } 
    
    else if (request.method === 'solana_signAndSendTransaction') {
      const transactionBuffer = Buffer.from(request.params.transaction, 'base64');
      const connection = new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      let signature;
      try {
        const versionedTx = web3.VersionedTransaction.deserialize(transactionBuffer);
        versionedTx.sign([keypair]);
        signature = await connection.sendRawTransaction(versionedTx.serialize(), { skipPreflight: false });
      } catch (e) {
        const legacyTx = web3.Transaction.from(transactionBuffer);
        legacyTx.partialSign(keypair);
        const serializedTx = legacyTx.serialize({ requireAllSignatures: false });
        signature = await connection.sendRawTransaction(serializedTx, { skipPreflight: false });
      }
      result = { signature };
    } 
    
    else {
      throw new Error(`طريقة غير مدعومة: ${request.method}`);
    }

    // إرسال الرد للموقع ليكمل المعاملة
    await web3wallet.respondSessionRequest({
      topic,
      response: { id, jsonrpc: '2.0', result },
    });
    console.log(`✅ [WalletConnect] تم الرد بنجاح.`);

  } catch (error) {
    console.error('❌ [WalletConnect] خطأ:', error);
    Alert.alert(i18n.t('error', 'خطأ'), `فشل التوقيع: ${error.message}`);
    await handleRequestRejection(topic, id);
  }
}

async function handleRequestRejection(topic, id) {
  try {
    await web3wallet.respondSessionRequest({
      topic,
      response: { id, jsonrpc: '2.0', error: getSdkError('USER_REJECTED') },
    });
  } catch (e) {}
}

export async function pairWalletConnect(uri) {
  try {
    if (!web3wallet) await initWalletConnect();
    await web3wallet.core.pairing.pair({ uri });
  } catch (error) {
    Alert.alert(i18n.t('error'), 'فشل الربط.');
  }
}
