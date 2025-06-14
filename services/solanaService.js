import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
} from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';
import base58 from 'bs58';

const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const PROJECT_WALLET_ADDRESS = 'JCqDixUpY9sEM3ZCKeh8zPr2H36YPeD8n5iixrAu7xxM';
const FEE_AMOUNT = 0.001;

export async function sendSol(recipientAddress, amount) {
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

  // Retrieve user's private key
  const privateKeyHex = await SecureStore.getItemAsync('wallet_private_key');
  if (!privateKeyHex) throw new Error('Private key not found');
  const fromKeypair = Keypair.fromSecretKey(Buffer.from(privateKeyHex, 'hex'));

  const fromPublicKey = fromKeypair.publicKey;
  const toPublicKey = new PublicKey(recipientAddress);
  const projectWallet = new PublicKey(PROJECT_WALLET_ADDRESS);

  const totalAmount = parseFloat(amount);
  if (isNaN(totalAmount) || totalAmount <= FEE_AMOUNT) {
    throw new Error('Amount too low after fees');
  }

  const amountAfterFee = (totalAmount - FEE_AMOUNT) * LAMPORTS_PER_SOL;
  const feeLamports = FEE_AMOUNT * LAMPORTS_PER_SOL;

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromPublicKey,
      toPubkey: toPublicKey,
      lamports: Math.floor(amountAfterFee),
    }),
    SystemProgram.transfer({
      fromPubkey: fromPublicKey,
      toPubkey: projectWallet,
      lamports: Math.floor(feeLamports),
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [fromKeypair]);
  return signature;
}
