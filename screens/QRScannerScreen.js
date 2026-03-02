import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';

const { width } = Dimensions.get('window');

export default function QRScannerScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);

  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
  };

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission]);

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    
    setScanned(true);
    
    // التحقق من أن البيانات هي عنوان Solana صالح (تبدأ بـ 32-44 حرف)
    const isValidAddress = data && data.length >= 32 && data.length <= 44;
    
    if (isValidAddress) {
      Alert.alert(
        t('qr_scanner.success'),
        t('qr_scanner.address_found'),
        [
          {
            text: t('cancel'),
            style: 'cancel',
            onPress: () => {
              setScanned(false);
            }
          },
          {
            text: t('qr_scanner.use_address'),
            onPress: () => {
              // إرجاع العنوان إلى الشاشة السابقة
              navigation.navigate('Send', { scannedAddress: data });
            }
          }
        ]
      );
    } else {
      Alert.alert(
        t('qr_scanner.invalid'),
        t('qr_scanner.invalid_address'),
        [
          {
            text: t('ok'),
            onPress: () => setScanned(false)
          }
        ]
      );
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.text, { color: colors.text }]}>
            {t('qr_scanner.requesting')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Ionicons name="camera-off" size={64} color={colors.textSecondary} />
          <Text style={[styles.text, { color: colors.text, marginTop: 16 }]}>
            {t('qr_scanner.no_permission')}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: primaryColor, marginTop: 20 }]}
            onPress={requestPermission}
          >
            <Text style={styles.buttonText}>{t('qr_scanner.grant')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: colors.card }]}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('qr_scanner.title')}
        </Text>
        <TouchableOpacity
          onPress={() => setTorch(!torch)}
          style={[styles.torchButton, { backgroundColor: colors.card }]}
        >
          <Ionicons
            name={torch ? 'flash' : 'flash-off'}
            size={24}
            color={torch ? primaryColor : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Scanner */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        >
          {/* المسح الإطاري */}
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

      {/* Instructions */}
      <View style={[styles.instructions, { backgroundColor: colors.card }]}>
        <Ionicons name="qr-code" size={20} color={primaryColor} />
        <Text style={[styles.instructionsText, { color: colors.textSecondary }]}>
          {t('qr_scanner.instructions')}
        </Text>
      </View>

      {/* Rescan Button (if scanned) */}
      {scanned && (
        <TouchableOpacity
          style={[styles.rescanButton, { backgroundColor: primaryColor }]}
          onPress={() => setScanned(false)}
        >
          <Text style={styles.rescanButtonText}>{t('qr_scanner.rescan')}</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  torchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 24,
    margin: 20,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: width * 0.7,
    height: width * 0.7,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderWidth: 3,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    gap: 8,
  },
  instructionsText: {
    fontSize: 14,
    textAlign: 'center',
  },
  rescanButton: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  rescanButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
