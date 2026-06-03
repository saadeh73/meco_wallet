// components/WalletConnectSignModal.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, Dimensions, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { WCEvents } from '../services/walletConnectService';

const { height } = Dimensions.get('window');

const METHOD_INFO = {
  solana_signMessage:            { icon: 'pencil',           color: '#6366F1' },
  solana_signTransaction:        { icon: 'document-text',    color: '#F59E0B' },
  solana_signAndSendTransaction: { icon: 'paper-plane',      color: '#10B981' },
};

export default function WalletConnectSignModal() {
  const { t }        = useTranslation();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';

  const [visible,   setVisible]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [request,   setRequest]   = useState(null);
  const slideAnim = useRef(new Animated.Value(height)).current;

  const C = {
    bg:       isDark ? '#0A0A0F' : '#FFFFFF',
    overlay:  'rgba(0,0,0,0.65)',
    card:     isDark ? '#1A1A2E' : '#F8F9FF',
    text:     isDark ? '#FFFFFF' : '#1A1A2E',
    secondary:isDark ? '#A0A0B0' : '#6B7280',
    border:   isDark ? '#2A2A3E' : '#E5E7EB',
    success:  '#10B981',
    error:    '#EF4444',
    warning:  '#F59E0B',
  };

  // ✅ استمع لحدث التوقيع من walletConnectService
  useEffect(() => {
    WCEvents.on('sign_request', (data) => {
      setRequest(data);
      setVisible(true);
      setLoading(false);
      Animated.spring(slideAnim, {
        toValue:        0,
        useNativeDriver: true,
        damping:        20,
        stiffness:      180,
      }).start();
    });
    return () => WCEvents.off('sign_request');
  }, []);

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue:        height,
      duration:       250,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setRequest(null);
      setLoading(false);
    });
  };

  const handleApprove = async () => {
    if (!request) return;
    setLoading(true);
    try {
      await request.onApprove();
    } finally {
      closeModal();
    }
  };

  const handleReject = () => {
    if (!request) return;
    request.onReject();
    closeModal();
  };

  if (!visible || !request) return null;

  const methodInfo = METHOD_INFO[request.method] || { icon: 'shield-checkmark', color: primaryColor };

  const getMethodLabel = () => {
    switch (request.method) {
      case 'solana_signMessage':            return t('walletConnect.method_sign_message');
      case 'solana_signTransaction':        return t('walletConnect.method_sign_tx');
      case 'solana_signAndSendTransaction': return t('walletConnect.method_sign_send_tx');
      default: return request.method;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleReject}>
      <View style={[S.overlay, { backgroundColor: C.overlay }]}>
        <Animated.View
          style={[S.sheet, { backgroundColor: C.bg, transform: [{ translateY: slideAnim }] }]}
        >
          {/* Handle */}
          <View style={[S.handle, { backgroundColor: C.border }]} />

          {/* App Info */}
          <View style={[S.appRow, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[S.appIconWrap, { backgroundColor: methodInfo.color + '20' }]}>
              {request.appIcon ? (
                <Image source={{ uri: request.appIcon }} style={S.appIcon} />
              ) : (
                <Ionicons name="globe-outline" size={28} color={methodInfo.color} />
              )}
            </View>
            <View style={S.appInfo}>
              <Text style={[S.appName, { color: C.text }]}>{request.appName}</Text>
              <Text style={[S.appUrl,  { color: C.secondary }]} numberOfLines={1}>
                {request.appUrl?.replace(/^https?:\/\//, '')}
              </Text>
            </View>
            <View style={[S.appBadge, { backgroundColor: '#10B981' + '20' }]}>
              <View style={[S.appBadgeDot, { backgroundColor: '#10B981' }]} />
              <Text style={[S.appBadgeTxt, { color: '#10B981' }]}>WC2</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={[S.title, { color: C.text }]}>
            {t('walletConnect.review_transaction')}
          </Text>
          <Text style={[S.subtitle, { color: C.secondary }]}>
            {t('walletConnect.app_requesting')}
          </Text>

          {/* Method Card */}
          <View style={[S.methodCard, { backgroundColor: C.card, borderColor: methodInfo.color + '40' }]}>
            <View style={[S.methodIconWrap, { backgroundColor: methodInfo.color + '15' }]}>
              <Ionicons name={methodInfo.icon} size={24} color={methodInfo.color} />
            </View>
            <View style={S.methodInfo}>
              <Text style={[S.methodLabel, { color: C.secondary }]}>
                {t('walletConnect.sign_request')}
              </Text>
              <Text style={[S.methodValue, { color: C.text }]}>
                {getMethodLabel()}
              </Text>
            </View>
            <View style={[S.methodBadge, { backgroundColor: methodInfo.color + '15' }]}>
              <Ionicons name="checkmark-circle" size={18} color={methodInfo.color} />
            </View>
          </View>

          {/* Details */}
          {request.details?.instructionCount > 0 && (
            <View style={[S.detailsCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={S.detailRow}>
                <Text style={[S.detailLabel, { color: C.secondary }]}>
                  <Ionicons name="list-outline" size={13} /> {' '}
                  عدد التعليمات
                </Text>
                <Text style={[S.detailValue, { color: C.text }]}>
                  {request.details.instructionCount}
                </Text>
              </View>
              {request.details.programs?.length > 0 && (
                <View style={[S.detailRow, { borderTopWidth: 1, borderTopColor: C.border, marginTop: 8, paddingTop: 8 }]}>
                  <Text style={[S.detailLabel, { color: C.secondary }]}>
                    <Ionicons name="code-slash-outline" size={13} /> {' '}
                    البرامج
                  </Text>
                  <Text style={[S.detailValue, { color: C.text, fontSize: 11 }]}>
                    {request.details.programs.join(' · ')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Warning */}
          <View style={[S.warningRow, { backgroundColor: C.warning + '12', borderColor: C.warning + '30' }]}>
            <Ionicons name="warning-outline" size={16} color={C.warning} />
            <Text style={[S.warningTxt, { color: C.warning }]}>
              تأكد من موثوقية التطبيق قبل الموافقة
            </Text>
          </View>

          {/* Buttons */}
          <View style={S.buttonsRow}>
            <TouchableOpacity
              style={[S.rejectBtn, { borderColor: C.error + '60' }]}
              onPress={handleReject}
              disabled={loading}
            >
              <Ionicons name="close-circle-outline" size={20} color={C.error} />
              <Text style={[S.rejectTxt, { color: C.error }]}>{t('walletConnect.reject')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[S.approveBtn, { backgroundColor: loading ? '#10B98180' : '#10B981' }]}
              onPress={handleApprove}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                  <Text style={S.approveTxt}>{t('walletConnect.approve')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay:       { flex: 1, justifyContent: 'flex-end' },
  sheet:         { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingTop: 12, paddingBottom: 40 },
  handle:        { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 24 },

  appRow:        { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, marginBottom: 20, gap: 12 },
  appIconWrap:   { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  appIcon:       { width: 40, height: 40, borderRadius: 12 },
  appInfo:       { flex: 1 },
  appName:       { fontSize: 16, fontWeight: '800' },
  appUrl:        { fontSize: 12, marginTop: 2 },
  appBadge:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, gap: 4 },
  appBadgeDot:   { width: 6, height: 6, borderRadius: 3 },
  appBadgeTxt:   { fontSize: 11, fontWeight: '700' },

  title:         { fontSize: 22, fontWeight: '900', marginBottom: 4 },
  subtitle:      { fontSize: 14, marginBottom: 20 },

  methodCard:    { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, borderWidth: 1.5, marginBottom: 12, gap: 14 },
  methodIconWrap:{ width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  methodInfo:    { flex: 1 },
  methodLabel:   { fontSize: 12, fontWeight: '500', marginBottom: 3 },
  methodValue:   { fontSize: 16, fontWeight: '700' },
  methodBadge:   { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

  detailsCard:   { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  detailRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel:   { fontSize: 13 },
  detailValue:   { fontSize: 13, fontWeight: '600' },

  warningRow:    { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 24, gap: 8 },
  warningTxt:    { flex: 1, fontSize: 13, fontWeight: '600' },

  buttonsRow:    { flexDirection: 'row', gap: 12 },
  rejectBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18, borderWidth: 1.5, gap: 8 },
  rejectTxt:     { fontSize: 16, fontWeight: '700' },
  approveBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18, gap: 8 },
  approveTxt:    { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
