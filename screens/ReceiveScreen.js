import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg'; // ✅ تم الاستدعاء

export default function ReceiveScreen() {
  const { theme } = useAppStore();
  const { t } = useTranslation();
  const [walletAddress, setWalletAddress] = useState('');

  const isDark = theme === 'dark';
  const bg = isDark ? '#000' : '#fff';
  const fg = isDark ? '#fff' : '#000';

  const loadWalletAddress = async () => {
    try {
      const address = await SecureStore.getItemAsync('wallet_public_key');
      if (address) setWalletAddress(address);
    } catch (err) {
      console.log('❌ خطأ في تحميل عنوان المحفظة:', err);
    }
  };

  const copyToClipboard = () => {
    if (walletAddress) {
      Clipboard.setStringAsync(walletAddress);
      Alert.alert(t('copied'), t('wallet_address_copied'));
    }
  };

  useEffect(() => {
    loadWalletAddress();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: fg }]}>{t('receive')}</Text>

      {/* ✅ رمز الاستلام QR */}
      {walletAddress ? (
        <View style={styles.qrContainer}>
          <QRCode value={walletAddress} size={180} backgroundColor={bg} color={fg} />
        </View>
      ) : null}

      <Text style={[styles.address, { color: fg }]}>
        {walletAddress || '...جارٍ التحميل'}
      </Text>

      <TouchableOpacity onPress={copyToClipboard}>
        <Text style={styles.copy}>{t('copy_address')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  qrContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  address: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 20,
  },
  copy: {
    color: '#ff0000',
    textAlign: 'center',
    textDecorationLine: 'underline',
    fontSize: 16,
  },
});
