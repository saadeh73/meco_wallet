import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { Keypair } from '@solana/web3.js';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { useAppStore } from '../store';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import bs58 from 'bs58';

export default function CreateWalletScreen() {
  const [mnemonic, setMnemonic] = useState('');
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  
  const isDark = theme === 'dark';
  
  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    warningBg: isDark ? '#2A1A1A' : '#FDEAEA',
    warningText: isDark ? '#FF9999' : '#C0392B',
  };

  useEffect(() => {
    generateWallet();
  }, []);

  const generateWallet = async () => {
    try {
      const generatedMnemonic = bip39.generateMnemonic(wordlist);
      const cleanedMnemonic = generatedMnemonic
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

      // لا نقوم بالحفظ هنا، فقط نعرض العبارة للمستخدم لنسخها
      setMnemonic(cleanedMnemonic);
    } catch (err) {
      console.error('Create wallet error:', err);
      Alert.alert(t('error'), t('create_wallet_failed'));
    }
  };

  const copyMnemonic = async () => {
    await Clipboard.setStringAsync(mnemonic);
    Alert.alert(t('copied'), t('recovery_phrase_copied'));
  };

  const handleContinue = async () => {
    try {
      // 1. توليد المفاتيح من العبارة
      const seed = await bip39.mnemonicToSeed(mnemonic);
      const keypair = Keypair.fromSeed(seed.slice(0, 32));
      const publicKey = keypair.publicKey.toBase58();
      const privateKey = bs58.encode(keypair.secretKey);

      // 2. الحفظ الفعلي والآمن هنا (فقط عندما يضغط المستخدم "حفظت الكلمات")
      await SecureStore.setItemAsync('wallet_mnemonic', mnemonic);
      await SecureStore.setItemAsync('wallet_initialized', 'true');
      await SecureStore.setItemAsync('wallet_private_key_0', privateKey);
      await SecureStore.setItemAsync('wallet_public_key', publicKey);
      await SecureStore.setItemAsync('wallet_private_key', privateKey);

      // 3. تسجيل الحساب الأساسي فوراً
      const mainAccount = [{
        index: 0,
        name: t('main_account', 'الحساب الرئيسي'),
        publicKey: publicKey,
        isLegacy: true
      }];

      await useAppStore.getState().restoreDiscoveredAccounts(mainAccount);

      // الانتقال للشاشة الرئيسية
      navigation.reset({
        index: 0,
        routes: [{ name: 'BottomTabs' }],
      });

    } catch (err) {
      console.error('Error registering main account:', err);
      Alert.alert(t('error'), 'حدث خطأ أثناء إعداد المحفظة.');
    }
  };

  const words = mnemonic.split(' ');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>{t('backup_phrase')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* تحذير أمني */}
        <View style={[styles.warningBox, { backgroundColor: colors.warningBg }]}>
          <Ionicons name="warning" size={24} color={colors.warningText} />
          <View style={styles.warningContent}>
            <Text style={[styles.warningTitle, { color: colors.warningText }]}>
              {t('security_warning')}
            </Text>
            <Text style={[styles.warningText, { color: colors.warningText }]}>
              {t('recovery_phrase_warning')}
            </Text>
          </View>
        </View>

        {/* Instructions */}
        <View style={[styles.instructionsCard, { backgroundColor: colors.card }]}>
          <Ionicons name="information-circle" size={24} color={primaryColor} />
          <Text style={[styles.instructionsText, { color: colors.text }]}>
            {t('recovery_phrase_instructions')}
          </Text>
        </View>

        {/* كرت الكلمات */}
        <View style={[styles.mnemonicCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.wordsGrid}>
            {words.map((word, index) => (
              <View 
                key={`${word}-${index}`} 
                style={[
                  styles.wordItem, 
                  { backgroundColor: isDark ? '#2A2A3E' : '#F8FAFD', borderColor: colors.border }
                ]}
              >
                <Text style={[styles.wordIndex, { color: colors.textSecondary }]}>{index + 1}</Text>
                <Text style={[styles.wordText, { color: colors.text }]}>{word}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* زر النسخ */}
        <TouchableOpacity
          style={[styles.copyButton, { borderColor: primaryColor, backgroundColor: colors.card }]}
          onPress={copyMnemonic}
        >
          <Ionicons name="copy-outline" size={20} color={primaryColor} />
          <Text style={[styles.copyText, { color: primaryColor }]}>
            {t('copy_recovery_phrase')}
          </Text>
        </TouchableOpacity>

        {/* متابعة */}
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: primaryColor }]}
          onPress={handleContinue}
        >
          <Text style={styles.continueButtonText}>{t('i_saved_the_words')}</Text>
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
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
  wordItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  wordIndex: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
    minWidth: 20,
  },
  wordText: {
    fontSize: 16,
    fontWeight: '500',
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
  copyText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  continueButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
});
