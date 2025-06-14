import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import bs58 from 'bs58';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

export default function CreateWalletScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  const generateWallet = () => {
    const mnemonic = bip39.generateMnemonic();
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const keypair = Keypair.fromSeed(seed.slice(0, 32));
    return {
      mnemonic,
      privateKey: bs58.encode(keypair.secretKey),
      publicKey: keypair.publicKey.toBase58(),
    };
  };

  const handleCreateWallet = async () => {
    try {
      console.log('🚀 بدء إنشاء المحفظة');
      const { mnemonic, privateKey, publicKey } = generateWallet();

      await SecureStore.setItemAsync('wallet_private_key', privateKey);
      await SecureStore.setItemAsync('wallet_public_key', publicKey);
      await SecureStore.setItemAsync('wallet_initialized', 'true');

      console.log('✅ تم إنشاء المحفظة');

      navigation.reset({
        index: 0,
        routes: [{ name: 'Backup', params: { mnemonic } }],
      });

    } catch (error) {
      console.log('❌ خطأ أثناء إنشاء المحفظة:', error);
      Alert.alert(t('error'), error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('create_wallet')}</Text>

      <TouchableOpacity style={styles.button} onPress={handleCreateWallet}>
        <Text style={styles.buttonText}>{t('create_wallet')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    color: '#ff0000',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#ff0000',
    padding: 15,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
});
