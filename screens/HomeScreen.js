import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  SafeAreaView, Modal
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  // ✅ محتاجينها عشان نحفظ اختيار اللغة صح (زي SettingsScreen بالظبط)
  const setLanguage = useAppStore(state => state.setLanguage);

  const [langModalVisible, setLangModalVisible] = useState(false);

  const LANGUAGES = [
    { code: 'ar', name: 'العربية' },
    { code: 'en', name: 'English' },
  ];

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  // ✅ نفس ثيم التطبيق بس، زي كل الشاشات التانية — مش هنخلط بثيم الجهاز
  const isDark = theme === 'dark';
  
  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
  };

  // ✅ بنحفظ الاختيار فى الـ store (بيتخزن فى AsyncStorage ويتزامن مع باقي
  // التطبيق) قبل ما نطبقه على i18next مباشرة — نفس ترتيب SettingsScreen.toggleLanguage
  const changeLanguage = (langCode) => {
    setLanguage(langCode);
    i18n.changeLanguage(langCode);
    setLangModalVisible(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        
        {/* Header with Language Button */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="wallet" size={28} color={primaryColor} />
            <Text style={[styles.appName, { color: colors.text }]}>MECO Wallet</Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.langButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setLangModalVisible(true)}
          >
            <Text style={[styles.langText, { color: colors.text }]}>{currentLang.name}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Logo Section */}
        <View style={styles.logoContainer}>
          <Image 
            source={require('../assets/logo.png')} 
            style={styles.logo} 
          />
          <View style={[styles.gradientCircle, { backgroundColor: `${primaryColor}20` }]} />
        </View>

        {/* Welcome Text */}
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('welcome')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('first_arab_wallet')}
          </Text>
        </View>

        {/* Buttons Section */}
        <View style={styles.buttonsContainer}>
          
          {/* Create Wallet Button */}
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('CreateWallet')}
            activeOpacity={0.8}
          >
            <View style={[styles.primaryButton, { backgroundColor: primaryColor }]}>
              <View style={styles.buttonContent}>
                <Ionicons name="add-circle-outline" size={24} color="#FFF" />
                <Text style={styles.primaryButtonText}>{t('create_wallet')}</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ opacity: 0.9 }} />
            </View>
          </TouchableOpacity>

          {/* Import Wallet Button */}
          <TouchableOpacity
            style={[styles.button, { marginTop: 12 }]}
            onPress={() => navigation.navigate('ImportWallet')}
            activeOpacity={0.8}
          >
            <View style={[styles.importButton, { 
              backgroundColor: colors.card,
              borderColor: colors.border
            }]}>
              <View style={styles.buttonContent}>
                <Ionicons name="download-outline" size={24} color={primaryColor} />
                <Text style={[styles.importButtonText, { color: colors.text }]}>
                  {t('import_wallet')}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>

        </View>

        {/* Features */}
        <View style={[styles.featuresContainer, { backgroundColor: colors.card }]}>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={20} color={primaryColor} />
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>
              {t('secure_and_encrypted')}
            </Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="flash" size={20} color={primaryColor} />
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>
              {t('fast_transactions')}
            </Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="globe" size={20} color={primaryColor} />
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>
              {t('multi_language_support')}
            </Text>
          </View>
        </View>

      </View>

      {/* Language Selection Modal */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('choose_language')}
              </Text>
              <TouchableOpacity onPress={() => setLangModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langItem, { borderBottomColor: colors.border }]}
                onPress={() => changeLanguage(lang.code)}
              >
                <Text style={[styles.langItemName, { color: colors.text }]}>
                  {lang.name}
                </Text>
                {lang.code === i18n.language && (
                  <Ionicons name="checkmark-circle" size={24} color={primaryColor} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  langText: {
    fontSize: 14,
    fontWeight: '500',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
    position: 'relative',
  },
  logo: {
    width: 160,
    height: 160,
    resizeMode: 'contain',
    zIndex: 2,
  },
  gradientCircle: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    zIndex: 1,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonsContainer: {
    marginBottom: 30,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryButton: {
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  importButton: {
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  importButtonText: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  featuresContainer: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
  },
  featureText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  langItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  langItemName: {
    fontSize: 16,
    fontWeight: '500',
  },
});
