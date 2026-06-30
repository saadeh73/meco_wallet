// screens/QRScannerScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  Dimensions, ActivityIndicator, Platform
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // ✅ استيراد لحساب هوامش الأمان
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { pairWalletConnect } from '../services/walletConnectService';

const { width } = Dimensions.get('window');

export default function QRScannerScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets(); // جلب مسافات الأمان للهاتف

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);

  const colors = {
    background: isDark ? '#07070F' : '#F4F5F9',
    text: isDark ? '#EEEEFF' : '#1C1C24',
    textSecondary: isDark ? '#7E7EAA' : '#8A8A9E',
    card: isDark ? '#111122' : '#FFFFFF',
    border: isDark ? '#1E1E38' : '#E8E8F2',
  };

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission]);

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || processingImage) return;
    setScanned(true);
    await processScannedData(data);
  };

  // ✅ الموجّه الذكي: يفرق بين ربط Web3 وإرسال الأموال
  const processScannedData = async (data) => {
    if (!data) return;

    if (data.startsWith('wc:')) {
      Alert.alert(
        t('web3.connecting', 'جاري الاتصال 🌐'),
        t('web3.wait_secure_session', 'برجاء الانتظار لحظات لإنشاء جلسة آمنة...'),
        [{
          text: t('ok', 'حسناً'),
          onPress: async () => {
            try {
              await pairWalletConnect(data);
              navigation.goBack();
            } catch (error) {
              setScanned(false);
            }
          }
        }]
      );
      return;
    }

    const isValidAddress = data.length >= 32 && data.length <= 44 && !data.includes(' ');
    if (isValidAddress) {
      Alert.alert(t('qr_scanner.success', 'تم المسح بنجاح'), t('qr_scanner.address_found', 'تم العثور على عنوان محفظة'), [
        { text: t('cancel', 'إلغاء'), style: 'cancel', onPress: () => setScanned(false) },
        { text: t('qr_scanner.use_address', 'استخدام العنوان'), onPress: () => navigation.navigate('Send', { scannedAddress: data }) }
      ]);
      return;
    } 
    
    Alert.alert(t('error', 'خطأ'), t('qr_scanner.invalid_address', 'هذا الرمز لا يحتوي على عنوان محفظة أو رابط ربط صالح.'));
    setScanned(false);
  };

  // ✅ دالة قراءة الـ QR من الصورة باستخدام خدمة سحابية
  const decodeQRFromImage = async (imageUri) => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'qr_code.jpg',
      });

      const response = await fetch('https://api.qrserver.com/v1/read-qr-code/', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = await response.json();
      
      if (data && data[0] && data[0].symbol && data[0].symbol[0].data) {
        return data[0].symbol[0].data;
      }
      return null;
    } catch (error) {
      console.warn('QR Decode Error:', error);
      return null;
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('error', 'خطأ'), t('qr_scanner.no_permission', 'لا يوجد إذن للوصول إلى الصور'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length > 0) {
        setProcessingImage(true);
        const imageUri = result.assets[0].uri;

        const qrText = await decodeQRFromImage(imageUri);

        if (qrText) {
          await processScannedData(qrText);
        } else {
          Alert.alert(t('error', 'تنبيه'), 'لم يتم العثور على رمز QR واضح في هذه الصورة. يرجى التأكد من وضوح الصورة والمحاولة مجدداً.');
        }
      }
    } catch (error) {
      console.warn('Image pick error:', error);
      Alert.alert(t('error', 'خطأ'), 'حدث خطأ غير متوقع أثناء معالجة الصورة.');
    } finally {
      setProcessingImage(false);
      setScanned(false);
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.text, { color: colors.textSecondary, marginTop: 12 }]}>{t('qr_scanner.requesting', 'جاري طلب الإذن...')}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Ionicons name="camera-off" size={54} color={colors.textSecondary} />
        <Text style={[styles.text, { color: colors.text, marginTop: 16, fontWeight: '700' }]}>{t('qr_scanner.no_permission', 'لا يوجد إذن للكاميرا')}</Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor, marginTop: 20 }]} onPress={requestPermission}>
          <Text style={styles.buttonText}>{t('qr_scanner.grant', 'منح الإذن')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      
      {/* ── هيدر الشاشة العلوي المتناسق والآمن ── */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 10, paddingBottom: 14 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('qr_scanner.title', 'مسح رمز QR')}</Text>
        
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={pickImage}
            style={[styles.torchButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
            disabled={processingImage}
          >
            {processingImage ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <Ionicons name="image-outline" size={18} color={colors.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTorch(!torch)} style={[styles.torchButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Ionicons name={torch ? 'flash' : 'flash-off'} size={18} color={torch ? primaryColor : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* حاوي الكاميرا الهندسي الأنيق */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned || processingImage ? undefined : handleBarCodeScanned}
        >
          <View style={styles.overlay}>
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.cornerTopLeft, { borderColor: primaryColor }]} />
              <View style={[styles.corner, styles.cornerTopRight, { borderColor: primaryColor }]} />
              <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: primaryColor }]} />
              <View style={[styles.corner, styles.cornerBottomRight, { borderColor: primaryColor }]} />
            </View>
          </View>
        </CameraView>
      </View>

      {/* تعليمات المسح السفلية الآمنة */}
      <View style={[styles.instructions, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, marginBottom: insets.bottom > 0 ? insets.bottom + 16 : 20 }]}>
        <Ionicons name="qr-code" size={16} color={primaryColor} />
        <Text style={[styles.instructionsText, { color: colors.textSecondary }]}>
          {t('qr_scanner.instructions', 'ضع رمز QR داخل الإطار للمسح، أو اختر صورة من الألبوم')}
        </Text>
      </View>

      {/* زر إعادة المسح الآمن والطفيف من الأسفل */}
      {scanned && !processingImage && (
        <TouchableOpacity style={[styles.rescanButton, { backgroundColor: primaryColor, bottom: insets.bottom > 0 ? insets.bottom + 80 : 100 }]} onPress={() => setScanned(false)}>
          <Text style={styles.rescanButtonText}>{t('qr_scanner.rescan', 'مسح مرة أخرى')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 8 },
  torchButton: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  text: { fontSize: 14, textAlign: 'center' },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  
  cameraContainer: { flex: 1, overflow: 'hidden', borderRadius: 20, margin: 20 },
  camera: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  scanArea: { width: width * 0.65, height: width * 0.65, backgroundColor: 'transparent', position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderWidth: 3 },
  cornerTopLeft: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTopRight: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBottomLeft: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBottomRight: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  
  instructions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, marginHorizontal: 20, borderRadius: 14, gap: 6 },
  instructionsText: { fontSize: 12, textAlign: 'center', fontWeight: '600' },
  rescanButton: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  rescanButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
