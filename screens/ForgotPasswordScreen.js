import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');

  const handleReset = async () => {
    if (!email) {
      Alert.alert('تنبيه', 'يرجى إدخال البريد الإلكتروني');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('تم الإرسال', 'تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.');
      navigation.goBack(); // يرجع للشاشة السابقة
    } catch (error) {
      console.log('خطأ في الإرسال:', error);
      Alert.alert('خطأ', error.message || 'فشل في إرسال الرابط');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>استعادة كلمة المرور</Text>
      <TextInput
        placeholder="البريد الإلكتروني"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <TouchableOpacity style={styles.button} onPress={handleReset}>
        <Text style={styles.buttonText}>إرسال رابط الاستعادة</Text>
      </TouchableOpacity>
    </View>
  );
}

export default ForgotPasswordScreen;

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
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
});
