import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Keypair } from '@solana/web3.js';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import * as Clipboard from 'expo-clipboard';
import { useAppStore } from '../store';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

export default function ImportWalletScreen() {
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
    inputBackground: isDark ? '#2A2A3E' : '#FFFFFF',
    warningBg: isDark ? '#2A1A1A' : '#FFF3CD',
    warningText: isDark ? '#FFB74D' : '#856404',
  };

  const handleImport = async () => {
    try {
      const cleanedMnemonic = mnemonic
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

      if (!bip39.validateMnemonic(cleanedMnemonic, wordlist)) {
        Alert.alert(t('error'), t('invalid_recovery_phrase'));
        return;
      }

      const seed = await bip39.mnemonicToSeed(cleanedMnemonic);
      const keypair = Keypair.fromSeed(seed.slice(0, 32));

      await SecureStore.setItemAsync('wallet_mnemonic', cleanedMnemonic);
      await SecureStore.setItemAsync(
        'wallet_private_key',
        JSON.stringify(Array.from(keypair.secretKey))
      );
      await SecureStore.setItemAsync(
        'wallet_public_key',
        keypair.publicKey.toBase58()
      );
      await SecureStore.setItemAsync('wallet_initialized', 'true');

      Alert.alert(t('success'), t('wallet_imported_successfully'));

      navigation.reset({
        index: 0,
        routes: [{ name: 'BottomTabs' }],
      });
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert(t('error'), t('import_wallet_failed'));
    }
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setMnemonic(text);
  };

  const wordCount = mnemonic.trim().split(/\s+/).filter(Boolean).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>{t('import_wallet')}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* تحذير أمني */}
          <View style={[styles.warningBox, { backgroundColor: colors.warningBg }]}>
            <Ionicons name="warning" size={24} color={colors.warningText} />
            <View style={styles.warningContent}>
              <Text style={[styles.warningText, { color: colors.warningText }]}>
                {t('import_wallet_warning')}
              </Text>
            </View>
          </View>

          {/* Input Card */}
          <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.inputHeader}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {t('enter_recovery_phrase')}
              </Text>
              <Text style={[styles.wordCount, { color: wordCount === 12 ? primaryColor : colors.textSecondary }]}>
                {wordCount} / 12 {t('words')}
              </Text>
            </View>
            
            <TextInput
              style={[styles.input, { 
                color: colors.text, 
                backgroundColor: colors.inputBackground,
                borderColor: colors.border 
              }]}
              placeholder={t('recovery_phrase_placeholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              value={mnemonic}
              onChangeText={setMnemonic}
              textAlign="right"
              autoCapitalize="none"
              autoCorrect={false}
            />
            
            <TouchableOpacity 
              style={[styles.pasteButton, { backgroundColor: primaryColor }]} 
              onPress={handlePaste}
            >
              <Ionicons name="clipboard-outline" size={20} color="#FFF" />
              <Text style={styles.pasteButtonText}>{t('paste')}</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <View style={[styles.instructionsCard, { backgroundColor: colors.card }]}>
            <Ionicons name="information-circle" size={20} color={primaryColor} />
            <Text style={[styles.instructionsText, { color: colors.textSecondary }]}>
              {t('import_wallet_instructions')}
            </Text>
          </View>

          {/* زر الاستيراد */}
          <TouchableOpacity
            style={[
              styles.importButton, 
              { 
                backgroundColor: wordCount === 12 ? primaryColor : colors.border,
                opacity: wordCount === 12 ? 1 : 0.6
              }
            ]}
            onPress={handleImport}
            disabled={wordCount !== 12}
          >
            <Ionicons name="download" size={24} color="#FFF" />
            <Text style={styles.importButtonText}>{t('import')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
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
  warningText: {
    fontSize: 14,
    lineHeight: 20,
  },
  inputCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  wordCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  pasteButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  pasteButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  instructionsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  importButton: {
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
  importButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
