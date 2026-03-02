import { Core } from '@walletconnect/core';
import { Web3Wallet } from '@walletconnect/web3wallet';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

// المفتاح الجديد الخاص بك
const PROJECT_ID = '21dc279d9fb09e92a14421d4a189efec'; 

let web3wallet;

export async function initWalletConnect() {
  try {
    const core = new Core({
      projectId: PROJECT_ID,
    });

    const metadata = {
      name: 'meco wallet',
      description: 'The First Arab Crypto Wallet on Solana',
      url: 'https://monycoin.github.io/meco-token/',
      icons: ['https://raw.githubusercontent.com/MonyCoin/meco_wallet/refs/heads/main/assets/logo.png'],
      redirect: {
        native: 'meco://',
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

function setupEventListeners() {
  if (!web3wallet) return;

  web3wallet.on('session_proposal', async (proposal) => {
    const { name, url } = proposal.params.proposer.metadata;
    
    Alert.alert(
      'طلب اتصال 🔗',
      `يرغب موقع "${name}" (${url}) في الاتصال بمحفظتك (Solana).`,
      [
        { text: 'رفض', onPress: () => rejectSession(proposal.id), style: 'cancel' },
        { text: 'موافقة', onPress: () => approveSession(proposal.id) }
      ]
    );
  });

  web3wallet.on('session_request', async (event) => {
    // معالجة طلبات التوقيع الخاصة بسولانا
    Alert.alert('تنبيه', 'طلب توقيع على شبكة سولانا');
  });
}

// دالة الموافقة الصحيحة لشبكة SOLANA
export async function approveSession(proposalId) {
  try {
    const pubKey = await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKey) return;

    // العودة لإعدادات سولانا الأصلية
    const namespace = {
      methods: ['solana_signTransaction', 'solana_signMessage'],
      chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'], // Solana Mainnet
      events: [],
      accounts: [`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${pubKey}`]
    };

    await web3wallet.approveSession({
      id: proposalId,
      namespaces: {
        solana: namespace
      }
    });

    Alert.alert('نجاح', 'تم الاتصال بشبكة سولانا بنجاح ✅');
  } catch (error) {
    console.log('Approve Error:', error);
  }
}

export async function rejectSession(proposalId) {
  try {
    await web3wallet.rejectSession({
      id: proposalId,
      reason: {
        code: 5000,
        message: 'User rejected.'
      }
    });
  } catch (error) {
    console.log('Reject Error:', error);
  }
}
