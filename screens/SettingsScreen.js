// screens/SettingsScreen.js
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Switch,
  ScrollView, Modal, Dimensions, Animated, Platform, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // ✅ استيراد لحساب مسافات الأمان
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
  const insets      = useSafeAreaInsets(); // جلب مسافات الأمان

  const theme          = useAppStore(s => s.theme);
  const toggleTheme    = useAppStore(s => s.toggleTheme);
  const language       = useAppStore(s => s.language);
  const setLanguage    = useAppStore(s => s.setLanguage);
  const logout         = useAppStore(s => s.logout);
  const primaryColor   = useAppStore(s => s.primaryColor);
  const setPrimaryColor= useAppStore(s => s.setPrimaryColor);

  const isDark = theme === 'dark';
  const C = {
    background:    isDark ? '#07070F' : '#F4F5F9',
    card:          isDark ? '#111122' : '#FFFFFF',
    card2:         isDark ? '#171730' : '#ECECF4',
    text:          isDark ? '#EEEEFF' : '#1C1C24',
    textSecondary: isDark ? '#7E7EAA' : '#8A8A9E',
    border:        isDark ? '#1E1E38' : '#E8E8F2',
    border2:       isDark ? '#2D2D4F' : '#DDDDF0',
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
  const [slideAnim] = useState(new Animated.Value(30));

  const colorsPalette = [
    '#3B82F6','#10B981','#F59E0B','#EF4444',
    '#8B5CF6','#EC4899','#06B6D4','#84CC16',
  ];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue:1, duration:500, useNativeDriver:true }),
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
        disableDeviceFallback: false, // يسمح برمز الهاتف كخيار احتياطي
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

  // ✅ التحديث المطور: تفعيل المصادقة بمطابقة البصمة أو رمز قفل الهاتف (PIN/Passcode) معاً دون قيود
  const handleBiometrics = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({ 
        promptMessage: t('authenticate_to_continue'), 
        cancelLabel: t('cancel'),
        disableDeviceFallback: false, // استخدام رمز مرور الهاتف (PIN/Passcode) كبديل فوري وبشكل آمن
      });
      
      if (result.success) {
        Alert.alert(t('success'), t('authentication_successful'), [{ text: t('ok') }]);
      } else {
        Alert.alert(t('error'), t('authentication_failed'), [{ text: t('ok') }]);
      }
    } catch (_) {
      Alert.alert(t('error'), t('authentication_failed'), [{ text: t('ok') }]);
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

  const handleClearCache = () => {
    Alert.alert(t('clear_cache'), t('clear_cache_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('clear'), style: 'destructive',
        onPress: async () => {
          try {
            setClearingCache(true);
            clearPriceChartCache();
            clearMarketOverviewCache();
            const allKeys   = await AsyncStorage.getAllKeys();
            const cacheKeys = allKeys.filter(k => k.startsWith('@cache_') || k.startsWith('@price_') || k.startsWith('@market_'));
            if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
            Alert.alert(t('success'), t('cache_cleared'));
          } catch (_) {
            Alert.alert(t('success'), t('cache_cleared'));
          } finally { setClearingCache(false); }
        },
      },
    ]);
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

  const SettingItem = ({ icon, title, subtitle, onPress, rightComponent, danger=false }) => (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <View style={styles.itemLeft}>
        <View style={[styles.iconWrap, { backgroundColor: danger ? C.danger+'12' : primaryColor+'12' }]}>{icon}</View>
        <View style={styles.itemText}>
          <Text style={[styles.itemTitle, { color: danger ? C.danger : C.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.itemSub, { color:C.textSecondary }]}>{subtitle}</Text>}
        </View>
      </View>
      {rightComponent}
    </TouchableOpacity>
  );

  const SwitchItem = ({ icon, title, subtitle, value, onValueChange }) => (
    <View style={styles.item}>
      <View style={styles.itemLeft}>
        <View style={[styles.iconWrap, { backgroundColor:primaryColor+'12' }]}>{icon}</View>
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

  const Chevron = () => <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />;

  return (
    <ScrollView style={{ backgroundColor:C.background, flex:1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 60 }} showsVerticalScrollIndicator={false}>
      <Animated.View style={[styles.container, { opacity:fadeAnim, transform:[{ translateY:slideAnim }] }]}>

        {/* ── شريط الرأس المطور المانع للتداخل بدقة ── */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 10 : insets.top + 10 }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 }]}
          >
            <Ionicons name="arrow-back" size={18} color={C.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color:C.text }]}>{t('settings')}</Text>
            <Text style={[styles.headerSub, { color:C.textSecondary }]}>{t('manage_your_wallet_preferences')}</Text>
          </View>
        </View>

        {/* Wallet Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('wallet_settings').toUpperCase()}</Text>
          <View style={[styles.groupContainer, { backgroundColor: C.card, borderColor: C.border }]}>
            <SettingItem
              icon={<Ionicons name="language-outline" size={20} color={primaryColor} />}
              title={t('language')} subtitle={language==='ar'?'العربية':'English'}
              onPress={toggleLanguage}
              rightComponent={
                <View style={[styles.langBadge, { backgroundColor: C.background, borderColor: C.border, borderWidth: 1 }]}>
                  <Text style={[styles.langText, { color:C.text }]}>{language==='ar'?'AR':'EN'}</Text>
                </View>
              }
            />
            <View style={[styles.innerDivider, { backgroundColor: C.border }]} />
            <SettingItem
              icon={<MaterialIcons name="fingerprint" size={20} color={primaryColor} />}
              title={t('biometric_authentication')} subtitle={t('use_fingerprint_or_face_id')}
              onPress={handleBiometrics} rightComponent={<Chevron />}
            />
          </View>
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('appearance').toUpperCase()}</Text>
          <View style={[styles.groupContainer, { backgroundColor: C.card, borderColor: C.border }]}>
            <SwitchItem
              icon={<Ionicons name="moon-outline" size={20} color={primaryColor} />}
              title={t('dark_mode')} subtitle={isDark?t('enabled'):t('disabled')}
              value={theme==='dark'} onValueChange={toggleTheme}
            />
            <View style={[styles.innerDivider, { backgroundColor: C.border }]} />
            <SettingItem
              icon={<Ionicons name="color-palette-outline" size={20} color={primaryColor} />}
              title={t('accent_color')} subtitle={t('choose_your_theme_color')}
              onPress={() => setColorModal(true)}
              rightComponent={
                <View style={{ flexDirection:'row', alignItems:'center', gap: 4 }}>
                  <View style={[styles.colorDot, { backgroundColor:primaryColor }]} />
                  <Chevron />
                </View>
              }
            />
          </View>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('support').toUpperCase()}</Text>
          <View style={[styles.groupContainer, { backgroundColor: C.card, borderColor: C.border }]}>
            <SettingItem
              icon={<Feather name="mail" size={20} color={primaryColor} />}
              title={t('contact_support')} subtitle={t('get_help_or_report_issues')}
              onPress={() => Linking.openURL('mailto:mecowallet@gmail.com')} rightComponent={<Chevron />}
            />
            <View style={[styles.innerDivider, { backgroundColor: C.border }]} />
            <SettingItem
              icon={<Ionicons name="cloud-download-outline" size={20} color={primaryColor} />}
              title={t('check_for_updates','التحقق من وجود تحديثات')}
              subtitle={t('check_for_updates_desc','التأكد من استخدامك لأحدث إصدار')}
              onPress={checkingUpdate ? null : checkForUpdates}
              rightComponent={checkingUpdate ? <ActivityIndicator size="small" color={primaryColor} /> : <Chevron />}
            />
          </View>
        </View>

        {/* Data Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('data','البيانات').toUpperCase()}</Text>
          <View style={[styles.groupContainer, { backgroundColor: C.card, borderColor: C.border }]}>
            <SettingItem
              icon={<Ionicons name="refresh-circle-outline" size={20} color={C.warning} />}
              title={t('clear_cache','مسح التخزين المؤقت')}
              subtitle={t('clear_cache_desc','مسح بيانات الأسعار المحفوظة مؤقتاً')}
              onPress={clearingCache ? null : handleClearCache}
              rightComponent={clearingCache ? <ActivityIndicator size="small" color={C.warning} /> : <Ionicons name="chevron-forward" size={18} color={C.warning} />}
            />
          </View>
        </View>

        {/* Safety Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('safety').toUpperCase()}</Text>
          <View style={[styles.groupContainer, { backgroundColor: C.card, borderColor: C.border }]}>
            <SettingItem
              icon={<Ionicons name="key-outline" size={20} color={primaryColor} />}
              title={t('show_recovery_phrase')} subtitle={t('view_your_secret_phrase')}
              onPress={handleShowRecoveryPhrase} rightComponent={<Chevron />}
            />
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color:C.textSecondary }]}>{t('account').toUpperCase()}</Text>
          <View style={[styles.groupContainer, { backgroundColor: C.card, borderColor: C.border }]}>
            <SettingItem
              icon={<Ionicons name="log-out-outline" size={20} color={C.danger} />}
              title={t('logout')} subtitle={t('sign_out_from_wallet')}
              onPress={handleLogout} danger
              rightComponent={<Ionicons name="chevron-forward" size={18} color={C.danger} />}
            />
          </View>
        </View>

      </Animated.View>

      {/* منتقي الألوان (Color Picker) */}
      <Modal visible={colorModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalBox, { backgroundColor:C.card, borderColor: C.border, borderWidth: 1, transform:[{ scale:fadeAnim }] }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color:C.text }]}>{t('choose_accent_color')}</Text>
              <TouchableOpacity onPress={() => setColorModal(false)} style={[styles.backBtn, { backgroundColor: C.background, borderColor: C.border, borderWidth: 1, width: 36, height: 36 }]}>
                <Ionicons name="close" size={18} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.colorsGrid}>
              {colorsPalette.map((color, i) => (
                <TouchableOpacity key={i} style={styles.colorItem} onPress={() => { setPrimaryColor(color); setColorModal(false); }}>
                  <View style={[styles.colorCircle, { backgroundColor:color }]}>
                    {primaryColor===color && <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.colorHint, { color:C.textSecondary }]}>{t('color_change_applies_immediately')}</Text>
          </Animated.View>
        </View>
      </Modal>

      {/* نافذة عبارات الحماية المحدثة (Safety Modal Sheet) */}
      <Modal visible={safetyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.safetyBox, { backgroundColor:C.card, borderColor: C.border, borderWidth: 1, transform:[{ translateY: fadeAnim.interpolate({ inputRange:[0,1], outputRange:[300,0] }) }] }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color:C.text }]}>{t('show_recovery_phrase')}</Text>
              <TouchableOpacity onPress={() => setSafetyModal(false)} style={[styles.backBtn, { backgroundColor: C.background, borderColor: C.border, borderWidth: 1 }]}>
                <Ionicons name="close" size={18} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.warningBox, { backgroundColor:C.warning+'12', borderColor:C.warning }]}>
              <Ionicons name="warning" size={20} color={C.warning} />
              <Text style={[styles.warningTxt, { color:C.warning }]}>{t('warning_phrase')}</Text>
            </View>
            <View style={[styles.phraseBox, { backgroundColor:C.background, borderColor:C.border }]}>
              <Text style={[styles.phraseText, { color:C.text }]}>{recoveryPhrase}</Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor:C.card, borderColor:C.border }]}
              onPress={() => { Clipboard.setStringAsync(recoveryPhrase); Alert.alert(t('success'), t('phrase_copied')); }}
            >
              <Ionicons name="copy-outline" size={18} color={primaryColor} />
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
  container:    { padding:20, paddingBottom:20 },
  header:       { flexDirection:'row', alignItems:'center', marginBottom:28, gap:12 },
  backBtn:      { width:40, height:40, borderRadius:12, justifyContent:'center', alignItems:'center', shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.02, shadowRadius:4, elevation:1 },
  headerCenter: { flex:1, alignItems: 'flex-start' },
  headerTitle:  { fontSize:28, fontWeight:'800', letterSpacing:-0.5 },
  headerSub:    { fontSize:13, marginTop:2 },
  section:      { marginBottom:24 },
  sectionTitle: { fontSize:12, fontWeight:'600', marginBottom:10, letterSpacing:1 },
  
  // الحاويات المدمجة الحديثة للإعدادات (Solflare Style Grouping)
  groupContainer: { borderRadius:18, borderWidth:1, overflow:'hidden', elevation:1, shadowOffset:{width:0,height:2}, shadowOpacity:0.02, shadowRadius:4 },
  innerDivider: { height:1, marginHorizontal:16 },
  
  item:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:14, backgroundColor:'transparent' },
  itemLeft:     { flexDirection:'row', alignItems:'center', flex:1 },
  iconWrap:     { width:38, height:36, borderRadius:10, justifyContent:'center', alignItems:'center', marginRight:12 },
  itemText:     { flex:1, alignItems: 'flex-start' },
  itemTitle:    { fontSize:15, fontWeight:'700', marginBottom:2 },
  itemSub:      { fontSize:11 },
  langBadge:    { paddingHorizontal:10, paddingVertical:4, borderRadius:10 },
  langText:     { fontSize:11, fontWeight:'700' },
  colorDot:     { width:20, height:20, borderRadius:10, marginRight:6 },
  version:      { alignItems:'center', marginTop:16, padding:16 },
  versionTxt:   { fontSize:11, fontWeight: '600' },
  
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center', padding:20 },
  modalBox:     { width:'100%', borderRadius:20, padding:20, elevation:10 },
  safetyBox:    { width:'100%', borderRadius:20, padding:20, maxHeight:'80%' },
  modalHeader:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  modalTitle:   { fontSize:18, fontWeight:'800' },
  colorsGrid:   { flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', marginBottom:16 },
  colorItem:    { width:'23%', aspectRatio:1, marginBottom:10 },
  colorCircle:  { width:'100%', height:'100%', borderRadius:50, justifyContent:'center', alignItems:'center' },
  colorHint:    { fontSize:11, textAlign:'center', marginTop:6 },
  warningBox:   { flexDirection:'row', alignItems:'center', padding:14, borderRadius:12, borderWidth:1, marginBottom:16, gap:10 },
  warningTxt:   { flex:1, fontSize:13, fontWeight:'600' },
  phraseBox:    { width:'100%', padding:14, borderRadius:12, borderWidth:1, marginBottom:16 },
  phraseText:   { fontFamily:Platform.OS==='ios'?'Courier':'monospace', fontSize:13 },
  copyBtn:      { flexDirection:'row', alignItems:'center', justifyContent:'center', padding:12, borderRadius:10, borderWidth:1, gap:6, marginBottom:10 },
  copyBtnTxt:   { fontSize:15, fontWeight:'700' },
  closeBtn:     { paddingVertical:14, borderRadius:10, alignItems:'center' },
  closeBtnTxt:  { color:'#FFF', fontSize:15, fontWeight:'800' },
});
