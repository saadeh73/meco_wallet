import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

export default function WalletScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore((state) => state.theme);

  const isDark = theme === 'dark';
  const bg = isDark ? '#000' : '#fff';
  const fg = isDark ? '#fff' : '#000';

  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const connection = new Connection(clusterApiUrl('mainnet-beta'));

  const loadWalletAddress = async () => {
    try {
      const storedAddress = await SecureStore.getItemAsync('wallet_public_key');
      if (storedAddress) {
        setWalletAddress(storedAddress);
        fetchBalance(storedAddress);
      }
    } catch (err) {
      console.log('Error loading wallet address:', err);
    }
  };

  const fetchBalance = async (address) => {
    try {
      const pubKey = new PublicKey(address);
      const lamports = await connection.getBalance(pubKey);
      const solBalance = lamports / 1e9;
      setBalance(solBalance.toFixed(4));
    } catch (err) {
      console.log('Error fetching balance:', err);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadWalletAddress();
    setRefreshing(false);
  };

  const copyToClipboard = () => {
    if (walletAddress) {
      Clipboard.setStringAsync(walletAddress);
      Alert.alert(t('copied'), t('wallet_address_copied'));
    }
  };

  useEffect(() => {
    handleRefresh();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: fg }]}>{t('balance')}</Text>
          {balance !== null && (
            <Text style={[styles.balanceValue, { color: fg }]}>
              {balance} SOL
            </Text>
          )}
        </View>

        {walletAddress ? (
          <>
            <Text style={[styles.address, { color: fg }]}>
              {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)}
            </Text>
            <TouchableOpacity onPress={copyToClipboard}>
              <Text style={styles.copy}>{t('copy_address')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={[styles.address, { color: fg }]}>...جاري التحميل</Text>
        )}

        <View style={styles.buttons}>
          <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Send')}>
            <Text style={styles.buttonText}>{t('send')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Receive')}>
            <Text style={styles.buttonText}>{t('receive')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Swap')}>
            <Text style={styles.buttonText}>{t('swap')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: 'bold' },
  balanceValue: {
    fontSize: 16,
    marginTop: 6,
    fontWeight: '600',
  },
  address: {
    textAlign: 'center',
    marginVertical: 8,
    fontSize: 14,
  },
  copy: {
    color: '#ff0000',
    textAlign: 'center',
    marginBottom: 20,
    textDecorationLine: 'underline',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#ff0000',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});
