import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';

const tokens = [
  {
    id: 'SOL',
    name: 'Solana',
    image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  },
  {
    id: 'MECO',
    name: 'MECO',
    image: 'https://dummyimage.com/64x64/ff0000/ffffff&text=M', // رمز ثابت مؤقت
  },
  {
    id: 'USDT',
    name: 'Tether',
    image: 'https://assets.coingecko.com/coins/images/325/large/Tether-logo.png',
  },
  {
    id: 'BONK',
    name: 'Bonk',
    image: 'https://assets.coingecko.com/coins/images/28600/large/bonk.jpg',
  },
];

export default function SwapScreen() {
  const { t } = useTranslation();
  const theme = useAppStore((state) => state.theme);
  const isDark = theme === 'dark';
  const bg = isDark ? '#000' : '#fff';
  const fg = isDark ? '#fff' : '#000';

  const [fromToken, setFromToken] = useState('SOL');
  const [toToken, setToToken] = useState('MECO');
  const [amount, setAmount] = useState('');
  const [prices, setPrices] = useState({});

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana,tether,bonk&vs_currencies=usd'
      );
      const data = await response.json();
      setPrices({
        SOL: data.solana.usd,
        USDT: data.tether.usd,
        BONK: data.bonk.usd,
        MECO: 0.002,
      });
    } catch (err) {
      Alert.alert(t('error'), t('price_fetch_error'));
    }
  };

  const handleSwap = () => {
    if (fromToken === toToken) {
      Alert.alert('⚠️', t('same_token_error'));
      return;
    }

    const fromPrice = prices[fromToken] || 0;
    const toPrice = prices[toToken] || 1;
    const convertedAmount = ((parseFloat(amount) * fromPrice) / toPrice).toFixed(4);

    Alert.alert(
      t('success'),
      `${amount} ${fromToken} ≈ ${convertedAmount} ${toToken}`
    );
  };

  const renderTokenOptions = (selectedToken, setToken) => (
    <View style={styles.tokenGroup}>
      {tokens.map((token) => (
        <TouchableOpacity
          key={token.id}
          style={[
            styles.tokenOption,
            selectedToken === token.id && styles.selected,
            { backgroundColor: isDark ? '#111' : '#eee' },
          ]}
          onPress={() => setToken(token.id)}
        >
          <Image source={{ uri: token.image }} style={styles.tokenImage} />
          <Text style={[styles.tokenText, { color: fg }]}>{token.id}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: bg, flex: 1 }} contentContainerStyle={styles.container}>
      <Text style={[styles.label, { color: fg }]}>{t('from')}</Text>
      {renderTokenOptions(fromToken, setFromToken)}

      <Text style={[styles.label, { color: fg, marginTop: 20 }]}>{t('to')}</Text>
      {renderTokenOptions(toToken, setToToken)}

      <TextInput
        placeholder={t('amount')}
        placeholderTextColor="#999"
        keyboardType="numeric"
        style={[styles.input, { color: fg, borderColor: '#ff0000' }]}
        value={amount}
        onChangeText={setAmount}
      />

      <TouchableOpacity style={styles.button} onPress={handleSwap}>
        <Text style={styles.buttonText}>{t('execute_swap')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  label: {
    fontSize: 16,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  tokenGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tokenOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    margin: 5,
    borderRadius: 8,
  },
  selected: {
    borderWidth: 2,
    borderColor: '#ff0000',
  },
  tokenImage: {
    width: 24,
    height: 24,
    marginRight: 10,
    borderRadius: 12,
  },
  tokenText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginVertical: 20,
  },
  button: {
    backgroundColor: '#ff0000',
    padding: 15,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
