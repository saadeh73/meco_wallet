// ImportWalletScreen.js - خوارزمية الاستكشاف المعمارية (مع دعم كامل للغات)

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keypair } from '@solana/web3.js';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import * as Clipboard from 'expo-clipboard';
import { useAppStore } from '../store';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import bs58 from 'bs58';
import { derivePath } from 'ed25519-hd-key';

// جلب خدمات البلوكشين لفحص الأرصدة
import { getSolBalance, getTokenAccounts } from '../services/heliusService';

const OLD_PRIVATE_KEY = 'wallet_private_key';
const OLD_PUBLIC_KEY = 'wallet_public_key';
const OLD_MNEMONIC = 'wallet_mnemonic';

export default function ImportWalletScreen() {
  const [mnemonic, setMnemonic] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState(''); // لعرض حالة الاستكشاف
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const restoreDiscoveredAccounts = useAppStore(state => state.restoreDiscoveredAccounts);
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

  const handleImport = async () => {
    if (isImporting) return;
    try {
      setIsImporting(true);
      setDiscoveryStatus(t('verifying_phrase', 'جاري التحقق من العبارة...'));
      const cleanedMnemonic = mnemonic.toLowerCase().trim().replace(/\s+/g, ' ');

      if (!bip39.validateMnemonic(cleanedMnemonic, wordlist)) {
        Alert.alert(t('error'), t('invalid_recovery_phrase', 'عبارة الاسترداد غير صالحة'));
        setIsImporting(false);
        setDiscoveryStatus('');
        return;
      }

      const seed = await bip39.mnemonicToSeed(cleanedMnemonic);
      const discoveredAccounts = [];

      setDiscoveryStatus(t('restoring_main_account', 'جاري استعادة الحساب الأساسي...'));
      
      // 1. معالجة الحساب 0 (التوافق مع القديم)
      const oldKeypair = Keypair.fromSeed(seed.slice(0, 32));
      const pubKey0 = oldKeypair.publicKey.toBase58();
      const privKey0 = bs58.encode(oldKeypair.secretKey);

      await SecureStore.setItemAsync(OLD_PUBLIC_KEY, pubKey0);
      await SecureStore.setItemAsync(OLD_PRIVATE_KEY, privKey0);
      await SecureStore.setItemAsync('wallet_private_key_0', privKey0);

      discoveredAccounts.push({
        index: 0,
        name: t('main_account', 'الحساب الرئيسي'),
        publicKey: pubKey0,
        isLegacy: true
      });

      // 2. خوارزمية الاستكشاف (Account Discovery) للحسابات من 1 إلى 9 (حد أقصى 10 حسابات)
      for (let i = 1; i < 10; i++) {
        setDiscoveryStatus(`${t('scanning_accounts', 'جاري استكشاف الحسابات المفقودة')} (${i}/10)...`);
        
        const path = `m/44'/501'/${i}'/0'`;
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        const keypair = Keypair.fromSeed(derivedSeed);
        const pubKey = keypair.publicKey.toBase58();
        const privKey = bs58.encode(keypair.secretKey);

        try {
          // تأخير بسيط لتجنب حظر الـ API
          if (i > 1) await new Promise(res => setTimeout(res, 400));

          const solBal = await getSolBalance(true, pubKey).catch(() => 0);
          const tokens = await getTokenAccounts(pubKey).catch(() => []);

          if (solBal > 0 || tokens.length > 0) {
            // وجدنا حساباً مستخدماً!
            await SecureStore.setItemAsync(`wallet_private_key_${i}`, privKey);
            discoveredAccounts.push({
              index: i,
              name: `${t('account', 'الحساب')} ${i + 1}`,
              publicKey: pubKey
            });
          } else {
            // إذا كان الحساب فارغاً تماماً، نتوقف عن البحث (Gap Limit) لتوفير الوقت
            break;
          }
        } catch (e) {
          console.warn(`Error scanning account ${i}:`, e);
          break; // إذا فشل الاتصال، نتوقف ونسترد ما وجدناه فقط
        }
      }

      setDiscoveryStatus(t('finalizing_setup', 'جاري إتمام الإعدادات...'));

      // 3. حفظ عبارة الاسترداد وإرسال الحسابات المكتشفة إلى الـ Store
      await SecureStore.setItemAsync(OLD_MNEMONIC, cleanedMnemonic);
      await SecureStore.setItemAsync('wallet_initialized', 'true');

      await restoreDiscoveredAccounts(discoveredAccounts);

      Alert.alert(
        t('success'), 
        `${t('wallet_imported_successfully', 'تم الاسترداد بنجاح!')} ${t('accounts_found', 'وجدنا')} ${discoveredAccounts.length} ${t('accounts_linked', 'حساب مرتبط بهذه المحفظة.')}`
      );
      
      navigation.reset({ index: 0, routes: [{ name: 'BottomTabs' }] });
    } catch (error) {
      console.error('❌ [ImportWallet] خطأ:', error);
      Alert.alert(t('error'), t('import_wallet_failed', 'فشل الاستيراد. يرجى المحاولة مرة أخرى.'));
    } finally {
      setIsImporting(false);
      setDiscoveryStatus('');
    }
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) setMnemonic(text);
    } catch (error) {}
  };

  const wordCount = mnemonic.trim().split(/\s+/).filter(Boolean).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>{t('import_wallet', 'استيراد محفظة')}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={[styles.warningBox, { backgroundColor: colors.warningBg }]}>
            <Ionicons name="shield-warning" size={24} color={colors.warningText} />
            <View style={styles.warningContent}>
              <Text style={[styles.warningText, { color: colors.warningText }]}>
                {t('import_wallet_warning', 'لا تشارك عبارة الاسترداد مع أي شخص.')}
              </Text>
            </View>
          </View>

          <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.inputHeader}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>{t('enter_recovery_phrase', 'أدخل عبارة الاسترداد')}</Text>
              <Text style={[styles.wordCount, { color: wordCount === 12 ? '#4CAF50' : colors.textSecondary }]}>
                {wordCount} / 12
              </Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: isDark ? '#2A2A3E' : '#F8F8F8', borderColor: colors.border }]}
              value={mnemonic}
              onChangeText={setMnemonic}
              placeholder={t('recovery_phrase_placeholder', 'word1 word2 word3 ... word12')}
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isImporting}
            />
            <TouchableOpacity 
              style={[styles.pasteButton, { backgroundColor: primaryColor, opacity: isImporting ? 0.5 : 1 }]} 
              onPress={handlePaste}
              disabled={isImporting}
            >
              <Ionicons name="clipboard-outline" size={20} color="#FFF" />
              <Text style={styles.pasteButtonText}>{t('paste', 'لصق')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.importButton, { backgroundColor: primaryColor, opacity: isImporting || wordCount !== 12 ? 0.5 : 1 }]}
            onPress={handleImport}
            disabled={isImporting || wordCount !== 12}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="download" size={22} color="#FFF" />
                <Text style={styles.importButtonText}>{t('import', 'استيراد')}</Text>
              </>
            )}
          </TouchableOpacity>

          {isImporting && discoveryStatus ? (
            <Text style={[styles.discoveryText, { color: primaryColor }]}>{discoveryStatus}</Text>
          ) : null}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backButton: { padding: 8 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  warningBox: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderRadius: 12, marginBottom: 20 },
  warningContent: { flex: 1, marginLeft: 12 },
  warningText: { fontSize: 14, lineHeight: 20 },
  inputCard: { borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1 },
  inputHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  inputLabel: { fontSize: 16, fontWeight: '600' },
  wordCount: { fontSize: 14, fontWeight: '500' },
  input: { fontSize: 16, lineHeight: 24, minHeight: 120, borderRadius: 12, padding: 16, borderWidth: 1, textAlignVertical: 'top' },
  pasteButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 10, marginTop: 16 },
  pasteButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  importButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 18, borderRadius: 12 },
  importButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  discoveryText: { textAlign: 'center', marginTop: 16, fontSize: 14, fontWeight: '600' },
});
