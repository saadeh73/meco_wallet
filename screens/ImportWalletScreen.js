// ImportWalletScreen.js - الإصلاح النهائي

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

// ★★★ المفاتيح يجب أن تكون نفسها في store.js ★★★
const ACCOUNTS_STORAGE_KEY = '@meco_accounts';
const OLD_PRIVATE_KEY = 'wallet_private_key';
const OLD_PUBLIC_KEY = 'wallet_public_key';
const OLD_MNEMONIC = 'wallet_mnemonic';

export default function ImportWalletScreen() {
  const [mnemonic, setMnemonic] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const loadActiveAccount = useAppStore(state => state.loadActiveAccount);
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
      const cleanedMnemonic = mnemonic.toLowerCase().trim().replace(/\s+/g, ' ');

      if (!bip39.validateMnemonic(cleanedMnemonic, wordlist)) {
        Alert.alert(t('error'), t('invalid_recovery_phrase', 'عبارة الاسترداد غير صالحة'));
        return;
      }

      // توليد المحفظة
      const seed = await bip39.mnemonicToSeed(cleanedMnemonic);
      const keypair = Keypair.fromSeed(seed.slice(0, 32));
      const publicKey = keypair.publicKey.toBase58();
      const privateKey = bs58.encode(keypair.secretKey);

      // ★★★ الإصلاح: حفظ المفاتيح بالتزامن مع store.js ★★★
      await SecureStore.setItemAsync(OLD_MNEMONIC, cleanedMnemonic);
      await SecureStore.setItemAsync(OLD_PUBLIC_KEY, publicKey);
      await SecureStore.setItemAsync(OLD_PRIVATE_KEY, privateKey);
      await SecureStore.setItemAsync('wallet_initialized', 'true');

      // تحديث الحسابات
      const newAccount = { index: 0, name: 'الحساب الرئيسي', publicKey: publicKey, isLegacy: true };
      await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify([newAccount]));
      await AsyncStorage.setItem('@meco_active_account_index', '0');

      await loadActiveAccount();

      Alert.alert(t('success'), t('wallet_imported_successfully', 'تم استيراد المحفظة بنجاح'));
      navigation.reset({ index: 0, routes: [{ name: 'BottomTabs' }] });
    } catch (error) {
      console.error('❌ [ImportWallet] خطأ:', error);
      Alert.alert(t('error'), t('import_wallet_failed', 'فشل الاستيراد'));
    } finally {
      setIsImporting(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) setMnemonic(text);
    } catch (error) { console.warn('❌ [ImportWallet] خطأ:', error); }
  };

  const wordCount = mnemonic.trim().split(/\s+/).filter(Boolean).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>{t('import_wallet', 'استيراد محفظة')}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* تحذير أمني */}
          <View style={[styles.warningBox, { backgroundColor: colors.warningBg }]}>
            <Ionicons name="shield-warning" size={24} color={colors.warningText} />
            <View style={styles.warningContent}>
              <Text style={[styles.warningText, { color: colors.warningText }]}>
                {t('import_wallet_warning', 'لا تشارك عبارة الاسترداد مع أي شخص.')}
              </Text>
            </View>
          </View>

          {/* حقل الإدخال */}
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
              placeholder="word1 word2 word3 ... word12"
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={[styles.pasteButton, { backgroundColor: primaryColor }]} onPress={handlePaste}>
              <Ionicons name="clipboard-outline" size={20} color="#FFF" />
              <Text style={styles.pasteButtonText}>{t('paste', 'لصق')}</Text>
            </TouchableOpacity>
          </View>

          {/* تعليمات */}
          <View style={[styles.instructionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle" size={24} color={colors.textSecondary} />
            <Text style={[styles.instructionsText, { color: colors.textSecondary }]}>
              {t('import_wallet_instructions', 'أدخل الـ 12 كلمة بنفس الترتيب.')}
            </Text>
          </View>

          {/* زر الاستيراد */}
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
  instructionsCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1 },
  instructionsText: { flex: 1, marginLeft: 12, fontSize: 14, lineHeight: 20 },
  importButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 18, borderRadius: 12 },
  importButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
});
