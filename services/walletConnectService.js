import { Core } from '@walletconnect/core';
import { Web3Wallet } from '@walletconnect/web3wallet';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import i18n from '../i18n';
import { useAppStore } from '../store';
import * as web3 from '@solana/web3.js';
import { getAssociatedTokenAddress, AccountLayout, getMint } from '@solana/spl-token';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { default as heliusService } from './heliusService';

const PROJECT_ID = '21dc279d9fb09e92a14421d4a189efec';
const WHIRLPOOL_PROGRAM_ID = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
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

// ✅ Anchor instruction discriminators لبرنامج Orca Whirlpool
// كل قيمة = أول 8 بايت من sha256("global:<اسم التعليمة بصيغة snake_case>")
// دي نفس آلية الـ sighash القياسية اللي بيستخدمها Anchor لكل برامجه، محسوبة يدويًا هنا
// بدل ما نضيف مكتبة IDL/anchor كاملة عشان تعليمة واحدة بس محتاجينها: تحديد نوع العملية
const WHIRLPOOL_DISCRIMINATORS = {
  '87802f4d0f98f031': 'open_position',        // open_position
  'f21d86303a6e0e3c': 'open_position',        // open_position_with_metadata
  'd42f5f5c726683fa': 'open_position',        // open_position_with_token_extensions
  '2e9cf3760dcdfbb2': 'add_liquidity',        // increase_liquidity
  '851d59df45eeb00a': 'add_liquidity',        // increase_liquidity_v2
  'a026d06f685b2c01': 'remove_liquidity',     // decrease_liquidity
  '3a7fbc3e4f52c460': 'remove_liquidity',     // decrease_liquidity_v2
  'a498cf631eba13b6': 'collect_fees',         // collect_fees
  'cf755fbfe5b4e20f': 'collect_fees',         // collect_fees_v2
  '4605845756ebb122': 'collect_reward',       // collect_reward
  'b16b25b4a01331d1': 'collect_reward',       // collect_reward_v2
  '7b86510031446262': 'close_position',       // close_position
  'f8c69e91e17587c8': 'swap',                 // swap
  '2b04ed0b1ac91e62': 'swap',                 // swap_v2
  'c360ed6c44a2dbe6': 'swap',                 // two_hop_swap
  'ba8fd11dfe02c275': 'swap',                 // two_hop_swap_v2
  '5fb40aac54aee828': 'create_pool',          // initialize_pool
  'cf2d57f21b3fcc43': 'create_pool',          // initialize_pool_v2
};

// لو المعاملة فيها أكتر من تعليمة Whirlpool، دي أولوية العرض (الأهم للمستخدم يعرفه الأول)
const OPERATION_PRIORITY = [
  'create_pool', 'open_position', 'close_position',
  'add_liquidity', 'remove_liquidity',
  'collect_fees', 'collect_reward', 'swap',
];

// ✅ بيدور على تعليمات Orca Whirlpool جوه المعاملة ويرجع نوع العملية الرئيسي (أو null لو مفيش)
function detectWhirlpoolOperation(instructions) {
  const found = new Set();
  for (const ix of instructions) {
    const pid = ix.programId?.toBase58?.();
    if (pid !== WHIRLPOOL_PROGRAM_ID) continue;
    const data = ix.data;
    if (!data || data.length < 8) continue;
    const disc = Buffer.from(data).slice(0, 8).toString('hex');
    const type = WHIRLPOOL_DISCRIMINATORS[disc];
    if (type) found.add(type);
  }
  if (found.size === 0) return null;
  const primary = OPERATION_PRIORITY.find(t => found.has(t)) || [...found][0];
  return { type: primary };
}

// ✅ نفس مجموعة العملات الأساسية المدعومة فعليًا فى SendScreen (SOL, USDC, USDT) + MECO
const KNOWN_TOKENS = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
  'A5Ln25cfww33kfUSzBb89bMha7j1PnFQTy7H3FsQHN7W': 'MECO',
};

// ✅ عدد الخانات العشرية بنجيبه من حساب الـ mint نفسه على السلسلة، مش بنخمنه —
// أي غلطة فى عدد الخانات بتخلي الرقم المعروض غلط بمضاعفات كاملة (×10, ×1000..)
// فمفيش داعي نخاطر ونثبّته يدويًا، والقيمة بتتخزن (cache) عشان منسألش عليها كل مرة
const decimalsCache = {};
async function getMintDecimals(connection, mint) {
  if (decimalsCache[mint] != null) return decimalsCache[mint];
  const info = await getMint(connection, new web3.PublicKey(mint));
  decimalsCache[mint] = info.decimals;
  return info.decimals;
}

