import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
  Image, Dimensions, Modal, Linking
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import * as web3 from '@solana/web3.js';
import bs58 from 'bs58';
import { getSolBalance, getCurrentNetworkFee } from '../services/heliusService';

const { width } = Dimensions.get('window');

// =============================================
// ⚙️ إعدادات البيع المسبق
// =============================================
const PRESALE_WALLET_ADDRESS = 'E9repjjKBq3RVLw1qckrG15gKth63fe98AHCSgXZzKvY';
const FEE_COLLECTOR_ADDRESS = 'HXkEZSKictbSYan9ZxQGaHpFrbA4eLDyNtEDxVBkdFy6';
const SUPPORT_TELEGRAM_URL = 'https://t.me/monycoin1';

const RATE_MECO_PER_SOL = 125000; 
const MIN_BUY_SOL = 0.03;
const MAX_BUY_SOL = 2.0;
const SERVICE_FEE_SOL = 0.0005;

export default function PresaleScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const theme = useAppStore(state => state.theme);
  const primaryColor = useAppStore(state => state.primaryColor || '#6C63FF');
  const isDark = theme === 'dark';

  const colors = {
    background: isDark ? '#0A0A0F' : '#FFFFFF',
    card: isDark ? '#1A1A2E' : '#F8FAFD',
    text: isDark ? '#FFFFFF' : '#1A1A2E',
    textSecondary: isDark ? '#A0A0B0' : '#6B7280',
    border: isDark ? '#2A2A3E' : '#E5E7EB',
    inputBackground: isDark ? '#2A2A3E' : '#FFFFFF',
    error: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    telegram: '#229ED9'
  };

  const [amountSol, setAmountSol] = useState('');
  const [amountMeco, setAmountMeco] = useState('0');
  const [loading, setLoading] = useState(false);
  const [balanceSol, setBalanceSol] = useState(0);
  const [networkFee, setNetworkFee] = useState(0.000005);
  
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastTxSignature, setLastTxSignature] = useState('');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const bal = await getSolBalance();
      setBalanceSol(bal);
      const fee = await getCurrentNetworkFee();
      setNetworkFee(fee);
    } catch (error) {
      console.log('Error loading data', error);
    }
  };

  const handleSolChange = (text) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return;

    setAmountSol(cleaned);

    const val = parseFloat(cleaned);
    if (!isNaN(val)) {
      const mecoVal = val * RATE_MECO_PER_SOL;
      setAmountMeco(mecoVal.toLocaleString('en-US')); 
    } else {
      setAmountMeco('0');
    }
  };

  const handleMax = () => {
    const totalFees = networkFee + SERVICE_FEE_SOL + 0.00001; 
    const maxUserCanPay = Math.max(0, balanceSol - totalFees);
    const finalMax = Math.min(maxUserCanPay, MAX_BUY_SOL);
    
    if (finalMax <= 0) {
      Alert.alert(t('presaleScreen.alerts.title_warning'), t('presaleScreen.alerts.balance_low_limit'));
      return;
    }

    handleSolChange(finalMax.toFixed(4));
  };

  const handleBuyPresale = async () => {
    const solAmount = parseFloat(amountSol);

    if (isNaN(solAmount) || solAmount <= 0) 
      return Alert.alert(t('presaleScreen.alerts.title_error'), t('presaleScreen.alerts.invalid_amount'));
    
    if (solAmount < MIN_BUY_SOL) 
      return Alert.alert(t('presaleScreen.alerts.title_error'), t('presaleScreen.alerts.min_error', { amount: MIN_BUY_SOL }));
    
    if (solAmount > MAX_BUY_SOL) 
      return Alert.alert(t('presaleScreen.alerts.title_error'), t('presaleScreen.alerts.max_error', { amount: MAX_BUY_SOL }));

    const totalRequired = solAmount + networkFee + SERVICE_FEE_SOL;
    
    if (totalRequired > balanceSol) {
      Alert.alert(
        t('presaleScreen.alerts.title_insufficient'), 
        t('presaleScreen.alerts.insufficient_msg', { 
          required: totalRequired.toFixed(5), 
          balance: balanceSol.toFixed(5) 
        })
      );
      return;
    }

    if (PRESALE_WALLET_ADDRESS === 'PUT_YOUR_PROJECT_WALLET_ADDRESS_HERE') {
      Alert.alert('Error', t('presaleScreen.alerts.config_error'));
      return;
    }

    setLoading(true);

    try {
      const secretKeyStr = await SecureStore.getItemAsync('wallet_private_key');
      if (!secretKeyStr) throw new Error(t('presaleScreen.alerts.private_key_error'));

      let secretKey;
      if (secretKeyStr.startsWith('[')) {
        secretKey = new Uint8Array(JSON.parse(secretKeyStr));
      } else {
        secretKey = bs58.decode(secretKeyStr);
      }
      const keypair = web3.Keypair.fromSecretKey(secretKey);

      const connection = new web3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const transaction = new web3.Transaction();

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;

      transaction.add(
        web3.SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new web3.PublicKey(PRESALE_WALLET_ADDRESS),
          lamports: Math.floor(solAmount * web3.LAMPORTS_PER_SOL),
        })
      );

      transaction.add(
        web3.SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new web3.PublicKey(FEE_COLLECTOR_ADDRESS),
          lamports: Math.floor(SERVICE_FEE_SOL * web3.LAMPORTS_PER_SOL),
        })
      );

      const signature = await web3.sendAndConfirmTransaction(
        connection,
        transaction,
        [keypair],
        { commitment: 'confirmed' }
      );

      console.log('Presale Success:', signature);
      setLastTxSignature(signature);
      
      setShowSuccessModal(true);
      
      setAmountSol('');
      setAmountMeco('0');
      loadUserData();

    } catch (error) {
      console.error('Presale Error:', error);
      Alert.alert(t('presaleScreen.alerts.title_failed'), error.message || t('presaleScreen.alerts.generic_error'));
    } finally {
      setLoading(false);
    }
  };

  const openTelegramSupport = () => {
    Linking.openURL(SUPPORT_TELEGRAM_URL).catch(err => {
      Alert.alert(t('presaleScreen.alerts.title_error'), 'Cannot open Telegram');
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('presaleScreen.header_title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: primaryColor }]}>
          <Text style={styles.infoTitle}>{t('presaleScreen.offer_title')}</Text>
          <Text style={styles.infoRate}>{t('presaleScreen.rate_label')}</Text>
          <View style={styles.limitsContainer}>
             <View style={styles.limitBadge}>
               <Text style={styles.limitText}>{t('presaleScreen.min_badge', { amount: MIN_BUY_SOL })}</Text>
             </View>
             <View style={styles.limitBadge}>
               <Text style={styles.limitText}>{t('presaleScreen.max_badge', { amount: MAX_BUY_SOL })}</Text>
             </View>
          </View>
        </View>

        {/* Input Section */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('presaleScreen.label_you_pay')}</Text>
          
          <View style={[styles.inputContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
            <Image 
              source={{ uri: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' }} 
              style={styles.coinIcon} 
            />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={amountSol}
              onChangeText={handleSolChange}
            />
            <TouchableOpacity onPress={handleMax}>
              <Text style={[styles.maxBtn, { color: primaryColor }]}>{t('max')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.balanceContainer}>
            <Text style={[styles.balanceText, { color: colors.textSecondary }]}>
              {t('presaleScreen.your_balance', { amount: balanceSol.toFixed(4) })}
            </Text>
          </View>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <View style={[styles.arrowIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="arrow-down" size={20} color={primaryColor} />
            </View>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('presaleScreen.label_you_receive')}</Text>
          
          <View style={[styles.inputContainer, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
            <Image 
              source={{ uri: 'https://raw.githubusercontent.com/MonyCoin/meco-token/refs/heads/main/meco-logo.png' }} 
              style={styles.coinIcon} 
            />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={amountMeco}
              editable={false}
            />
            <Text style={[styles.tickerText, { color: colors.textSecondary }]}>MECO</Text>
          </View>
          
          {/* Fee Info */}
          <View style={{marginTop: 12, flexDirection: 'row', justifyContent: 'space-between'}}>
             <Text style={[styles.feeText, { color: colors.textSecondary }]}>{t('presaleScreen.fee_label')}</Text>
             <Text style={[styles.feeText, { color: colors.text }]}>~{(networkFee + SERVICE_FEE_SOL).toFixed(5)} SOL</Text>
          </View>

          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            {t('presaleScreen.note_footer')}
          </Text>

        </View>

        {/* Buy Button */}
        <TouchableOpacity
          style={[
            styles.buyButton,
            { 
              backgroundColor: (!amountSol || loading) ? colors.border : primaryColor,
              opacity: (!amountSol || loading) ? 0.7 : 1
            }
          ]}
          disabled={!amountSol || loading}
          onPress={handleBuyPresale}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buyButtonText}>{t('presaleScreen.buy_btn')}</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* ✅ نافذة النجاح (Custom Success Modal) */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            
            <View style={styles.successIconContainer}>
               <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            </View>

            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t('presaleScreen.modal.title_success')}
            </Text>

            <View style={[styles.instructionsBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
               <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
                 {t('presaleScreen.modal.instruction_title')}
               </Text>
               <Text style={[styles.instructionItem, { color: colors.text }]}>{t('presaleScreen.modal.instruction_1')}</Text>
               <Text style={[styles.instructionItem, { color: colors.text }]}>{t('presaleScreen.modal.instruction_2')}</Text>
            </View>

            <Text style={[styles.verifyNote, { color: colors.textSecondary }]}>
              {t('presaleScreen.modal.verify_note')}
            </Text>

            <View style={[styles.warningBox, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}>
               <Text style={[styles.warningText, { color: colors.warning }]}>{t('presaleScreen.modal.warning_1')}</Text>
               <Text style={[styles.warningText, { color: colors.warning }]}>{t('presaleScreen.modal.warning_2')}</Text>
            </View>
            
            <Text style={[styles.teamSignature, { color: colors.textSecondary }]}>{t('presaleScreen.modal.team_signature')}</Text>

            <TouchableOpacity 
              style={[styles.telegramButton, { backgroundColor: colors.telegram }]}
              onPress={openTelegramSupport}
            >
              <Ionicons name="paper-plane" size={20} color="#FFF" style={{marginRight: 8}} />
              <Text style={styles.telegramButtonText}>{t('presaleScreen.modal.contact_dev')}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>{t('presaleScreen.modal.close')}</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

// =============================================
// 🎨 Styles
// =============================================
const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  backButton: { padding: 8 },
  infoCard: { borderRadius: 20, padding: 24, marginBottom: 24, alignItems: 'center', elevation: 6 },
  infoTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 8, opacity: 0.9 },
  infoRate: { color: '#FFF', fontSize: 28, fontWeight: 'bold', marginBottom: 16 },
  limitsContainer: { flexDirection: 'row', gap: 10 },
  limitBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  limitText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 20, padding: 20, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginLeft: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, height: 60 },
  coinIcon: { width: 32, height: 32, borderRadius: 16, marginRight: 12 },
  input: { flex: 1, fontSize: 20, fontWeight: 'bold', height: '100%' },
  maxBtn: { fontSize: 14, fontWeight: 'bold', marginLeft: 10 },
  tickerText: { fontSize: 16, fontWeight: '600', marginLeft: 10 },
  balanceContainer: { alignItems: 'flex-end', marginTop: 8, marginRight: 4 },
  balanceText: { fontSize: 12 },
  feeText: { fontSize: 12, fontWeight: '500' },
  dividerContainer: { alignItems: 'center', justifyContent: 'center', height: 40, marginVertical: 4 },
  dividerLine: { width: '100%', height: 1, position: 'absolute' },
  arrowIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, zIndex: 1 },
  noteText: { fontSize: 12, textAlign: 'center', marginTop: 16, fontStyle: 'italic' },
  buyButton: { height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  buyButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 24, padding: 24, alignItems: 'center', elevation: 10 },
  successIconContainer: { marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  instructionsBox: { width: '100%', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16 },
  instructionText: { fontSize: 14, marginBottom: 8, fontWeight: '600', textAlign: 'right' },
  instructionItem: { fontSize: 14, marginBottom: 4, textAlign: 'right', fontWeight: '500' },
  verifyNote: { fontSize: 12, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  warningBox: { width: '100%', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  warningText: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  teamSignature: { fontSize: 14, fontWeight: 'bold', marginBottom: 20, fontStyle: 'italic' },
  telegramButton: { flexDirection: 'row', width: '100%', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  telegramButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  closeButton: { padding: 12 },
  closeButtonText: { fontSize: 16, fontWeight: '500' }
});
