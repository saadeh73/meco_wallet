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

const listeners = {};
export const WCEvents = {
  on:   (event, cb)   => { listeners[event] = cb; },
  off:  (event)       => { delete listeners[event]; },
  emit: (event, data) => { if (listeners[event]) listeners[event](data); },
};

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

async function parseTransactionDetails(method, params) {
  try {
    if (method === 'solana_signMessage') return { instructionCount: 0, programs: [] };
    const buffer     = Buffer.from(params.transaction, 'base64');
    const connection = await heliusService.getConnection();
    let   instructions = [];
    try {
      const vTx  = web3.VersionedTransaction.deserialize(buffer);
      const luts = await getLookupTables(vTx, connection);
      const msg  = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: luts });
      instructions = msg.instructions;
    } catch (_) {
      instructions = web3.Transaction.from(buffer).instructions;
    }
    const KNOWN = {
      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token',
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1gdS': 'AToken',
      '11111111111111111111111111111111':             'System',
      'ComputeBudget111111111111111111111111111111':  'Budget',
    };
    const programs = [...new Set(instructions.map(ix => {
      const pid = ix.programId?.toBase58?.();
      return KNOWN[pid] || (pid ? pid.slice(0,6)+'...' : '?');
    }))];
    return { instructionCount: instructions.length, programs };
  } catch (_) {
    return { instructionCount: 0, programs: [] };
  }
}

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
    const appName  = session?.peer?.metadata?.name       || 'dApp';
    const appUrl   = session?.peer?.metadata?.url        || '';
    const appIcon  = session?.peer?.metadata?.icons?.[0] || null;

    if (listeners['sign_request']) {
      const details = await parseTransactionDetails(request.method, request.params);
      WCEvents.emit('sign_request', {
        event,
        method: request.method,
        appName,
        appUrl,
        appIcon,
        details,
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

async function handleRequestApproval(event) {
  const { topic, params, id } = event;
  const { request }           = params;

  try {
    const keypair    = await getWalletKeypair();
    const connection = await heliusService.getConnection();
    let   result;

    if (request.method === 'solana_signMessage') {
      const messageBytes   = bs58.decode(request.params.message || request.params.pubkey);
      const signatureBytes = require('tweetnacl').sign.detached(messageBytes, keypair.secretKey);
      result = { signature: bs58.encode(signatureBytes) };
    }

    else if (request.method === 'solana_signTransaction') {
  const buffer = Buffer.from(request.params.transaction, 'base64');
  let signedBase64;

  try {
    const vTx          = web3.VersionedTransaction.deserialize(buffer);
    const lookupTables = await getLookupTables(vTx, connection);
    const msg          = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: lookupTables });
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    msg.recentBlockhash = blockhash;
    const rebuilt = new web3.VersionedTransaction(msg.compileToV0Message(lookupTables));
    rebuilt.sign([keypair]);
    signedBase64 = Buffer.from(rebuilt.serialize()).toString('base64');
  } catch (vErr) {
    if (vErr.message?.includes('Versioned') || vErr.message?.includes('deserialize')) {
      throw vErr;
    }
    const tx = web3.Transaction.from(buffer);
    tx.partialSign(keypair);
    signedBase64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
  }
  result = { transaction: signedBase64 };
}
    else if (request.method === 'solana_signAndSendTransaction') {
      const buffer = Buffer.from(request.params.transaction, 'base64');
      let signature;
      try {
        // ✅ Versioned أولاً دائماً
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
      } catch (vErr) {
        // ✅ Legacy فقط إذا لم يكن Versioned
        if (vErr.message?.includes('Versioned') || vErr.message?.includes('deserialize')) throw vErr;
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
