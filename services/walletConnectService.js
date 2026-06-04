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
import { default as heliusService } from './heliusService';

const PROJECT_ID = '21dc279d9fb09e92a14421d4a189efec';
export let web3wallet;

// ✅ EventEmitter للـ Modal
const listeners = {};
export const WCEvents = {
  on:   (event, cb)   => { listeners[event] = cb; },
  off:  (event)       => { delete listeners[event]; },
  emit: (event, data) => { if (listeners[event]) listeners[event](data); },
};

// ─── فحص نوع المعاملة — Versioned أم Legacy ──────────────────────────────────
// ✅ إذا كان البايت الأول >= 0x80 فهي Versioned Transaction
const isVersionedBuffer = (buffer) => (buffer[0] & 0x80) !== 0;

// ─── جلب ALT ─────────────────────────────────────────────────────────────────
async function getLookupTables(vTx, connection) {
  if (!vTx.message.addressTableLookups?.length) return [];
  const tables = await Promise.all(
    vTx.message.addressTableLookups.map(async lut => {
      const result = await connection.getAddressLookupTable(lut.accountKey);
      return result.value;
    })
  );
  return tables.filter(Boolean);
}

// ─── جلب المفتاح الخاص للحساب النشط ──────────────────────────────────────────
async function getWalletKeypair() {
  const activeIndex = useAppStore.getState().activeAccountIndex;
  let privateKeyStr = await SecureStore.getItemAsync(`wallet_private_key_${activeIndex}`);
  if (!privateKeyStr && activeIndex === 0) {
    privateKeyStr = await SecureStore.getItemAsync('wallet_private_key');
  }
  if (!privateKeyStr) throw new Error('المفتاح الخاص غير موجود');
  const secretKey = privateKeyStr.startsWith('[')
    ? new Uint8Array(JSON.parse(privateKeyStr))
    : bs58.decode(privateKeyStr);
  return web3.Keypair.fromSecretKey(secretKey);
}