// ✅ بيحسب الفرق الحقيقي (قبل/بعد) فى رصيد SOL + كل توكن معروف لصاحب المحفظة
// عن طريق محاكاة المعاملة (simulateTransaction) بدل ما نحاول نفك تشفير أرقام المبالغ
// من جوه بيانات التعليمة نفسها — لأن تعليمات زي collectFees أصلاً مالهاش "amount" كـ argument،
// المبلغ بيتحسب on-chain وقت التنفيذ، فمفيش طريقة نقرأه غير إننا نحاكي التنفيذ فعليًا
async function getBalanceChanges(connection, ownerPubkey, txForSim) {
  try {
    const owner = new web3.PublicKey(ownerPubkey);
    const mints = Object.keys(KNOWN_TOKENS);
    const atas  = await Promise.all(mints.map(m => getAssociatedTokenAddress(new web3.PublicKey(m), owner)));

    const [preSol, preInfos, decimalsList] = await Promise.all([
      connection.getBalance(owner),
      connection.getMultipleAccountsInfo(atas),
      Promise.all(mints.map(m => getMintDecimals(connection, m).catch(() => null))),
    ]);

    const sim = await connection.simulateTransaction(txForSim, {
      accounts: { encoding: 'base64', addresses: [owner.toBase58(), ...atas.map(a => a.toBase58())] },
      sigVerify: false,
    });
    if (sim.value.err || !sim.value.accounts) return null;

    const [postOwner, ...postTokenAccs] = sim.value.accounts;
    const changes = [];

    const solDelta = ((postOwner?.lamports ?? preSol) - preSol) / web3.LAMPORTS_PER_SOL;
    if (Math.abs(solDelta) > 0.000001) changes.push({ symbol: 'SOL', amount: solDelta });

    mints.forEach((mint, i) => {
      if (decimalsList[i] == null) return; // فشلنا نجيب decimals حقيقية — منعرضش رقم ممكن يكون غلط
      const preAmt  = preInfos[i] ? AccountLayout.decode(preInfos[i].data).amount : 0n;
      const postRaw = postTokenAccs[i]?.data?.[0];
      let    postAmt = preAmt;
      if (postRaw) {
        try { postAmt = AccountLayout.decode(Buffer.from(postRaw, 'base64')).amount; } catch (_) {}
      }
      const delta = postAmt - preAmt;
      if (delta !== 0n) changes.push({ symbol: KNOWN_TOKENS[mint], amount: Number(delta) / 10 ** decimalsList[i] });
    });

    return changes.length ? changes : null;
  } catch (e) {
    console.warn('⚠️ [getBalanceChanges] رجعنا للعرض العام:', e.message);
    return null; // أي فشل هنا يرجعنا تلقائيًا للعرض العام القديم، مش هيوقف التوقيع أبدًا
  }
}

// ✅ رسوم الشبكة الفعلية (مش تخمين) عن طريق getFeeForMessage القياسية فى web3.js
async function getNetworkFee(connection, message) {
  try {
    const { value } = await connection.getFeeForMessage(message, 'confirmed');
    return value != null ? value / web3.LAMPORTS_PER_SOL : null;
  } catch (_) {
    return null;
  }
}

async function parseTransactionDetails(method, params) {
  try {
    if (method === 'solana_signMessage') return { instructionCount: 0, programs: [], operation: null, estimatedFee: null };
    const buffer     = Buffer.from(params.transaction, 'base64');
    const connection = await heliusService.getConnection();
    let   instructions = [];
    let   txForSim, messageForFee;
    try {
      const vTx  = web3.VersionedTransaction.deserialize(buffer);
      const luts = await getLookupTables(vTx, connection);
      const msg  = web3.TransactionMessage.decompile(vTx.message, { addressLookupTableAccounts: luts });
      instructions  = msg.instructions;
      txForSim      = vTx;
      messageForFee = vTx.message;
    } catch (_) {
      const legacyTx = web3.Transaction.from(buffer);
      instructions   = legacyTx.instructions;
      txForSim        = legacyTx;
      messageForFee   = legacyTx.compileMessage();
    }
    const KNOWN = {
      [WHIRLPOOL_PROGRAM_ID]:                          'Orca Whirlpool',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token',
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1gdS': 'AToken',
      '11111111111111111111111111111111':             'System',
      'ComputeBudget111111111111111111111111111111':  'Budget',
    };
    const programs = [...new Set(instructions.map(ix => {
      const pid = ix.programId?.toBase58?.();
      return KNOWN[pid] || (pid ? pid.slice(0,6)+'...' : '?');
    }))];
    const operation = detectWhirlpoolOperation(instructions);

    // ✅ لو عرفنا نوع العملية (سيولة/رسوم..)، نجيب المبالغ الحقيقية + رسوم الشبكة
    let estimatedFee = null;
    if (operation) {
      const ownerPubkey = useAppStore.getState().walletPublicKey;
      const [changes, fee] = await Promise.all([
        ownerPubkey ? getBalanceChanges(connection, ownerPubkey, txForSim) : null,
        getNetworkFee(connection, messageForFee),
      ]);
      estimatedFee = fee;
      if (changes) {
        operation.summary = changes.map(c => ({
          label: c.amount < 0 ? i18n.t('walletConnect.amount_sent') : i18n.t('walletConnect.amount_received'),
          value: `${Math.abs(c.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${c.symbol}`,
        }));
      }
    }

    return { instructionCount: instructions.length, programs, operation, estimatedFee };
  } catch (_) {
    return { instructionCount: 0, programs: [], operation: null, estimatedFee: null };
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
      const { instructionCount, programs, operation, estimatedFee } = await parseTransactionDetails(request.method, request.params);
      WCEvents.emit('sign_request', {
        event,
        method: request.method,
        appName,
        appUrl,
        appIcon,
        details: { instructionCount, programs, estimatedFee },
        operation,
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
