import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Switch,
  ScrollView, Modal, Dimensions, Animated, Platform, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Linking from 'expo-linking';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { clearPriceChartCache } from '../services/priceChartService';
import { clearMarketOverviewCache } from '../services/marketOverviewService';

const { width } = Dimensions.get('window');

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const navigation  = useNavigation();

  const theme          = useAppStore(s => s.theme);
  const toggleTheme    = useAppStore(s => s.toggleTheme);
  const language       = useAppStore(s => s.language);
  const setLanguage    = useAppStore(s => s.setLanguage);
  const logout         = useAppStore(s => s.logout);
  const primaryColor   = useAppStore(s => s.primaryColor);
  const setPrimaryColor= useAppStore(s => s.setPrimaryColor);

  const isDark = theme === 'dark';
  const C = {
    background:    isDark ? '#0A0A0F' : '#F8FAFD',
    card:          isDark ? '#1A1A2E' : '#FFFFFF',
    text:          isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border:        isDark ? '#2A2A3E' : '#E5E7EB',
    danger:        '#EF4444',
    success:       '#10B981',
    warning:       '#F59E0B',
  };

  const [colorModal,    setColorModal]    = useState(false);
  const [safetyModal,   setSafetyModal]   = useState(false);
  const [recoveryPhrase,setRecoveryPhrase]= useState('');
  const [checkingUpdate,setCheckingUpdate]= useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [fadeAnim]  = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const colorsPalette = [
    '#3B82F6','#10B981','#F59E0B','#EF4444',
    '#8B5CF6','#EC4899','#06B6D4','#84CC16',
  ];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue:1, duration:600, useNativeDriver:true }),
      Animated.spring(slideAnim, { toValue:0, tension:60, friction:8, useNativeDriver:true }),
    ]).start();
  }, []);

  const authenticateUser = async (onSuccess) => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled   = await LocalAuthentication.isEnrolledAsync();
      const result     = await LocalAuthentication.authenticateAsync({
        promptMessage:         t(compatible && enrolled ? 'authenticate_to_view' : 'authenticate_with_passcode'),
        cancelLabel:           t('cancel'),
        disableDeviceFallback: false,
        fallbackLabel:         t('use_device_passcode'),
      });
      if (result.success) onSuccess();
      else Alert.alert(t('error'), t('authentication_failed'));
    } catch { Alert.alert(t('error'), t('authentication_failed')); }
  };

  const handleShowRecoveryPhrase = () => {
    authenticateUser(async () => {
      try {
        const phrase = await SecureStore.getItemAsync('wallet_mnemonic');
        if (phrase) { setRecoveryPhrase(phrase); setSafetyModal(true); }
        else Alert.alert(t('error'), t('recovery_phrase_not_found'));
      } catch { Alert.alert(t('error'), t('load_recovery_phrase_error')); }
    });
  };

  const handleBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled   = await LocalAuthentication.isEnrolledAsync();
    if (compatible && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage:t('authenticate_to_continue'), cancelLabel:t('cancel') });
      Alert.alert(result.success ? t('success') : t('error'), result.success ? t('authentication_successful') : t('authentication_failed'), [{ text:t('ok') }]);
    } else {
      Alert.alert(t('biometric_not_available'), t('biometric_not_supported_message'), [{ text:t('ok') }]);
    }
  };

  const checkForUpdates = async () => {
    try {
      setCheckingUpdate(true);
      const res  = await fetch('https://raw.githubusercontent.com/MonyCoin/meco_wallet-app/main/version.json');
      const data = await res.json();
      const currentBuild = Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || 8;
      if (data.buildNumber > currentBuild) {
        Alert.alert(
          t('update_available', 'تحديث جديد متوفر! 🚀'),
          `${t('version','الإصدار')} ${data.latestVersion} متاح.\n\n${data.releaseNotes}`,
          [
            { text:t('cancel','لاحقاً'), style:'cancel' },
            { text:t('update_now','تحديث الآن'), onPress:() => Linking.openURL(data.downloadUrl) },
          ]
        );
      } else {
        Alert.alert(t('up_to_date','التطبيق مُحدّث ✅'), t('latest_version_installed','أنت تستخدم أحدث إصدار.'));
      }
    } catch {
      Alert.alert(t('error'), t('check_update_failed','تعذر التحقق من التحديثات.'));
    } finally { setCheckingUpdate(false); }
  };

  // ✅ حذف التخزين المؤقت
  const handleClearCache = () => {
    Alert.alert(
      t('clear_cache'),
      t('clear_cache_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('clear'),
          style: 'destructive',
          onPress: async () => {
            try {
              setClearingCache(true);
              // مسح الكاش في الذاكرة
              clearPriceChartCache();
              clearMarketOverviewCache();
              // مسح مفاتيح cache في AsyncStorage (ليست بيانات المحفظة)
              const allKeys    = await AsyncStorage.getAllKeys();
              const cacheKeys  = allKeys.filter(k =>
                k.startsWith('@cache_') ||
                k.startsWith('@price_') ||
                k.startsWith('@market_')
              );
              if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
              Alert.alert(t('success'), t('cache_cleared'));
            } catch (_) {
              Alert.alert(t('success'), t('cache_cleared'));
            } finally {
              setClearingCache(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(t('confirm_logout'), t('logout_confirmation_message'), [
      { text:t('cancel'), style:'cancel' },
      {
        text:t('logout'), style:'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.removeItem('wallet_private_key');
            await AsyncStorage.removeItem('wallet_public_key');
            logout();
            navigation.reset({ index:0, routes:[{ name:'Home' }] });
          } catch { Alert.alert(t('error'), t('logout_failed')); }
        },
      },
    ]);
  };

  const toggleLanguage = () => {
    const next = language === 'ar' ? 'en' : 'ar';
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  // ─── مكوّنات ──────────────────────────────────────────────────────────────
  const SettingItem = ({ icon, title, subtitle, onPress, rightComponent, danger=false }) => (
    <TouchableOpacity
      style={[styles.item, { backgroundColor:C.card }]}
      onPress={onPress} activeOpacity={0.7} disabled={!onPress}
    >
      <View style={styles.itemLeft}>
        <View style={[styles.iconWrap, { backgroundColor: danger ? C.danger+'20' : primaryColor+'20' }]}>{icon}</View>
        <View style={styles.itemText}>
          <Text style={[styles.itemTitle, { color: danger ? C.danger : C.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.itemSub, { color:C.textSecondary }]}>{subtitle}</Text>}
        </View>
      </View>
      {rightComponent}
    </TouchableOpacity>
  );

  const SwitchItem = ({ icon, title, subtitle, value, onValueChange }) => (
    <View style={[styles.item, { backgroundColor:C.card }]}>
      <View style={styles.itemLeft}>
        <View style={[styles.iconWrap, { backgroundColor:primaryColor+'20' }]}>{icon}</View>
        <View style={styles.itemText}>
          <Text style={[styles.itemTitle, { color:C.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.itemSub, { color:C.textSecondary }]}>{subtitle}</Text>}
        </View>
      </View>
      <Switch value={value} onValueChange={onValueChange}
        trackColor={{ false:C.border, true:primaryColor+'80' }}
        thumbColor={value ? primaryColor : C.textSecondary}
        ios_backgroundColor={C.border}
      />
    </View>
  );

  const Chevron = () => <Ionicons name="chevron-forward" size={20} color={C.textSecondary} />;

  return (
    <ScrollView style={{ backgroundColor:C.background, flex:1 }} showsVerticalScrollIndicator={false}>
      <Animated.View style={[styles.container, { opacity:fadeAnim, transform:[{ translateY:slideAnim }] }]}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color:C.text }]}>{t('settings')}</Text>
          <Text style={[styles.headerSub,   { color:C.textSecondary }]}>{t('manage_your_wallet_preferences')}</Text>
        </View>

        {/* Wallet */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('wallet_settings').toUpperCase()}</Text>
          <SettingItem
            icon={<Ionicons name="list-outline" size={22} color={primaryColor} />}
            title={t('transaction_history')} subtitle={t('view_all_transactions')}
            onPress={() => navigation.navigate('TransactionHistory')} rightComponent={<Chevron />}
          />
          <SettingItem
            icon={<Ionicons name="language-outline" size={22} color={primaryColor} />}
            title={t('language')} subtitle={language==='ar'?'العربية':'English'}
            onPress={toggleLanguage}
            rightComponent={
              <View style={styles.langBadge}>
                <Text style={[styles.langText, { color:C.text }]}>{language==='ar'?'AR':'EN'}</Text>
              </View>
            }
          />
          <SettingItem
            icon={<MaterialIcons name="fingerprint" size={22} color={primaryColor} />}
            title={t('biometric_authentication')} subtitle={t('use_fingerprint_or_face_id')}
            onPress={handleBiometrics} rightComponent={<Chevron />}
          />
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('appearance').toUpperCase()}</Text>
          <SwitchItem
            icon={<Ionicons name="moon-outline" size={22} color={primaryColor} />}
            title={t('dark_mode')} subtitle={isDark?t('enabled'):t('disabled')}
            value={theme==='dark'} onValueChange={toggleTheme}
          />
          <SettingItem
            icon={<Ionicons name="color-palette-outline" size={22} color={primaryColor} />}
            title={t('accent_color')} subtitle={t('choose_your_theme_color')}
            onPress={() => setColorModal(true)}
            rightComponent={
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                <View style={[styles.colorDot, { backgroundColor:primaryColor }]} />
                <Chevron />
              </View>
            }
          />
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('support').toUpperCase()}</Text>
          <SettingItem
            icon={<Feather name="mail" size={22} color={primaryColor} />}
            title={t('contact_support')} subtitle={t('get_help_or_report_issues')}
            onPress={() => Linking.openURL('mailto:mecowallet@gmail.com')} rightComponent={<Chevron />}
          />
          <SettingItem
            icon={<Ionicons name="cloud-download-outline" size={22} color={primaryColor} />}
            title={t('check_for_updates','التحقق من وجود تحديثات')}
            subtitle={t('check_for_updates_desc','التأكد من استخدامك لأحدث إصدار')}
            onPress={checkingUpdate ? null : checkForUpdates}
            rightComponent={checkingUpdate ? <ActivityIndicator size="small" color={primaryColor} /> : <Chevron />}
          />
        </View>

        {/* ✅ قسم البيانات — حذف التخزين المؤقت */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('data','البيانات').toUpperCase()}</Text>
          <SettingItem
            icon={<Ionicons name="refresh-circle-outline" size={22} color={C.warning} />}
            title={t('clear_cache','مسح التخزين المؤقت')}
            subtitle={t('clear_cache_desc','مسح بيانات الأسعار المحفوظة مؤقتاً')}
            onPress={clearingCache ? null : handleClearCache}
            rightComponent={
              clearingCache
                ? <ActivityIndicator size="small" color={C.warning} />
                : <Ionicons name="chevron-forward" size={20} color={C.warning} />
            }
          />
        </View>

        {/* Safety */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('safety').toUpperCase()}</Text>
          <SettingItem
            icon={<Ionicons name="key-outline" size={22} color={primaryColor} />}
            title={t('show_recovery_phrase')} subtitle={t('view_your_secret_phrase')}
            onPress={handleShowRecoveryPhrase} rightComponent={<Chevron />}
          />
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('account').toUpperCase()}</Text>
          <SettingItem
            icon={<Ionicons name="log-out-outline" size={22} color={C.danger} />}
            title={t('logout')} subtitle={t('sign_out_from_wallet')}
            onPress={handleLogout} danger rightComponent={<Ionicons name="chevron-forward" size={20} color={C.danger} />}
          />
        </View>

        <View style={styles.version}>
          <Text style={[styles.versionTxt, { color:C.textSecondary }]}>MECO Wallet {t('version')} 1.6.0</Text>
        </View>
      </Animated.View>

      {/* Color Picker Modal */}
      <Modal visible={colorModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalBox, { backgroundColor:C.card, transform:[{ scale:fadeAnim }] }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color:C.text }]}>{t('choose_accent_color')}</Text>
              <TouchableOpacity onPress={() => setColorModal(false)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.colorsGrid}>
              {colorsPalette.map((color, i) => (
                <TouchableOpacity key={i} style={styles.colorItem} onPress={() => { setPrimaryColor(color); setColorModal(false); }}>
                  <View style={[styles.colorCircle, { backgroundColor:color }]}>
                    {primaryColor===color && <Ionicons name="checkmark" size={20} color="#FFF" />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.colorHint, { color:C.textSecondary }]}>{t('color_change_applies_immediately')}</Text>
          </Animated.View>
        </View>
      </Modal>

      {/* Safety Modal */}
      <Modal visible={safetyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.safetyBox, { backgroundColor:C.card, transform:[{ translateY: fadeAnim.interpolate({ inputRange:[0,1], outputRange:[300,0] }) }] }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color:C.text }]}>{t('show_recovery_phrase')}</Text>
              <TouchableOpacity onPress={() => setSafetyModal(false)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.warningBox, { backgroundColor:C.warning+'20', borderColor:C.warning }]}>
              <Ionicons name="warning" size={24} color={C.warning} />
              <Text style={[styles.warningTxt, { color:C.warning }]}>{t('warning_phrase')}</Text>
            </View>
            <View style={[styles.phraseBox, { backgroundColor:C.background, borderColor:C.border }]}>
              <Text style={[styles.phraseText, { color:C.text }]}>{recoveryPhrase}</Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor:C.card, borderColor:C.border }]}
              onPress={() => { Clipboard.setStringAsync(recoveryPhrase); Alert.alert(t('success'), t('phrase_copied')); }}
            >
              <Ionicons name="copy-outline" size={20} color={primaryColor} />
              <Text style={[styles.copyBtnTxt, { color:C.text }]}>{t('copy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor:primaryColor }]} onPress={() => setSafetyModal(false)}>
              <Text style={styles.closeBtnTxt}>{t('close')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { padding:20, paddingBottom:40 },
  header:      { alignItems:'center', marginBottom:32, paddingTop:10 },
  headerTitle: { fontSize:32, fontWeight:'700', marginBottom:8 },
  headerSub:   { fontSize:14, textAlign:'center' },
  section:     { marginBottom:28 },
  sectionTitle:{ fontSize:12, fontWeight:'600', marginBottom:12, letterSpacing:1 },
  item:        { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderRadius:16, marginBottom:12, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.05, shadowRadius:4, elevation:2 },
  itemLeft:    { flexDirection:'row', alignItems:'center', flex:1 },
  iconWrap:    { width:44, height:44, borderRadius:12, justifyContent:'center', alignItems:'center', marginRight:12 },
  itemText:    { flex:1 },
  itemTitle:   { fontSize:16, fontWeight:'600', marginBottom:2 },
  itemSub:     { fontSize:12 },
  langBadge:   { paddingHorizontal:12, paddingVertical:6, borderRadius:12, backgroundColor:'rgba(0,0,0,0.05)' },
  langText:    { fontSize:12, fontWeight:'600' },
  colorDot:    { width:24, height:24, borderRadius:12, marginRight:8 },
  version:     { alignItems:'center', marginTop:20, padding:20 },
  versionTxt:  { fontSize:12 },
  modalOverlay:{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center', padding:20 },
  modalBox:    { width:'100%', borderRadius:24, padding:24, shadowColor:'#000', shadowOffset:{width:0,height:20}, shadowOpacity:0.25, shadowRadius:40, elevation:10 },
  safetyBox:   { width:'100%', borderRadius:24, padding:24, maxHeight:'80%' },
  modalHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:24 },
  modalTitle:  { fontSize:20, fontWeight:'600' },
  colorsGrid:  { flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', marginBottom:20 },
  colorItem:   { width:'23%', aspectRatio:1, marginBottom:12 },
  colorCircle: { width:'100%', height:'100%', borderRadius:50, justifyContent:'center', alignItems:'center' },
  colorHint:   { fontSize:12, textAlign:'center', marginTop:8 },
  warningBox:  { flexDirection:'row', alignItems:'center', padding:16, borderRadius:12, borderWidth:1, marginBottom:20, gap:12 },
  warningTxt:  { flex:1, fontSize:14, fontWeight:'500' },
  phraseBox:   { width:'100%', padding:16, borderRadius:12, borderWidth:1, marginBottom:20 },
  phraseText:  { fontFamily:Platform.OS==='ios'?'Courier':'monospace', fontSize:14 },
  copyBtn:     { flexDirection:'row', alignItems:'center', justifyContent:'center', padding:12, borderRadius:12, borderWidth:1, gap:8, marginBottom:12 },
  copyBtnTxt:  { fontSize:16, fontWeight:'500' },
  closeBtn:    { paddingVertical:16, borderRadius:12, alignItems:'center' },
  closeBtnTxt: { color:'#FFF', fontSize:16, fontWeight:'600' },
});
