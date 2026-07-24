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
  solana_signMessage:            { icon: 'pencil',        color: '#6366F1' },
  solana_signTransaction:        { icon: 'document-text', color: '#F59E0B' },
  solana_signAndSendTransaction: { icon: 'paper-plane',   color: '#10B981' },
};

const OPERATION_STYLES = {
  create_pool:      { icon: 'layers',          color: '#06B6D4' },
  open_position:    { icon: 'water',           color: '#06B6D4' },
  add_liquidity:    { icon: 'add-circle',      color: '#06B6D4' },
  remove_liquidity: { icon: 'remove-circle',   color: '#F59E0B' },
  collect_fees:     { icon: 'cash',            color: '#10B981' },
  collect_reward:   { icon: 'gift',            color: '#10B981' },
  close_position:   { icon: 'close-circle',    color: '#EF4444' },
  swap:             { icon: 'swap-horizontal', color: '#8B5CF6' },
  transfer:         { icon: 'paper-plane',     color: '#10B981' },
};

// ✅ ربط كل نوع عملية بمفتاح ترجمة — لازم تتضاف فى i18n.js تحت walletConnect.* (موجودة تحت الرد)
const OPERATION_LABEL_KEYS = {
  create_pool:      'walletConnect.op_initialize_pool',
  open_position:    'walletConnect.op_open_position',
  add_liquidity:    'walletConnect.op_increase_liquidity',
  remove_liquidity: 'walletConnect.op_decrease_liquidity',
  collect_fees:     'walletConnect.op_collect_fees',
  collect_reward:   'walletConnect.op_collect_reward',
  close_position:   'walletConnect.op_close_position',
  swap:             'walletConnect.op_swap',
};

