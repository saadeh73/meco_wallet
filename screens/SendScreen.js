import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { logTransaction } from '../services/transactionLogger';

const connection = new Connection('https://api.mainnet-beta.solana.com');

export default function SendScreen() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const isDark = theme === 'dark';
  const bg = isDark ? '#000' : '#fff';
  const fg = isDark ? '#fff' : '#000';

  const handleSend = async () => {
    if (!recipient || !amount) {
      Alert.alert(t('error'), t('fill_fields'));
      return;
    }

    const numericAmount = parseFloat(amount);
    const fee = 0.001;

    if (isNaN(numericAmount) || numericAmount <= fee) {
      Alert.alert(t('error'), 'المبلغ غير كافٍ بعد خصم الرسوم');
      return;
    }

    try {
      const publicKeyStr = await SecureStore.getItemAsync('wallet_public_key');
      if (!publicKeyStr) {
        Alert.alert(t('error'), 'لم يتم العثور على عنوان المحفظة');
        return;
      }

      const publicKey = new PublicKey(publicKeyStr);
      const balanceLamports = await connection.getBalance(publicKey);
      const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

      if (numericAmount > balanceSol - fee) {
        Alert.alert(t('error'), 'الرصيد غير كافٍ لإتمام العملية بعد خصم الرسوم');
        return;
      }

      const amountAfterFee = (numericAmount - fee).toFixed(6);

      logTransaction({
        type: 'send',
        to: recipient,
        amount: amountAfterFee,
        fee,
        timestamp: new Date().toISOString(),
      });

      Alert.alert(
        t('success'),
        `${t('sent')} ${amountAfterFee} ${t('to')} ${recipient} (تم خصم ${fee} كرسوم)`
      );

      setRecipient('');
      setAmount('');
    } catch (err) {
      console.error('❌ فشل التحقق من الرصيد:', err);
      Alert.alert(t('error'), 'حدث خطأ أثناء التحقق من الرصيد');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: fg }]}>{t('send')}</Text>

      <TextInput
        style={[styles.input, { color: fg, borderColor: fg }]}
        placeholder={t('recipient_address')}
        placeholderTextColor="#888"
        value={recipient}
        onChangeText={setRecipient}
      />

      <TextInput
        style={[styles.input, { color: fg, borderColor: fg }]}
        placeholder={t('amount')}
        placeholderTextColor="#888"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
      />

      <TouchableOpacity style={styles.button} onPress={handleSend}>
        <Text style={styles.buttonText}>{t('confirm_send')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#ff0000',
    padding: 14,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', textAlign: 'center', fontSize: 16 },
});
