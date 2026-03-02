import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  SafeAreaView 
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';

export default function BackupScreen() {
  const [mnemonic, setMnemonic] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const { t } = useTranslation();
  const navigation = useNavigation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  
  const isDark = theme === 'dark';
  
  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    warningBg: isDark ? '#2A1A1A' : '#FFF3CD',
    warningText: isDark ? '#FFB74D' : '#856404',
  };

  useEffect(() => {
    loadMnemonic();
    checkBiometric();
  }, []);

  const loadMnemonic = async () => {
    try {
      const storedMnemonic = await SecureStore.getItemAsync('wallet_mnemonic');
      if (storedMnemonic) {
        setMnemonic(storedMnemonic);
      } else {
        Alert.alert(t('error'), t('recovery_phrase_not_found'));
      }
    } catch (error) {
      Alert.alert(t('error'), t('load_recovery_phrase_error'));
    }
  };

  const checkBiometric = async () => {
    try {
      const isAvailable = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(isAvailable && isEnrolled);
    } catch (error) {
      console.error('Biometric check error:', error);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(mnemonic);
    Alert.alert(t('copied'), t('recovery_phrase_copied'));
  };

  const handleProceed = async () => {
    if (!biometricAvailable) {
      navigation.replace('BottomTabs');
      return;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('biometric_prompt'),
        cancelLabel: t('cancel'),
        disableDeviceFallback: false,
      });

      if (result.success) {
        navigation.replace('BottomTabs');
      } else {
        Alert.alert(t('error'), t('biometric_failed'));
      }
    } catch (error) {
      Alert.alert(t('error'), t('biometric_error'));
    }
  };

  if (!mnemonic) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="wallet" size={48} color={primaryColor} />
          <Text style={[styles.loadingText, { color: colors.text }]}>{t('loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const words = mnemonic.split(' ');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{t('backup_wallet')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('backup_wallet_subtitle')}
          </Text>
        </View>

        {/* تحذير أمني */}
        <View style={[styles.warningBox, { backgroundColor: colors.warningBg }]}>
          <Ionicons name="warning" size={24} color={colors.warningText} />
          <View style={styles.warningContent}>
            <Text style={[styles.warningTitle, { color: colors.warningText }]}>
              {t('security_warning')}
            </Text>
            <Text style={[styles.warningText, { color: colors.warningText }]}>
              {t('backup_warning')}
            </Text>
          </View>
        </View>

        {/* Instructions */}
        <View style={[styles.instructionsCard, { backgroundColor: colors.card }]}>
          <Ionicons name="shield-checkmark" size={24} color={primaryColor} />
          <Text style={[styles.instructionsText, { color: colors.text }]}>
            {t('backup_instructions')}
          </Text>
        </View>

        {/* كرت الكلمات */}
        <View style={[styles.mnemonicCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.wordsGrid}>
            {words.map((word, index) => (
              <View 
                key={index} 
                style={[
                  styles.wordBox, 
                  { backgroundColor: isDark ? '#2A2A3E' : '#F8FAFD', borderColor: colors.border }
                ]}
              >
                <Text style={[styles.wordIndex, { color: colors.textSecondary }]}>{index + 1}.</Text>
                <Text style={[styles.wordText, { color: colors.text }]}>{word}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* زر النسخ */}
        <TouchableOpacity
          style={[styles.copyButton, { backgroundColor: colors.card, borderColor: primaryColor }]}
          onPress={handleCopy}
        >
          <Ionicons name="copy-outline" size={20} color={primaryColor} />
          <Text style={[styles.copyButtonText, { color: primaryColor }]}>
            {t('copy_recovery_phrase')}
          </Text>
        </TouchableOpacity>

        {/* زر المتابعة */}
        <TouchableOpacity
          style={[styles.proceedButton, { backgroundColor: primaryColor }]}
          onPress={handleProceed}
        >
          <Ionicons name="finger-print" size={24} color="#FFF" />
          <Text style={styles.proceedButtonText}>
            {biometricAvailable ? t('verify_and_continue') : t('continue_to_wallet')}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#FFF" />
        </TouchableOpacity>

        {/* ملاحظة */}
        <View style={[styles.noteCard, { backgroundColor: colors.card }]}>
          <Ionicons name="lock-closed" size={20} color={colors.textSecondary} />
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            {t('backup_note')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  warningContent: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
  },
  instructionsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  instructionsText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  mnemonicCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  wordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  wordBox: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  wordIndex: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
    minWidth: 24,
  },
  wordText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  copyButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  copyButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  proceedButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    marginBottom: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  proceedButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 12,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  noteText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    lineHeight: 20,
  },
});
