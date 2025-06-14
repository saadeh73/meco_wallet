import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function TokenDetails({ route }) {
  const { token } = route.params;
  const { t } = useTranslation();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image source={{ uri: token.image }} style={styles.image} />

      <Text style={styles.title}>{token.name} ({token.symbol.toUpperCase()})</Text>

      <Text style={styles.detail}>
        💵 {t('price')}: ${token.current_price?.toFixed(4) || 'N/A'}
      </Text>

      <Text style={styles.detail}>
        📈 {t('high_24h')}: ${token.high_24h?.toFixed(4) || 'N/A'}
      </Text>

      <Text style={styles.detail}>
        📉 {t('low_24h')}: ${token.low_24h?.toFixed(4) || 'N/A'}
      </Text>

      <Text style={styles.detail}>
        🔁 {t('change_24h')}: {token.price_change_percentage_24h?.toFixed(2) || 0}%
      </Text>

      <Text style={styles.detail}>
        🏦 {t('market_cap')}: ${token.market_cap?.toLocaleString() || 'N/A'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  image: {
    width: 60,
    height: 60,
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ff0000',
    marginBottom: 20,
    textAlign: 'center',
  },
  detail: {
    fontSize: 16,
    marginVertical: 6,
    textAlign: 'center',
  },
});
