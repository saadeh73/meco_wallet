import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function WalletScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.balance}>الرصيد: 0 MECO</Text>
      <Text style={styles.address}>رابط المحفظة: Xx...1234</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>إرسال</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>استلام</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>مبادلة</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>العملات (شبكة سولانا):</Text>
      <Text style={styles.tokenItem}>MECO - 0</Text>
      <Text style={styles.tokenItem}>SOL - 0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1b1b1b',
    padding: 20,
  },
  balance: {
    fontSize: 20,
    color: '#ff0000',
    marginBottom: 10,
  },
  address: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
  },
  actionButton: {
    backgroundColor: '#ff0000',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
  },
  sectionTitle: {
    color: '#ff0000',
    fontSize: 18,
    marginBottom: 10,
  },
  tokenItem: {
    color: '#ccc',
    fontSize: 16,
    marginBottom: 4,
  },
});
