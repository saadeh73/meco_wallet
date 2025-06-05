import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';

function CreateWalletScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [walletCreated, setWalletCreated] = useState(false);

  const generateWallet = async () => {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    const privateKey = Buffer.from(randomBytes).toString('hex');
    const publicKey = CryptoJS.SHA256(privateKey).toString(CryptoJS.enc.Hex).substring(0, 44);
    return { privateKey, publicKey };
  };

  const handleCreateWallet = async () => {
    if (!email || !password) {
      Alert.alert('خطأ', 'يرجى إدخال البريد وكلمة المرور');
      return;
    }

    try {
      console.log('🚀 بدء إنشاء المحفظة');
      await createUserWithEmailAndPassword(auth, email, password);
      console.log('✅ تم إنشاء المستخدم في Firebase');

      const { privateKey, publicKey } = await generateWallet();
      const encryptedKey = CryptoJS.AES.encrypt(privateKey, password).toString();

      await AsyncStorage.setItem('wallet_public_key', publicKey);
      await AsyncStorage.setItem('wallet_private_key', encryptedKey);

      Alert.alert('نجاح', `تم إنشاء المحفظة:\n${publicKey}`);
      setWalletCreated(true);
    } catch (error) {
      console.log('❌ خطأ أثناء إنشاء المحفظة:', error);

      if (error.code === 'auth/email-already-in-use') {
        Alert.alert(
          'الحساب موجود',
          'هذا البريد الإلكتروني مسجّل مسبقًا. يرجى استخدام "استيراد محفظة" لتسجيل الدخول أو إعادة المحاولة بكلمة مرور صحيحة.'
        );
      } else {
        Alert.alert('خطأ', error.message || 'حدث خطأ غير متوقع');
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>إنشاء محفظة جديدة</Text>

      <TextInput
        placeholder="البريد الإلكتروني"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />

      <TextInput
        placeholder="كلمة المرور"
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleCreateWallet}>
        <Text style={styles.buttonText}>إنشاء المحفظة</Text>
      </TouchableOpacity>

      {walletCreated && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#444' }]}
          onPress={() => navigation.navigate('LoginWithGoogle')}
        >
          <Text style={styles.buttonText}>📥 حفظ نسخة احتياطية على Google Drive</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
        <Text style={styles.link}>هل نسيت كلمة المرور؟</Text>
      </TouchableOpacity>
    </View>
  );
}

export default CreateWalletScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1b1b1b',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    color: '#ff0000',
    fontSize: 22,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#ff0000',
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
  link: {
    color: '#ff0000',
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: 10,
  },
});
