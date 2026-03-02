import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  ScrollView,
  Modal,
  Dimensions,
  Animated,
  TextInput,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Linking from 'expo-linking';
import { Ionicons, MaterialIcons, Feather, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';

const { width } = Dimensions.get('window');

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();

  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const logout = useAppStore((state) => state.logout);
  const primaryColor = useAppStore((state) => state.primaryColor);
  const setPrimaryColor = useAppStore((state) => state.setPrimaryColor);

  const isDark = theme === 'dark';
  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    danger: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
  };

  const [colorModalVisible, setColorModalVisible] = useState(false);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);
  const [safetyModalVisible, setSafetyModalVisible] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const colorsPalette = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Lime
  ];

  // ✅ تم تعديل هذا الـ useEffect لحل مشكلة اللغة
  useEffect(() => {
    // لا نغير اللغة هنا لأنها تتحكم من HomeScreen
    // فقط نقوم بتشغيل الأنيميشن
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []); // ✅ إزالة language من الـ dependencies

  // دالة المصادقة البيومترية
  const authenticateWithBiometrics = async (onSuccess) => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (compatible && enrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: t('authenticate_to_view'),
          cancelLabel: t('cancel'),
          disableDeviceFallback: false,
        });

        if (result.success) {
          onSuccess();
        } else {
          Alert.alert(t('error'), t('authentication_failed'));
        }
      } else {
        Alert.alert(t('biometric_not_available'), t('biometric_not_supported_message'));
      }
    } catch (error) {
      console.error('Authentication error:', error);
      Alert.alert(t('error'), t('authentication_failed'));
    }
  };

  // دالة جلب العبارة السرية
  const loadRecoveryPhrase = async () => {
    try {
      const phrase = await SecureStore.getItemAsync('wallet_mnemonic');
      if (phrase) {
        setRecoveryPhrase(phrase);
      } else {
        Alert.alert(t('error'), t('recovery_phrase_not_found'));
      }
    } catch (error) {
      console.error('Error loading phrase:', error);
      Alert.alert(t('error'), t('load_recovery_phrase_error'));
    }
  };

  // دالة عرض العبارة السرية
  const handleShowRecoveryPhrase = () => {
    authenticateWithBiometrics(async () => {
      await loadRecoveryPhrase();
      setSafetyModalVisible(true);
    });
  };

  // دالة نسخ النص
  const copyToClipboard = (text, message) => {
    Clipboard.setStringAsync(text);
    Alert.alert(t('success'), message);
  };

  const handleBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (compatible && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('authenticate_to_continue'),
        cancelLabel: t('cancel'),
      });

      Alert.alert(
        result.success ? t('success') : t('error'),
        result.success ? t('authentication_successful') : t('authentication_failed'),
        [
          {
            text: t('ok'),
            style: 'default',
          },
        ]
      );
    } else {
      Alert.alert(
        t('biometric_not_available'),
        t('biometric_not_supported_message'),
        [
          {
            text: t('ok'),
            style: 'default',
          },
        ]
      );
    }
  };

  const handleSupport = () => {
    Linking.openURL('mailto:mecowallet@gmail.com');
  };

  const handleLogout = async () => {
    Alert.alert(
      t('confirm_logout'),
      t('logout_confirmation_message'),
      [
        {
          text: t('cancel'),
          style: 'cancel',
        },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('wallet_private_key');
              await AsyncStorage.removeItem('wallet_public_key');
              logout();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              });
            } catch (error) {
              Alert.alert(t('error'), t('logout_failed'));
            }
          },
        },
      ]
    );
  };

  const toggleLanguage = () => {
    const nextLang = language === 'ar' ? 'en' : 'ar';
    setLanguage(nextLang);
    i18n.changeLanguage(nextLang);
  };

  const handleColorSelect = (color) => {
    setPrimaryColor(color);
    setColorModalVisible(false);
  };

  const SettingItem = ({ icon, title, subtitle, onPress, rightComponent, danger = false }) => (
    <TouchableOpacity
      style={[styles.settingItem, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.settingItemLeft}>
        <View style={[styles.iconContainer, { backgroundColor: primaryColor + '20' }]}>
          {icon}
        </View>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, { color: danger ? colors.danger : colors.text }]}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {rightComponent}
    </TouchableOpacity>
  );

  const SwitchItem = ({ icon, title, subtitle, value, onValueChange }) => (
    <View style={[styles.settingItem, { backgroundColor: colors.card }]}>
      <View style={styles.settingItemLeft}>
        <View style={[styles.iconContainer, { backgroundColor: primaryColor + '20' }]}>
          {icon}
        </View>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, { color: colors.text }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: primaryColor + '80' }}
        thumbColor={value ? primaryColor : colors.textSecondary}
        ios_backgroundColor={colors.border}
      />
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background, flex: 1 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View 
        style={[
          styles.container,
          { 
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('settings')}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {t('manage_your_wallet_preferences')}
          </Text>
        </View>

        {/* Wallet Settings Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('wallet_settings').toUpperCase()}
          </Text>
          
          <SettingItem
            icon={<Ionicons name="list-outline" size={22} color={primaryColor} />}
            title={t('transaction_history')}
            subtitle={t('view_all_transactions')}
            onPress={() => {
              try {
                navigation.navigate('TransactionHistory');
              } catch (error) {
                console.error('Navigation error:', error);
              }
            }}
            rightComponent={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
          />
          
          <SettingItem
            icon={<Ionicons name="language-outline" size={22} color={primaryColor} />}
            title={t('language')}
            subtitle={language === 'ar' ? 'العربية' : 'English'}
            onPress={toggleLanguage}
            rightComponent={
              <View style={styles.languageBadge}>
                <Text style={[styles.languageText, { color: colors.text }]}>
                  {language === 'ar' ? 'AR' : 'EN'}
                </Text>
              </View>
            }
          />
          
          <SettingItem
            icon={<MaterialIcons name="fingerprint" size={22} color={primaryColor} />}
            title={t('biometric_authentication')}
            subtitle={t('use_fingerprint_or_face_id')}
            onPress={handleBiometrics}
            rightComponent={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
          />
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('appearance').toUpperCase()}
          </Text>
          
          <SwitchItem
            icon={<Ionicons name="moon-outline" size={22} color={primaryColor} />}
            title={t('dark_mode')}
            subtitle={isDark ? t('enabled') : t('disabled')}
            value={theme === 'dark'}
            onValueChange={toggleTheme}
          />
          
          <SettingItem
            icon={<Ionicons name="color-palette-outline" size={22} color={primaryColor} />}
            title={t('accent_color')}
            subtitle={t('choose_your_theme_color')}
            onPress={() => setColorModalVisible(true)}
            rightComponent={
              <View style={styles.colorPreviewContainer}>
                <View style={[styles.colorPreview, { backgroundColor: primaryColor }]} />
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            }
          />
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('support').toUpperCase()}
          </Text>
          
          <SettingItem
            icon={<Feather name="mail" size={22} color={primaryColor} />}
            title={t('contact_support')}
            subtitle={t('get_help_or_report_issues')}
            onPress={handleSupport}
            rightComponent={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
          />
          
          <SettingItem
            icon={<FontAwesome name="info-circle" size={22} color={primaryColor} />}
            title={t('about_app')}
            subtitle={t('version_and_information')}
            onPress={() => setAboutModalVisible(true)}
            rightComponent={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
          />
        </View>

        {/* ✅ Safety Section (محدث - بدون عرض المفتاح الخاص) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('safety').toUpperCase()}
          </Text>
          
          <SettingItem
            icon={<Ionicons name="key-outline" size={22} color={primaryColor} />}
            title={t('show_recovery_phrase')}
            subtitle={t('view_your_secret_phrase')}
            onPress={handleShowRecoveryPhrase}
            rightComponent={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
          />
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('account').toUpperCase()}
          </Text>
          
          <SettingItem
            icon={<Ionicons name="log-out-outline" size={22} color={colors.danger} />}
            title={t('logout')}
            subtitle={t('sign_out_from_wallet')}
            onPress={handleLogout}
            danger={true}
            rightComponent={<Ionicons name="chevron-forward" size={20} color={colors.danger} />}
          />
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: colors.textSecondary }]}>
            MECO Wallet {t('version')} 1.4.0
          </Text>
        </View>
      </Animated.View>

      {/* Color Picker Modal */}
      <Modal visible={colorModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.modalContainer,
              { 
                backgroundColor: colors.card,
                transform: [{ scale: fadeAnim }]
              }
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('choose_accent_color')}
              </Text>
              <TouchableOpacity onPress={() => setColorModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.colorsGrid}>
              {colorsPalette.map((color, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.colorItem}
                  onPress={() => handleColorSelect(color)}
                >
                  <View style={[styles.colorCircle, { backgroundColor: color }]}>
                    {primaryColor === color && (
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            
            <Text style={[styles.colorHint, { color: colors.textSecondary }]}>
              {t('color_change_applies_immediately')}
            </Text>
          </Animated.View>
        </View>
      </Modal>

      {/* ✅ Safety Modal (محدث - يعرض العبارة السرية فقط) */}
      <Modal visible={safetyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.safetyModalContainer,
              { 
                backgroundColor: colors.card,
                transform: [{ translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [300, 0]
                }) }]
              }
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('show_recovery_phrase')}
              </Text>
              <TouchableOpacity onPress={() => setSafetyModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.safetyContent}>
              {/* تحذير أمني */}
              <View style={[styles.warningBox, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}>
                <Ionicons name="warning" size={24} color={colors.warning} />
                <Text style={[styles.warningText, { color: colors.warning }]}>
                  {t('warning_phrase')}
                </Text>
              </View>

              {/* عرض العبارة */}
              <View style={[styles.textBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.monospaceText, { color: colors.text }]}>
                  {recoveryPhrase}
                </Text>
              </View>

              {/* أزرار الإجراءات */}
              <View style={styles.safetyActions}>
                <TouchableOpacity
                  style={[styles.safetyButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => copyToClipboard(recoveryPhrase, t('phrase_copied'))}
                >
                  <Ionicons name="copy-outline" size={20} color={primaryColor} />
                  <Text style={[styles.safetyButtonText, { color: colors.text }]}>{t('copy')}</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity 
              style={[styles.safetyCloseButton, { backgroundColor: primaryColor }]}
              onPress={() => setSafetyModalVisible(false)}
            >
              <Text style={styles.safetyCloseButtonText}>{t('close')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* About Modal */}
      <Modal visible={aboutModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.aboutModalContainer,
              { 
                backgroundColor: colors.card,
                transform: [{ translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [300, 0]
                }) }]
              }
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('about_app')}
              </Text>
              <TouchableOpacity onPress={() => setAboutModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.aboutContent}>
              <View style={[styles.appLogo, { backgroundColor: primaryColor + '20' }]}>
                <MaterialCommunityIcons name="wallet" size={60} color={primaryColor} />
              </View>
              
              <Text style={[styles.appName, { color: colors.text }]}>MECO Wallet</Text>
              
              <Text style={[styles.appVersion, { color: colors.textSecondary }]}>
                {t('version')} 1.4.0
              </Text>
              
              <Text style={[styles.appDescription, { color: colors.textSecondary }]}>
                {t('secure_crypto_wallet_description')}
              </Text>
              
              <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <Ionicons name="shield-checkmark" size={20} color={colors.success} />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    {t('secure_and_encrypted')}
                  </Text>
                </View>
                
                <View style={styles.featureItem}>
                  <Ionicons name="flash" size={20} color={primaryColor} />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    {t('fast_transactions')}
                  </Text>
                </View>
                
                <View style={styles.featureItem}>
                  <Ionicons name="globe" size={20} color={primaryColor} />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    {t('multi_language_support')}
                  </Text>
                </View>
              </View>
            </View>
            
            <TouchableOpacity 
              style={[styles.aboutCloseButton, { backgroundColor: primaryColor }]}
              onPress={() => setAboutModalVisible(false)}
            >
              <Text style={styles.aboutCloseButtonText}>{t('close')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    letterSpacing: 1,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 12,
  },
  languageBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  languageText: {
    fontSize: 12,
    fontWeight: '600',
  },
  colorPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 20,
    padding: 20,
  },
  versionText: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 10,
  },
  aboutModalContainer: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  safetyModalContainer: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  colorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  colorItem: {
    width: '23%',
    aspectRatio: 1,
    marginBottom: 12,
  },
  colorCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  aboutContent: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appLogo: {
    width: 100,
    height: 100,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    marginBottom: 20,
  },
  appDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  featureList: {
    width: '100%',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  aboutCloseButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  aboutCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // أنماط Safety Modal
  safetyContent: {
    alignItems: 'center',
    marginBottom: 24,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    gap: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  textBox: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  monospaceText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    textAlign: 'left',
  },
  safetyActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  safetyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    minWidth: 120,
  },
  safetyButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  safetyCloseButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  safetyCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
