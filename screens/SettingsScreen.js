import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAppStore } from '../store';
import * as Linking from 'expo-linking';
import * as LocalAuthentication from 'expo-local-authentication';

export default function SettingsScreen() {
  const { language, theme, setLanguage, toggleTheme } = useAppStore();

  const handleBiometricAuth = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      alert('الجهاز لا يدعم المقاييس الحيوية');
      return;
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      alert('لا توجد بصمة/وجه مسجلة على الجهاز');
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'تحقق من هويتك',
      fallbackLabel: 'استخدم رمز الدخول',
    });

    if (result.success) {
      alert('✅ تم التحقق بنجاح');
    } else {
      alert('❌ فشل التحقق');
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, theme === 'dark' ? styles.dark : styles.light]}>
      <Text style={[styles.header, theme === 'dark' ? styles.darkText : styles.lightText]}>الإعدادات</Text>

      <TouchableOpacity style={styles.settingItem} onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')}>
        <Text style={styles.settingText}>إعدادات اللغة: {language === 'ar' ? 'العربية' : 'English'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.settingItem} onPress={toggleTheme}>
        <Text style={styles.settingText}>النمط: {theme === 'dark' ? 'داكن' : 'فاتح'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.settingItem} onPress={handleBiometricAuth}>
        <Text style={styles.settingText}>الأمان والمقاييس الحيوية</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('mailto:saadeh7380@gmail.com')}>
        <Text style={styles.settingText}>الاتصال بالدعم</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton}>
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flexGrow: 1,
  },
  dark: {
    backgroundColor: '#1b1b1b',
  },
  light: {
    backgroundColor: '#fff',
  },
  darkText: {
    color: '#ff0000',
  },
  lightText: {
    color: '#cc0000',
  },
  header: {
    fontSize: 22,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  settingItem: {
    backgroundColor: '#2c2c2c',
    padding: 15,
    borderRadius: 8,
    marginBottom: 12,
  },
  settingText: {
    color: '#fff',
    fontSize: 16,
  },
  logoutButton: {
    borderColor: '#ff0000',
    borderWidth: 2,
    padding: 15,
    borderRadius: 8,
    marginTop: 40,
  },
  logoutText: {
    color: '#ff0000',
    fontSize: 16,
    textAlign: 'center',
  },
});
