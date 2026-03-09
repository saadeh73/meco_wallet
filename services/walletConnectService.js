import { Core } from '@walletconnect/core';
import { Web3Wallet } from '@walletconnect/web3wallet';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import i18n from '../i18n'; // استيراد i18n للترجمة

const PROJECT_ID = '21dc279d9fb09e92a14421d4a189efec';

export let web3wallet;

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
      i18n.t('walletConnect.connection_request'), // عنوان الطلب
      i18n.t('walletConnect.connection_request_message', { name, url }), // نص الطلب مع المتغيرات
      [
        {
          text: i18n.t('walletConnect.reject'),
          onPress: () => rejectSession(proposal.id),
          style: 'cancel',
        },
        {
          text: i18n.t('walletConnect.approve'),
          onPress: () => approveSession(proposal.id),
        },
      ]
    );
  });

  web3wallet.on('session_request', async (event) => {
    Alert.alert(
      i18n.t('walletConnect.sign_request'),
      i18n.t('walletConnect.sign_request_message')
    );
  });
}

export async function approveSession(proposalId) {
  try {
    const pubKey = await SecureStore.getItemAsync('wallet_public_key');
    if (!pubKey) return;

    const namespace = {
      methods: ['solana_signTransaction', 'solana_signMessage'],
      chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'], // Solana Mainnet
      events: [],
      accounts: [`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${pubKey}`],
    };

    await web3wallet.approveSession({
      id: proposalId,
      namespaces: {
        solana: namespace,
      },
    });

    Alert.alert(
      i18n.t('walletConnect.connection_success'),
      i18n.t('walletConnect.connection_success_message')
    );
  } catch (error) {
    console.log('Approve Error:', error);
    Alert.alert(i18n.t('error'), i18n.t('walletConnect.connection_failed'));
  }
}

export async function rejectSession(proposalId) {
  try {
    await web3wallet.rejectSession({
      id: proposalId,
      reason: {
        code: 5000,
        message: 'User rejected.',
      },
    });
  } catch (error) {
    console.log('Reject Error:', error);
  }
}

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
      i18n.t('walletConnect.pairing_error'),
      i18n.t('walletConnect.pairing_error_message')
    );
  }
}
