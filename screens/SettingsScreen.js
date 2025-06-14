import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Linking from 'expo-linking';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();

  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const logout = useAppStore((state) => state.logout);

  const isDark = theme === 'dark';
  const bg = isDark ? '#000' : '#fff';
  const fg = isDark ? '#fff' : '#000';

  const handleLanguageToggle = () => {
    const newLang = language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    setLanguage(newLang);
  };

  const handleBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (compatible && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('confirm_send'),
      });

      Alert.alert(
        result.success ? t('success') : t('error'),
        result.success ? 'تم التحقق بنجاح' : 'فشل في التحقق'
      );
    } else {
      Alert.alert(t('error'), 'الجهاز لا يدعم المقاييس الحيوية');
    }
  };

  const handleSupport = () => {
    Linking.openURL('mailto:saadeh7380@gmail.com');
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('wallet_private_key');
      await AsyncStorage.removeItem('wallet_public_key');
      logout();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    } catch (error) {
      Alert.alert(t('error'), 'فشل في تسجيل الخروج');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: fg }]}>{t('settings')}</Text>

      <TouchableOpacity style={styles.button} onPress={handleLanguageToggle}>
        <Ionicons name="language-outline" size={20} color="#fff" style={styles.icon} />
        <Text style={styles.buttonText}>{t('change_language')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={toggleTheme}>
        <Ionicons name="color-palette-outline" size={20} color="#fff" style={styles.icon} />
        <Text style={styles.buttonText}>{t('toggle_theme')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={handleBiometrics}>
        <MaterialIcons name="fingerprint" size={20} color="#fff" style={styles.icon} />
        <Text style={styles.buttonText}>{t('biometric')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={handleSupport}>
        <Feather name="mail" size={20} color="#fff" style={styles.icon} />
        <Text style={styles.buttonText}>{t('contact_support')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#fff" style={styles.icon} />
        <Text style={styles.buttonText}>{t('logout')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#ff0000',
    padding: 15,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
});