// ─── التهيئة ──────────────────────────────────────────────────────────────────
export async function initWalletConnect() {
  try {
    if (web3wallet) return web3wallet;
    const core     = new Core({ projectId: PROJECT_ID });
    const metadata = {
      name:        'MECO Wallet',
      description: 'The First Arab Crypto Wallet on Solana',
      url:         'https://monycoin.github.io/meco_wallet-app/',
      icons:       ['https://raw.githubusercontent.com/MonyCoin/meco_wallet/refs/heads/main/assets/logo.png'],
      redirect: {
        native:    'meco-wallet://',
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

// ─── الاستماع للأحداث ─────────────────────────────────────────────────────────
function setupEventListeners() {
  if (!web3wallet) return;

  web3wallet.on('session_proposal', async (proposal) => {
    const { name, url } = proposal.params.proposer.metadata;
    Alert.alert(
      i18n.t('walletConnect.connection_request'),
      i18n.t('walletConnect.connection_request_message', { name, url }),
      [
        { text: i18n.t('walletConnect.reject'),  onPress: () => rejectSession(proposal), style: 'cancel' },
        { text: i18n.t('walletConnect.approve'), onPress: () => approveSession(proposal) },
      ]
    );
  });

  web3wallet.on('session_request', async (event) => {
    const { topic, params, id } = event;
    const { request }           = params;
    const sessions = web3wallet.getActiveSessions?.() || {};
    const session  = sessions[topic];
    const appName  = session?.peer?.metadata?.name    || 'dApp';
    const appUrl   = session?.peer?.metadata?.url     || '';
    const appIcon  = session?.peer?.metadata?.icons?.[0] || null;

    if (listeners['sign_request']) {
      WCEvents.emit('sign_request', {
        event,
        method: request.method,
        appName,
        appUrl,
        appIcon,
        details: { instructionCount: 0, programs: [] },
        onApprove: () => handleRequestApproval(event),
        onReject:  () => handleRequestRejection(topic, id),
      });
    } else {
      Alert.alert(
        `${appName} — ${i18n.t('walletConnect.sign_request')}`,
        i18n.t('walletConnect.sign_request_message'),
        [
          { text: i18n.t('walletConnect.reject'),  onPress: () => handleRequestRejection(topic, id), style: 'cancel' },
          { text: i18n.t('walletConnect.approve'), onPress: () => handleRequestApproval(event) },
        ],
        { cancelable: false }
      );
    }
  });
}

// ─── الموافقة على الربط ───────────────────────────────────────────────────────
export async function approveSession(proposal) {
  try {
    const pubKey = useAppStore.getState().walletPublicKey;
    if (!pubKey) throw new Error('محفظة غير نشطة');

    const namespaces = buildApprovedNamespaces({
      proposal: proposal.params,
      supportedNamespaces: {
        solana: {
          chains:   ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
          methods:  ['solana_signTransaction', 'solana_signMessage', 'solana_signAndSendTransaction'],
          events:   [],
          accounts: [`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${pubKey}`],
        },
      },
    });

    await web3wallet.approveSession({ id: proposal.id, namespaces });
    Alert.alert(
      i18n.t('walletConnect.connection_success'),
      i18n.t('walletConnect.connection_success_message')
    );
  } catch (error) {
    console.error('approveSession error:', error);
    Alert.alert(i18n.t('error'), i18n.t('walletConnect.connection_failed'));
    await rejectSession(proposal);
  }
}

export async function rejectSession(proposal) {
  try {
    await web3wallet.rejectSession({ id: proposal.id, reason: getSdkError('USER_REJECTED') });
  } catch (_) {}
}

// ─── ✅ التوقيع الحقيقي مع فحص النوع مسبقاً ──────────────────────────────────
async function handleRequestApproval(event) {
  const { topic, params, id } = event;
  const { request }           = params;

  try {
    const keypair    = await getWalletKeypair();
    const connection = await heliusService.getConnection();
    let   result;

    // ── توقيع رسالة ──────────────────────────────────────────────────────────
    if (request.method === 'solana_signMessage') {
      const messageBytes   = bs58.decode(request.params.message || request.params.pubkey);
      const signatureBytes = require('tweetnacl').sign.detached(messageBytes, keypair.secretKey);
      result = { signature: bs58.encode(signatureBytes) };
    }

    // ── توقيع معاملة فقط ─────────────────────────────────────────────────────
    else if (request.method === 'solana_signTransaction') {
      const buffer = Buffer.from(request.params.transaction, 'base64');
      let signedBase64;

      if (isVersionedBuffer(buffer)) {
        // ✅ Versioned Transaction
        const vTx          = web3.VersionedTransaction.deserialize(buffer);
        const lookupTables = await getLookupTables(vTx, connection);
        const msg          = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: lookupTables });
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        msg.recentBlockhash = blockhash;
        const rebuilt = new web3.VersionedTransaction(msg.compileToV0Message(lookupTables));
        rebuilt.sign([keypair]);
        signedBase64 = Buffer.from(rebuilt.serialize()).toString('base64');
      } else {
        // ✅ Legacy Transaction
        const tx = web3.Transaction.from(buffer);
        tx.partialSign(keypair);
        signedBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
      }
      result = { transaction: signedBase64 };
    }

    // ── توقيع وإرسال للشبكة ──────────────────────────────────────────────────
    else if (request.method === 'solana_signAndSendTransaction') {
      const buffer = Buffer.from(request.params.transaction, 'base64');
      let signature;

      if (isVersionedBuffer(buffer)) {
        // ✅ Versioned Transaction — Orca يستخدم هذا دائماً
        const vTx          = web3.VersionedTransaction.deserialize(buffer);
        const lookupTables = await getLookupTables(vTx, connection);
        const msg          = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: lookupTables });
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        msg.recentBlockhash = blockhash;
        const rebuilt = new web3.VersionedTransaction(msg.compileToV0Message(lookupTables));
        rebuilt.sign([keypair]);
        signature = await connection.sendRawTransaction(rebuilt.serialize(), {
          skipPreflight:       false,
          preflightCommitment: 'confirmed',
        });
      } else {
        // ✅ Legacy Transaction
        const tx = web3.Transaction.from(buffer);
        tx.partialSign(keypair);
        signature = await connection.sendRawTransaction(
          tx.serialize({ requireAllSignatures: false }),
          { skipPreflight: false }
        );
      }

      await connection.confirmTransaction(signature, 'confirmed');
      result = { signature };
    }

    else {
      throw new Error(`طريقة غير مدعومة: ${request.method}`);
    }

    await web3wallet.respondSessionRequest({
      topic,
      response: { id, jsonrpc: '2.0', result },
    });
    console.log('✅ [WalletConnect] تم التوقيع:', request.method);

  } catch (error) {
    console.error('❌ [WalletConnect]:', error.message);
    Alert.alert(i18n.t('error'), `${i18n.t('walletConnect.sign_failed')}: ${error.message}`);
    await handleRequestRejection(topic, id);
  }
}

async function handleRequestRejection(topic, id) {
  try {
    await web3wallet.respondSessionRequest({
      topic,
      response: { id, jsonrpc: '2.0', error: getSdkError('USER_REJECTED') },
    });
  } catch (_) {}
}

// ─── الربط عبر QR ─────────────────────────────────────────────────────────────
export async function pairWalletConnect(uri) {
  try {
    if (!web3wallet) await initWalletConnect();
    await web3wallet.core.pairing.pair({ uri });
  } catch (error) {
    console.error('❌ Pairing error:', error.message);
    Alert.alert(
      i18n.t('walletConnect.pairing_error'),
      i18n.t('walletConnect.pairing_error_message')
    );
  }
}
