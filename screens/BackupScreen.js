import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native'; // ✅ تمت إضافته

export default function BackupScreen({ route }) {
  const { mnemonic } = route.params;
  const words = mnemonic.split(' ');
  const { t } = useTranslation();
  const navigation = useNavigation(); // ✅ تمت إضافته

  const handleCopy = async () => {
    await Clipboard.setStringAsync(mnemonic);
    Alert.alert(t('copied'), t('wallet_address_copied'));
  };

  const handleProceed = async () => {
    try {
      const isAvailable = await LocalAuthentication.hasHardwareAsync();
      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

      if (!isAvailable || supported.length === 0) {
        Alert.alert(t('error'), 'جهازك لا يدعم المصادقة الحيوية');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'تأكيد الدخول إلى المحفظة',
        fallbackLabel: 'أدخل رمز الهاتف',
      });

      if (result.success) {
        navigation.replace('BottomTabs'); // ✅ تعديل فقط هذا السطر
      } else {
        Alert.alert(t('error'), 'فشل التحقق بالبصمة');
      }
    } catch (error) {
      Alert.alert(t('error'), 'حدث خطأ في التحقق بالبصمة');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('backup_phrase')}</Text>

      <View style={styles.wordsContainer}>
        {words.map((word, index) => (
          <View key={index} style={styles.wordBox}>
            <Text style={styles.wordIndex}>{index + 1}.</Text>
            <Text style={styles.word}>{word}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
        <Text style={styles.copyButtonText}>{t('copy_address')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.proceedButton} onPress={handleProceed}>
        <Text style={styles.proceedButtonText}>التالي</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    color: '#ff0000',
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 30,
  },
  wordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eee',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    margin: 5,
  },
  wordIndex: {
    fontWeight: 'bold',
    marginRight: 5,
  },
  word: {
    fontSize: 16,
  },
  copyButton: {
    backgroundColor: '#ff0000',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  copyButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
  proceedButton: {
    backgroundColor: '#000',
    padding: 15,
    borderRadius: 8,
  },
  proceedButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
});
