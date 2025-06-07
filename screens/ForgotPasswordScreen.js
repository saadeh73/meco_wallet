import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ForgotPasswordScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>تم إزالة دعم Firebase بالكامل 🔥</Text>
      <Text style={styles.subtext}>ستُفعّل ميزة استرداد المحفظة عبر الكلمات السرية لاحقًا.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, justifyContent:'center', alignItems:'center', padding:20 },
  text: { fontSize:18, fontWeight:'bold', color:'#ff0000', marginBottom:10 },
  subtext: { fontSize:14, color:'#444', textAlign:'center' },
});
