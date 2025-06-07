import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';

export default function WalletScreen({ navigation }) {
  const [publicKey, setPublicKey] = useState('');
  const [balance, setBalance] = useState('0.00');

  const tokens = [
    { name: 'SOL', balance: '0.00' },
    { name: 'MECO', balance: '0.00' },
    { name: 'USDT', balance: '0.00' },
    { name: 'BONK', balance: '0.00' },
  ];

  useEffect(() => {
    const loadWallet = async () => {
      const key = await SecureStore.getItemAsync('wallet_public_key');
      if (key) setPublicKey(key);
    };
    loadWallet();
  }, []);

  const copyToClipboard = () => {
    Clipboard.setStringAsync(publicKey);
    Alert.alert('📋 تم نسخ العنوان');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* زر الإعدادات */}
      <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.settingsText}>⚙️</Text>
      </TouchableOpacity>

      {/* العنوان والرصيد */}
      <Text style={styles.label}>💰 رصيدك:</Text>
      <Text style={styles.balance}>{balance} SOL</Text>

      <Text style={styles.label}>🔗 عنوان محفظتك:</Text>
      <Text selectable style={styles.address}>{publicKey}</Text>

      <TouchableOpacity style={styles.copyButton} onPress={copyToClipboard}>
        <Text style={styles.copyText}>📋 نسخ العنوان</Text>
      </TouchableOpacity>

      {/* أزرار التعامل */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>📤 إرسال</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>📥 استلام</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>🔁 مبادلة</Text>
        </TouchableOpacity>
      </View>

      {/* قائمة العملات */}
      <View style={styles.tokenList}>
        {tokens.map((token, index) => (
          <View key={index} style={styles.tokenItem}>
            <Text style={styles.tokenName}>{token.name}</Text>
            <Text style={styles.tokenBalance}>{token.balance}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow:1, padding:20, alignItems:'center' },
  settingsButton: { position:'absolute', top:30, right:20, backgroundColor:'#333', padding:10, borderRadius:8 },
  settingsText: { color:'#fff', fontSize:18 },
  label: { fontSize:18, color:'#ff0000', marginTop:20 },
  balance: { fontSize:24, color:'#fff', fontWeight:'bold', marginBottom:20 },
  address: { fontSize:14, color:'#fff', textAlign:'center', marginBottom:10 },
  copyButton: { backgroundColor:'#ff0000', padding:10, borderRadius:8 },
  copyText: { color:'#fff', fontSize:14 },
  actions: { flexDirection:'row', justifyContent:'space-between', marginTop:20 },
  actionButton: { backgroundColor:'#222', padding:12, borderRadius:8, marginHorizontal:5 },
  actionText: { color:'#fff' },
  tokenList: { marginTop:30, width:'100%' },
  tokenItem: { flexDirection:'row', justifyContent:'space-between', padding:10, backgroundColor:'#1b1b1b', marginBottom:10, borderRadius:8 },
  tokenName: { color:'#fff', fontWeight:'bold' },
  tokenBalance: { color:'#ff0000' },
});
