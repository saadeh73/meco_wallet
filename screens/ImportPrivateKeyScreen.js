import React, { useState, useLayoutEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAppStore } from '../store';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

export default function ImportPrivateKeyScreen() {
  const [privateKey, setPrivateKey] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const addAccountFromPrivateKey = useAppStore(state => state.addAccountFromPrivateKey);
  const isDark = theme === 'dark';

  // ✅ ضبط العنوان الديناميكي لشريط التنقل العلوي
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('import_private_key.title'),
      headerBackTitle: t('back'),
    });
  }, [navigation, t]);

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
    if (!privateKey.trim()) {
      Alert.alert(t('error'), t('import_private_key.enter_key_error'));
      return;
    }

    setIsImporting(true);
    try {
      const name = accountName.trim() || t('import_private_key.default_account_name');
      await addAccountFromPrivateKey(name, privateKey.trim());
      Alert.alert(t('success'), t('import_private_key.success'));
      navigation.goBack();
    } catch (error) {
      Alert.alert(t('error'), error.message || t('import_private_key.failed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setPrivateKey(text);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* هيدر بدون عنوان */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>

          {/* ⚠️ تحذير أمني مزدوج */}
          <View style={[styles.warningBox, { backgroundColor: colors.warningBg }]}>
            <Ionicons name="shield-warning" size={24} color={colors.warningText} />
            <View style={styles.warningContent}>
              <Text style={[styles.warningText, { color: colors.warningText }]}>
                {t('import_private_key.warning')}
              </Text>
              <Text style={[styles.warningText, { color: colors.warningText, marginTop: 8 }]}>
                {t('import_private_key.warning_not_recoverable')}
              </Text>
            </View>
          </View>

          <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              {t('import_private_key.account_name_label')}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: isDark ? '#2A2A3E' : '#F8F8F8', borderColor: colors.border }]}
              value={accountName}
              onChangeText={setAccountName}
              placeholder={t('import_private_key.account_name_placeholder')}
              placeholderTextColor={colors.textSecondary}
            />
            
            <Text style={[styles.inputLabel, { color: colors.text, marginTop: 16 }]}>
              {t('import_private_key.private_key_label')}
            </Text>
            <TextInput
              style={[styles.inputLarge, { color: colors.text, backgroundColor: isDark ? '#2A2A3E' : '#F8F8F8', borderColor: colors.border }]}
              value={privateKey}
              onChangeText={setPrivateKey}
              placeholder={t('import_private_key.private_key_placeholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            
            <TouchableOpacity style={[styles.pasteButton, { backgroundColor: primaryColor }]} onPress={handlePaste}>
              <Ionicons name="clipboard-outline" size={20} color="#FFF" />
              <Text style={styles.pasteButtonText}>{t('import_private_key.paste')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.importButton, { backgroundColor: primaryColor, opacity: isImporting ? 0.5 : 1 }]}
            onPress={handleImport}
            disabled={isImporting}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="key" size={22} color="#FFF" />
                <Text style={styles.importButtonText}>{t('import_private_key.import_button')}</Text>
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
  inputLabel: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { fontSize: 16, borderRadius: 12, padding: 14, borderWidth: 1 },
  inputLarge: { fontSize: 14, lineHeight: 20, minHeight: 100, borderRadius: 12, padding: 14, borderWidth: 1, textAlignVertical: 'top' },
  pasteButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 10, marginTop: 16 },
  pasteButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  importButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 18, borderRadius: 12, marginTop: 8 },
  importButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
});
