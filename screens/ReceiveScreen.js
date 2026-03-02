import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert,
  SafeAreaView,
  ScrollView,
  Dimensions,
  Animated,
  Share,
  Vibration
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-styled';
import { logTransaction } from '../services/transactionLogger';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function ReceiveScreen() {
  const { theme, primaryColor } = useAppStore();
  const { t } = useTranslation();
  const [walletAddress, setWalletAddress] = useState('');
  const [logged, setLogged] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));
  const [copied, setCopied] = useState(false);

  const isDark = theme === 'dark';
  
  // Theme colors
  const colors = {
    background: isDark ? '#0A0A0F' : '#F8FAFD',
    card: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    success: '#10B981',
    warning: '#F59E0B',
  };

  useEffect(() => {
    // Entrance animations
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

    // Fetch wallet address
    SecureStore.getItemAsync('wallet_public_key')
      .then(async (addr) => {
        if (addr) {
          setWalletAddress(addr);

          if (!logged) {
            await logTransaction({
              type: 'receive',
              to: addr,
              timestamp: new Date().toISOString(),
              action: 'address_viewed'
            });
            setLogged(true);
          }
        }
      })
      .catch(console.log);
  }, [logged]);

  const copyToClipboard = async () => {
    if (!walletAddress) return;
    
    try {
      await Clipboard.setStringAsync(walletAddress);
      Vibration.vibrate(50); // Light vibration instead of Haptics
      
      setCopied(true);
      Alert.alert(t('success'), t('wallet_address_copied'));
      
      // Reset copy state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      Alert.alert(t('error'), t('copy_failed'));
    }
  };

  const shareAddress = async () => {
    if (!walletAddress) return;
    
    try {
      await Share.share({
        message: t('share_message_with_address', { address: walletAddress }),
        title: t('wallet_address')
      });
    } catch (error) {
      console.log('Share error:', error);
    }
  };

  const getTruncatedAddress = (address) => {
    if (!address) return '...';
    return `${address.substring(0, 12)}...${address.substring(address.length - 8)}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View 
          style={[
            styles.container, 
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('receive_crypto')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('share_to_receive')}
            </Text>
          </View>

          {/* Main QR Code Card */}
          <View style={[styles.qrCard, { backgroundColor: colors.card }]}>
            <View style={styles.qrHeader}>
              <Ionicons name="qr-code-outline" size={24} color={primaryColor} />
              <Text style={[styles.qrTitle, { color: colors.text }]}>
                {t('scan_to_receive')}
              </Text>
            </View>
            
            <View style={styles.qrContainer}>
              {walletAddress ? (
                <>
                  <QRCode
                    data={walletAddress}
                    size={width * 0.55}
                    color={colors.text}
                    bgColor={colors.card}
                    padding={16}
                    pieceSize={8}
                    pieceBorderRadius={4}
                    style={styles.qrCode}
                  />
                  
                  <View style={styles.qrHint}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                      {t('qr_hint')}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.loadingContainer}>
                  <Ionicons name="ellipsis-horizontal" size={40} color={colors.textSecondary} />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                    {t('loading_address')}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Address Card */}
          <View style={[styles.addressCard, { backgroundColor: colors.card }]}>
            <View style={styles.addressHeader}>
              <Ionicons name="wallet-outline" size={20} color={primaryColor} />
              <Text style={[styles.addressTitle, { color: colors.text }]}>
                {t('your_address')}
              </Text>
            </View>
            
            <View style={[styles.addressContainer, { backgroundColor: colors.background }]}>
              <Text style={[styles.addressText, { color: colors.text }]}>
                {getTruncatedAddress(walletAddress)}
              </Text>
            </View>
            
            <Text style={[styles.fullAddress, { color: colors.textSecondary }]}>
              {walletAddress || '...'}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.copyButton,
                { 
                  backgroundColor: copied ? colors.success : primaryColor,
                  borderColor: copied ? colors.success : primaryColor
                }
              ]}
              onPress={copyToClipboard}
              disabled={!walletAddress}
            >
              <Ionicons 
                name={copied ? "checkmark" : "copy-outline"} 
                size={20} 
                color="#FFFFFF" 
              />
              <Text style={styles.actionButtonText}>
                {copied ? t('copied') : t('copy_address')}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.shareButton,
                { 
                  backgroundColor: colors.card,
                  borderColor: colors.border
                }
              ]}
              onPress={shareAddress}
              disabled={!walletAddress}
            >
              <Ionicons name="share-outline" size={20} color={colors.text} />
              <Text style={[styles.shareButtonText, { color: colors.text }]}>
                {t('share_address')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Security Tips */}
          <View style={[styles.securityCard, { backgroundColor: colors.card }]}>
            <View style={styles.securityHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.warning} />
              <Text style={[styles.securityTitle, { color: colors.text }]}>
                {t('security_tips')}
              </Text>
            </View>
            
            <View style={styles.securityTips}>
              <View style={styles.tipItem}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                  {t('tip1')}
                </Text>
              </View>
              
              <View style={styles.tipItem}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                  {t('tip2')}
                </Text>
              </View>
              
              <View style={styles.tipItem}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                  {t('tip3')}
                </Text>
              </View>
            </View>
          </View>

          {/* Bottom Note */}
          <View style={styles.footerNote}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>
              {t('transaction_time_note')}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  container: {
    flex: 1,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
  },
  qrCard: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 10,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  qrCode: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  qrHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  hintText: {
    fontSize: 12,
    marginLeft: 6,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  addressCard: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  addressTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  addressContainer: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  addressText: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  fullAddress: {
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'monospace',
    lineHeight: 16,
    opacity: 0.7,
  },
  actionsContainer: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  copyButton: {
    backgroundColor: '#007AFF',
  },
  shareButton: {
    backgroundColor: '#FFFFFF',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  securityCard: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  securityTips: {
    gap: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tipText: {
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 10,
    flex: 1,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  noteText: {
    fontSize: 12,
    marginLeft: 6,
    textAlign: 'center',
  },
});
