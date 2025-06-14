import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import * as bip39 from 'bip39';
import * as SecureStore from 'expo-secure-store';
import { Keypair } from '@solana/web3.js';

export default function ImportWalletScreen({ navigation }) {
  const [mnemonic, setMnemonic] = useState('');

  const handleImport = async () => {
    try {
      if (!bip39.validateMnemonic(mnemonic)) {
        Alert.alert('❌ كلمات الاسترداد غير صالحة');
        return;
      }

      const seed = await bip39.mnemonicToSeed(mnemonic);
      const keypair = Keypair.fromSeed(seed.slice(0, 32));

      await SecureStore.setItemAsync('wallet_mnemonic', mnemonic);
      await SecureStore.setItemAsync('wallet_private_key', Buffer.from(keypair.secretKey).toString('hex'));
      await SecureStore.setItemAsync('wallet_public_key', keypair.publicKey.toBase58());

      Alert.alert('✅ تم استيراد المحفظة بنجاح');
      navigation.navigate('BottomTabs', { screen: 'Wallet' }); // ✅ تعديل التنقل الصحيح
    } catch (error) {
      console.error('❌ خطأ أثناء الاستيراد:', error);
      Alert.alert('خطأ', 'فشل في استيراد المحفظة');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>استيراد المحفظة</Text>
      <TextInput
        style={styles.input}
        placeholder="أدخل الكلمات الـ 12 مفصولة بمسافات"
        multiline
        numberOfLines={4}
        value={mnemonic}
        onChangeText={setMnemonic}
      />
      <TouchableOpacity style={styles.button} onPress={handleImport}>
        <Text style={styles.buttonText}>استيراد</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#ff0000' },
  input: { backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 20, textAlign: 'right' },
  button: { backgroundColor: '#ff0000', padding: 14, borderRadius: 8 },
  buttonText: { color: '#fff', textAlign: 'center', fontSize: 16 },
});
