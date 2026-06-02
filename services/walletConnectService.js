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
import { default as heliusService } from './heliusService'; // ✅ إضافة

const PROJECT_ID = '21dc279d9fb09e92a14421d4a189efec';

export let web3wallet;

// ─── EventEmitter بسيط لإرسال أحداث التوقيع للشاشة ───────────────────────────
const listeners = {};
export const WCEvents = {
  on:   (event, cb) => { listeners[event] = cb; },
  off:  (event)     => { delete listeners[event]; },
  emit: (event, data) => { if (listeners[event]) listeners[event](data); },
};

// ─── جلب المفتاح الخاص للحساب النشط ──────────────────────────────────────────
async function getWalletKeypair() {
  try {
    const activeIndex  = useAppStore.getState().activeAccountIndex;
    let privateKeyStr  = await SecureStore.getItemAsync(`wallet_private_key_${activeIndex}`);
    if (!privateKeyStr && activeIndex === 0) {
      privateKeyStr = await SecureStore.getItemAsync('wallet_private_key');
    }
    if (!privateKeyStr) throw new Error('المفتاح الخاص غير موجود');
    const secretKey = privateKeyStr.startsWith('[')
      ? new Uint8Array(JSON.parse(privateKeyStr))
      : bs58.decode(privateKeyStr);
    return web3.Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('❌ Error getting keypair:', error);
    throw error;
  }
}

// ─── استخراج تفاصيل المعاملة للعرض في الـ Modal ──────────────────────────────
async function parseTransactionDetails(transactionBase64) {
  try {
    const buffer = Buffer.from(transactionBase64, 'base64');
    const connection = await heliusService.getConnection();
    let instructions = [];

    try {
      const vTx = web3.VersionedTransaction.deserialize(buffer);
      // جلب ALT لتفسير التعليمات بشكل صحيح
      const lookupTables = await Promise.all(
        vTx.message.addressTableLookups.map(async (lut) => {
          return (await connection.getAddressLookupTable(lut.accountKey)).value;
        })
      );
      const msg = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: lookupTables });
      instructions = msg.instructions;
    } catch (_) {
      const tx = web3.Transaction.from(buffer);
      instructions = tx.instructions;
    }

    return {
      instructionCount: instructions.length,
      programs: [...new Set(instructions.map(ix => ix.programId?.toBase58?.()?.slice(0, 8) + '...'))],
    };
  } catch (_) {
    return { instructionCount: 0, programs: [] };
  }
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

  // 1. طلب الربط
  web3wallet.on('session_proposal', async (proposal) => {
    const { name, url } = proposal.params.proposer.metadata;
    Alert.alert(
      i18n.t('walletConnect.connection_request'),
      i18n.t('walletConnect.connection_request_message', { name, url }),
      [
        { text: i18n.t('walletConnect.reject'), onPress: () => rejectSession(proposal), style: 'cancel' },
        { text: i18n.t('walletConnect.approve'), onPress: () => approveSession(proposal) },
      ]
    );
  });

  // 2. ✅ طلب التوقيع — يرسل الحدث للشاشة عبر WCEvents لعرض Modal تفصيلي
  web3wallet.on('session_request', async (event) => {
    const { topic, params, id } = event;
    const { request }           = params;
    const method                = request.method;

    // ── استخراج تفاصيل المعاملة قبل عرضها ───────────────────────────────────
    let details = { instructionCount: 0, programs: [] };
    if (method === 'solana_signTransaction' || method === 'solana_signAndSendTransaction') {
      details = await parseTransactionDetails(request.params.transaction);
    }

    // ── إرسال الحدث للشاشة لعرض Modal التفاصيل ──────────────────────────────
    WCEvents.emit('sign_request', {
      event,
      method,
      details,
      appName: web3wallet.getActiveSessions?.()[topic]?.peer?.metadata?.name || 'dApp',
      appUrl:  web3wallet.getActiveSessions?.()[topic]?.peer?.metadata?.url  || '',
      onApprove: () => handleRequestApproval(event),
      onReject:  () => handleRequestRejection(topic, id),
    });
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
    console.error('Approve Error:', error);
    Alert.alert(i18n.t('error'), i18n.t('walletConnect.connection_failed'));
    await rejectSession(proposal);
  }
}

export async function rejectSession(proposal) {
  try {
    await web3wallet.rejectSession({ id: proposal.id, reason: getSdkError('USER_REJECTED') });
  } catch (_) {}
}

// ─── ✅ التوقيع الحقيقي على المعاملة ─────────────────────────────────────────
async function handleRequestApproval(event) {
  const { topic, params, id } = event;
  const { request }           = params;

  try {
    const keypair    = await getWalletKeypair();
    const connection = await heliusService.getConnection(); // ✅ helius مع fallback
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
      try {
        // Versioned Transaction (الأحدث — Orca يستخدمها)
        const vTx = web3.VersionedTransaction.deserialize(buffer);
        const lookupTables = await Promise.all(
          vTx.message.addressTableLookups.map(async (lut) =>
            (await connection.getAddressLookupTable(lut.accountKey)).value
          )
        );
        const msg = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: lookupTables });
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        msg.recentBlockhash   = latestBlockhash.blockhash;
        const rebuiltTx = new web3.VersionedTransaction(msg.compileToV0Message(lookupTables));
        rebuiltTx.sign([keypair]);
        signedBase64 = Buffer.from(rebuiltTx.serialize()).toString('base64');
      } catch (_) {
        // Legacy Transaction (fallback)
        const tx = web3.Transaction.from(buffer);
        tx.partialSign(keypair);
        signedBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
      }
      result = { transaction: signedBase64 };
    }

    // ── توقيع وإرسال ─────────────────────────────────────────────────────────
    else if (request.method === 'solana_signAndSendTransaction') {
      const buffer = Buffer.from(request.params.transaction, 'base64');
      let signature;
      try {
        // Versioned Transaction
        const vTx = web3.VersionedTransaction.deserialize(buffer);
        const lookupTables = await Promise.all(
          vTx.message.addressTableLookups.map(async (lut) =>
            (await connection.getAddressLookupTable(lut.accountKey)).value
          )
        );
        const msg = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: lookupTables });
        const latestBlockhash = await connection.getLatestBlockhash('confirmed');
        msg.recentBlockhash   = latestBlockhash.blockhash;
        const rebuiltTx = new web3.VersionedTransaction(msg.compileToV0Message(lookupTables));
        rebuiltTx.sign([keypair]);
        signature = await connection.sendRawTransaction(rebuiltTx.serialize(), {
          skipPreflight:       false,
          preflightCommitment: 'confirmed',
        });
      } catch (_) {
        // Legacy Transaction fallback
        const tx = web3.Transaction.from(buffer);
        tx.partialSign(keypair);
        signature = await connection.sendRawTransaction(
          tx.serialize({ requireAllSignatures: false }),
          { skipPreflight: false }
        );
      }
      result = { signature };
    }

    else {
      throw new Error(`طريقة غير مدعومة: ${request.method}`);
    }

    // إرسال الرد لـ Orca/dApp
    await web3wallet.respondSessionRequest({
      topic,
      response: { id, jsonrpc: '2.0', result },
    });
    console.log('✅ [WalletConnect] تم التوقيع والرد بنجاح.');

  } catch (error) {
    console.error('❌ [WalletConnect]:', error.message);
    Alert.alert(i18n.t('error'), `فشل التوقيع: ${error.message}`);
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
