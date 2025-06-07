import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import * as bip39 from 'bip39';
import * as SecureStore from 'expo-secure-store';
import { Keypair } from '@solana/web3.js';
import * as LocalAuthentication from 'expo-local-authentication';

export default function CreateWalletScreen({ navigation }) {
  const [mnemonic, setMnemonic] = useState('');
  const [keypair, setKeypair] = useState(null);

  const generateWallet = async () => {
    try {
      const words = bip39.generateMnemonic();
      setMnemonic(words);

      const seed = await bip39.mnemonicToSeed(words);
      const wallet = Keypair.fromSeed(seed.slice(0, 32));
      setKeypair(wallet);
    } catch (error) {
      console.log('❌ خطأ في توليد المحفظة:', error);
      Alert.alert('خطأ', 'فشل في توليد المحفظة');
    }
  };

  const confirmAndSave = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const supported = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !supported) {
        Alert.alert('❌ الجهاز لا يدعم البصمة');
        return;
      }

      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'تأكيد بالبصمة لحفظ المحفظة',
      });

      if (!auth.success) {
        Alert.alert('❌ فشل في التحقق بالبصمة');
        return;
      }

      await SecureStore.setItemAsync('wallet_mnemonic', mnemonic);
      await SecureStore.setItemAsync('wallet_private_key', Buffer.from(keypair.secretKey).toString('hex'));
      await SecureStore.setItemAsync('wallet_public_key', keypair.publicKey.toBase58());

      Alert.alert('✅ تم إنشاء المحفظة بنجاح');
      navigation.navigate('Wallet');
    } catch (error) {
      console.log('❌ خطأ في تأكيد المحفظة:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء الحفظ');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.button} onPress={generateWallet}>
        <Text style={styles.buttonText}>🔐 إنشاء محفظة جديدة</Text>
      </TouchableOpacity>

      {mnemonic ? (
        <>
          <View style={styles.mnemonicBox}>
            <Text style={styles.mnemonic}>{mnemonic}</Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={confirmAndSave}>
            <Text style={styles.buttonText}>✔️ لقد خزّنت الكلمات، متابعة</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow:1, justifyContent:'center', alignItems:'center', padding:20 },
  button: { backgroundColor:'#ff0000', padding:14, borderRadius:8, marginBottom:20 },
  buttonText: { color:'#fff', fontSize:16 },
  mnemonicBox: { backgroundColor:'#fff', padding:10, borderRadius:8, marginBottom:20 },
  mnemonic: { color:'#000', fontSize:16, textAlign:'center' }
});
