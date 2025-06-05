import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as CryptoJS from 'crypto-js';
import * as Google from 'expo-auth-session/providers/google';
import { downloadBackupFromDrive } from '../services/backupToDrive';

function ImportWalletScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: '763203847014-64gvrp0vdfqjdlsfvl5fs5laov29ojbj.apps.googleusercontent.com',
  });

  const handleImportWallet = async () => {
    if (!email || !password) {
      Alert.alert('خطأ', 'يرجى إدخال البريد وكلمة المرور');
      return;
    }

    try {
      console.log('🚀 بدء تسجيل الدخول');
      await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ تم تسجيل الدخول');

      // نحاول استرجاع المفتاح من AsyncStorage أولًا
      let encryptedKey = await AsyncStorage.getItem('wallet_private_key');
      const publicKey = await AsyncStorage.getItem('wallet_public_key');

      if (!encryptedKey) {
        console.log('🔍 لا يوجد مفتاح محلي، جاري محاولة تحميله من Google Drive');

        const result = await promptAsync();

        if (result.type !== 'success') {
          Alert.alert('فشل المصادقة', 'لم يتم تسجيل الدخول إلى Google Drive');
          return;
        }

        const accessToken = result.authentication.accessToken;
        encryptedKey = await downloadBackupFromDrive(accessToken);

        if (!encryptedKey) {
          Alert.alert('فشل', 'لا توجد نسخة احتياطية على Google Drive');
          return;
        }
      }

      // فك تشفير المفتاح
      const decryptedKey = CryptoJS.AES.decrypt(encryptedKey, password).toString(CryptoJS.enc.Utf8);

      if (!decryptedKey) {
        Alert.alert('خطأ', 'كلمة المرور خاطئة أو المفتاح غير صالح');
        return;
      }

      Alert.alert('تم', `✅ تم استيراد المحفظة:\n${publicKey || '✅ جاهزة'}`);
      navigation.navigate('Wallet');
    } catch (error) {
      console.log('❌ استيراد المحفظة - خطأ:', error);

      if (error.code === 'auth/invalid-credential') {
        Alert.alert(
          'خطأ في تسجيل الدخول',
          'كلمة المرور غير صحيحة. تأكد منها أو استخدم "هل نسيت كلمة المرور؟".'
        );
      } else {
        Alert.alert('خطأ', error.message || 'حدث خطأ أثناء الاستيراد');
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>استيراد محفظة</Text>

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

      <TouchableOpacity style={styles.button} onPress={handleImportWallet}>
        <Text style={styles.buttonText}>استيراد</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
        <Text style={styles.link}>هل نسيت كلمة المرور؟</Text>
      </TouchableOpacity>
    </View>
  );
}

export default ImportWalletScreen;

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
