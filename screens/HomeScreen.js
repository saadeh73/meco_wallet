import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';

export default function HomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Image source={require('../assets/logo.png')} style={styles.logo} />
      <Text style={styles.title}>meco wallet</Text>
      <Text style={styles.subtitle}>أول محفظة عملات رقمية عربية</Text>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('CreateWallet')}>
      <Text style={styles.buttonText}>إنشاء محفظة</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.buttonOutline} onPress={() => navigation.navigate('ImportWallet')}>
      <Text style={styles.buttonOutlineText}>استيراد محفظة</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
       <Text style={{ color: '#ff0000', marginTop: 30 }}>⚙️ الإعدادات</Text>
       </TouchableOpacity>
     </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1b1b1b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 28,
    color: '#ff0000',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#ff0000',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginBottom: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  buttonOutline: {
    borderColor: '#ff0000',
    borderWidth: 2,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  buttonOutlineText: {
    color: '#ff0000',
    fontSize: 16,
  },
});
