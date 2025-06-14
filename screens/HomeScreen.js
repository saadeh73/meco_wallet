import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, useColorScheme } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();

  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <Image
        source={require('../assets/logo.jpg')}
        style={styles.logo}
      />
      <Text style={[styles.title, { color: '#ff0000' }]}>{t('welcome')}</Text>
      <Text style={[styles.subtitle, { color: isDark ? '#ccc' : '#333' }]}>{t('أول محفظة عملات رقمية عربيه ')}</Text>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('CreateWallet')}>
        <Text style={styles.buttonText}>{t('create_wallet')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('ImportWallet')}>
        <Text style={styles.buttonText}>{t('import_wallet')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logo: {
    width: 180,
    height: 180,
    resizeMode: 'contain',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#ff0000',
    padding: 15,
    borderRadius: 8,
    marginVertical: 10,
    width: '100%',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
});
