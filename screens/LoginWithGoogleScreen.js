import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useGoogleLogin } from '../services/googleLogin';
import { uploadBackupToDrive } from '../services/backupToDrive';

export default function LoginWithGoogleScreen({ navigation }) {
  const { request, promptAsync, response } = useGoogleLogin();

  const handleLogin = async () => {
    if (!request) {
      Alert.alert('خطأ', 'طلب الدخول غير جاهز بعد.');
      return;
    }

    const result = await promptAsync();
    if (result.type !== 'success') {
      Alert.alert('فشل', 'لم يتم تسجيل الدخول');
      return;
    }

    const accessToken = result.authentication.accessToken;

    if (accessToken) {
      await uploadBackupToDrive(accessToken);
      Alert.alert('نجاح', '✅ تم حفظ النسخة الاحتياطية في Google Drive');
      navigation.navigate('Wallet');
    } else {
      Alert.alert('فشل', 'لم يتم الحصول على صلاحية الوصول إلى Google Drive');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>تسجيل الدخول باستخدام Google</Text>
      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>تسجيل الدخول ورفع النسخة</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1b1b1b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: '#ff0000',
    fontSize: 22,
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#ff0000',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
});