export default function WalletConnectSignModal() {
  const { t }        = useTranslation();
  const theme        = useAppStore(s => s.theme);
  const primaryColor = useAppStore(s => s.primaryColor || '#6C63FF');
  const isDark       = theme === 'dark';

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [request, setRequest] = useState(null);
  const slideAnim = useRef(new Animated.Value(height)).current;

  const C = {
    bg:        isDark ? '#0A0A0F' : '#FFFFFF',
    overlay:   'rgba(0,0,0,0.65)',
    card:      isDark ? '#1A1A2E' : '#F8F9FF',
    cardAlt:   isDark ? '#15152A' : '#F0F2FF',
    text:      isDark ? '#FFFFFF' : '#1A1A2E',
    secondary: isDark ? '#A0A0B0' : '#6B7280',
    border:    isDark ? '#2A2A3E' : '#E5E7EB',
    success:   '#10B981',
    error:     '#EF4444',
    warning:   '#F59E0B',
  };

  useEffect(() => {
    WCEvents.on('sign_request', (data) => {
      setRequest(data);
      setVisible(true);
      setLoading(false);
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, damping: 20, stiffness: 180,
      }).start();
    });
    return () => WCEvents.off('sign_request');
  }, []);

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: height, duration: 250, useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setRequest(null);
      setLoading(false);
    });
  };

  const handleApprove = async () => {
    if (!request) return;
    setLoading(true);
    try { await request.onApprove(); }
    finally { closeModal(); }
  };

  const handleReject = () => {
    if (!request) return;
    request.onReject();
    closeModal();
  };

  if (!visible || !request) return null;

  const operation  = request.operation;
  const opStyle    = operation?.type && OPERATION_STYLES[operation.type];
  const methodInfo = METHOD_INFO[request.method] || { icon: 'shield-checkmark', color: primaryColor };
  const heroIcon    = operation?.icon  || opStyle?.icon  || methodInfo.icon;
  const heroColor   = operation?.color || opStyle?.color || methodInfo.color;

  const getMethodLabel = () => {
    switch (request.method) {
      case 'solana_signMessage':            return t('walletConnect.method_sign_message');
      case 'solana_signTransaction':        return t('walletConnect.method_sign_tx');
      case 'solana_signAndSendTransaction': return t('walletConnect.method_sign_send_tx');
      default: return request.method;
    }
  };

  const opLabelKey   = operation?.type && OPERATION_LABEL_KEYS[operation.type];
  const heroTitle     = operation?.title || (opLabelKey ? t(opLabelKey) : null) || getMethodLabel();
  const summaryRows  = operation?.summary?.length ? operation.summary : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleReject}>
      <View style={[S.overlay, { backgroundColor: C.overlay }]}>
        <Animated.View style={[S.sheet, { backgroundColor: C.bg, transform: [{ translateY: slideAnim }] }]}>

          <View style={[S.handle, { backgroundColor: C.border }]} />

          <View style={[S.appRow, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[S.appIconWrap, { backgroundColor: heroColor + '20' }]}>
              {request.appIcon
                ? <Image source={{ uri: request.appIcon }} style={S.appIcon} />
                : <Ionicons name="globe-outline" size={26} color={heroColor} />}
            </View>
            <View style={S.appInfo}>
              <Text style={[S.appName, { color: C.text }]} numberOfLines={1}>{request.appName}</Text>
              <Text style={[S.appUrl, { color: C.secondary }]} numberOfLines={1}>
                {request.appUrl?.replace(/^https?:\/\//, '')}
              </Text>
            </View>
            <View style={[S.appBadge, { backgroundColor: C.success + '20' }]}>
              <View style={[S.appBadgeDot, { backgroundColor: C.success }]} />
              <Text style={[S.appBadgeTxt, { color: C.success }]}>WC2</Text>
            </View>
          </View>

          <View style={S.heroWrap}>
            <View style={[S.heroIconWrap, { backgroundColor: heroColor + '18', borderColor: heroColor + '40' }]}>
              <Ionicons name={heroIcon} size={30} color={heroColor} />
            </View>
            <Text style={[S.heroTitle, { color: C.text }]}>{heroTitle}</Text>
            <Text style={[S.heroSubtitle, { color: C.secondary }]}>
              {t('walletConnect.app_requesting')}
            </Text>
          </View>

          {summaryRows ? (
            <View style={[S.detailsCard, { backgroundColor: C.card, borderColor: C.border }]}>
              {summaryRows.map((row, i) => (
                <View
                  key={i}
                  style={[
                    S.detailRow,
                    i > 0 && { borderTopWidth: 1, borderTopColor: C.border, marginTop: 10, paddingTop: 10 },
                  ]}
                >
                  <Text style={[S.detailLabel, { color: C.secondary }]}>{row.label}</Text>
                  <Text style={[S.detailValue, { color: C.text }]} numberOfLines={1}>{row.value}</Text>
                </View>
              ))}
            </View>
          ) : request.details?.instructionCount > 0 && (
            <View style={[S.detailsCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={S.detailRow}>
                <Text style={[S.detailLabel, { color: C.secondary }]}>
                  <Ionicons name="list-outline" size={13} /> {t('walletConnect.instruction_count')}
                </Text>
                <Text style={[S.detailValue, { color: C.text }]}>{request.details.instructionCount}</Text>
              </View>
              {request.details.programs?.length > 0 && (
                <View style={[S.programsBlock, { borderTopWidth: 1, borderTopColor: C.border }]}>
                  <Text style={[S.detailLabel, { color: C.secondary, marginBottom: 8 }]}>
                    <Ionicons name="code-slash-outline" size={13} /> {t('walletConnect.programs_involved')}
                  </Text>
                  <View style={S.chipsRow}>
                    {request.details.programs.map((p, i) => (
                      <View key={i} style={[S.chip, { backgroundColor: C.cardAlt, borderColor: C.border }]}>
                        <Text style={[S.chipText, { color: C.text }]} numberOfLines={1}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {request.details?.estimatedFee != null && (
            <View style={[S.feeRow, { backgroundColor: C.cardAlt, borderColor: C.border }]}>
              <Text style={[S.detailLabel, { color: C.secondary }]}>
                <Ionicons name="flash-outline" size={13} /> {t('walletConnect.estimated_fee')}
              </Text>
              <Text style={[S.detailValue, { color: C.text }]}>{request.details.estimatedFee} SOL</Text>
            </View>
          )}

          <View style={[S.warningRow, { backgroundColor: C.warning + '12', borderColor: C.warning + '30' }]}>
            <Ionicons name="warning-outline" size={16} color={C.warning} />
            <Text style={[S.warningTxt, { color: C.warning }]}>
              {t('walletConnect.trust_warning')}
            </Text>
          </View>

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
              style={[S.approveBtn, { backgroundColor: loading ? C.success + '80' : C.success }]}
              onPress={handleApprove}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" size="small" />
                : (<>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                    <Text style={S.approveTxt}>{t('walletConnect.approve')}</Text>
                  </>)}
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingTop: 12, paddingBottom: 40 },
  handle:  { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 20 },

  appRow:      { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 20, gap: 10 },
  appIconWrap: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  appIcon:     { width: 34, height: 34, borderRadius: 10 },
  appInfo:     { flex: 1 },
  appName:     { fontSize: 15, fontWeight: '800' },
  appUrl:      { fontSize: 12, marginTop: 2 },
  appBadge:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, gap: 4 },
  appBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  appBadgeTxt: { fontSize: 11, fontWeight: '700' },

  heroWrap:     { alignItems: 'center', marginBottom: 20 },
  heroIconWrap: { width: 64, height: 64, borderRadius: 20, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  heroTitle:    { fontSize: 21, fontWeight: '900', textAlign: 'center' },
  heroSubtitle: { fontSize: 13, marginTop: 4, textAlign: 'center' },

  detailsCard: { padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: '700', maxWidth: '55%' },

  programsBlock: { marginTop: 10, paddingTop: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, maxWidth: 160 },
  chipText: { fontSize: 11, fontWeight: '600' },

  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },

  warningRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 22, gap: 8 },
  warningTxt: { flex: 1, fontSize: 13, fontWeight: '600' },

  buttonsRow: { flexDirection: 'row', gap: 12 },
  rejectBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18, borderWidth: 1.5, gap: 8 },
  rejectTxt:  { fontSize: 16, fontWeight: '700' },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 18, gap: 8 },
  approveTxt: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
