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

// ─── جلب المفتاح الخاص للحساب النشط ──────────────────────────────────────────
async function getWalletKeypair() {
  try {
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
  } catch (error) {
    console.error('❌ getWalletKeypair:', error);
    throw error;
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

  // ── طلب الربط ────────────────────────────────────────────────────────────
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

  // ── طلب التوقيع — Alert مباشر يستدعي التوقيع الحقيقي ────────────────────
  web3wallet.on('session_request', async (event) => {
    const { topic, params, id } = event;
    const { request }           = params;
    const method                = request.method;

    // جلب اسم التطبيق من الجلسة النشطة
    const sessions = web3wallet.getActiveSessions?.() || {};
    const appName  = sessions[topic]?.peer?.metadata?.name || 'dApp';

    // ✅ Alert مباشر — لا يعتمد على أي listener خارجي
    Alert.alert(
      `${appName} — ${i18n.t('walletConnect.sign_request')}`,
      i18n.t('walletConnect.sign_request_message'),
      [
        {
          text: i18n.t('walletConnect.reject'),
          onPress: () => handleRequestRejection(topic, id),
          style: 'cancel',
        },
        {
          text: i18n.t('walletConnect.approve'),
          onPress: () => handleRequestApproval(event),
        },
      ],
      { cancelable: false } // ✅ لا يُغلق بالضغط خارجه
    );
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

// ─── التوقيع الحقيقي ─────────────────────────────────────────────────────────
async function handleRequestApproval(event) {
  const { topic, params, id } = event;
  const { request }           = params;

  try {
    const keypair    = await getWalletKeypair();
    const connection = await heliusService.getConnection();
    let   result;

    // ── توقيع رسالة ──────────────────────────────────────────────────────
    if (request.method === 'solana_signMessage') {
      const messageBytes   = bs58.decode(request.params.message || request.params.pubkey);
      const signatureBytes = require('tweetnacl').sign.detached(messageBytes, keypair.secretKey);
      result = { signature: bs58.encode(signatureBytes) };
    }

    // ── توقيع معاملة فقط ─────────────────────────────────────────────────
    else if (request.method === 'solana_signTransaction') {
      const buffer = Buffer.from(request.params.transaction, 'base64');
      let signedBase64;
      try {
        // Versioned + ALT
        const vTx = web3.VersionedTransaction.deserialize(buffer);
        const lookupTables = await Promise.all(
          vTx.message.addressTableLookups.map(async lut =>
            (await connection.getAddressLookupTable(lut.accountKey)).value
          )
        );
        const msg = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: lookupTables });
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        msg.recentBlockhash = blockhash;
        const rebuilt = new web3.VersionedTransaction(msg.compileToV0Message(lookupTables));
        rebuilt.sign([keypair]);
        signedBase64 = Buffer.from(rebuilt.serialize()).toString('base64');
      } catch (_) {
        // Legacy fallback
        const tx = web3.Transaction.from(buffer);
        tx.partialSign(keypair);
        signedBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
      }
      result = { transaction: signedBase64 };
    }

    // ── توقيع وإرسال ─────────────────────────────────────────────────────
    else if (request.method === 'solana_signAndSendTransaction') {
      const buffer = Buffer.from(request.params.transaction, 'base64');
      let signature;
      try {
        // Versioned + ALT
        const vTx = web3.VersionedTransaction.deserialize(buffer);
        const lookupTables = await Promise.all(
          vTx.message.addressTableLookups.map(async lut =>
            (await connection.getAddressLookupTable(lut.accountKey)).value
          )
        );
        const msg = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: lookupTables });
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        msg.recentBlockhash = blockhash;
        const rebuilt = new web3.VersionedTransaction(msg.compileToV0Message(lookupTables));
        rebuilt.sign([keypair]);
        signature = await connection.sendRawTransaction(rebuilt.serialize(), {
          skipPreflight:       false,
          preflightCommitment: 'confirmed',
        });
        // انتظار التأكيد
        await connection.confirmTransaction(signature, 'confirmed');
      } catch (_) {
        // Legacy fallback
        const tx = web3.Transaction.from(buffer);
        tx.partialSign(keypair);
        signature = await connection.sendRawTransaction(
          tx.serialize({ requireAllSignatures: false }),
          { skipPreflight: false }
        );
        await connection.confirmTransaction(signature, 'confirmed');
      }
      result = { signature };
    }

    else {
      throw new Error(`طريقة غير مدعومة: ${request.method}`);
    }

    // ✅ إرسال الرد لـ dApp
    await web3wallet.respondSessionRequest({
      topic,
      response: { id, jsonrpc: '2.0', result },
    });
    console.log('✅ [WalletConnect] تم التوقيع بنجاح:', request.method);

  } catch (error) {
    console.error('❌ [WalletConnect]:', error.message);
    Alert.alert(i18n.t('error'), `${i18n.t('walletConnect.sign_failed')}: ${error.message}`);
    await handleRequestRejection(topic, id);
  }
}

// ─── رفض المعاملة ─────────────────────────────────────────────────────────────
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
