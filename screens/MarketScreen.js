import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { useNavigation } from '@react-navigation/native';

const tokenList = [
  { id: 'solana', symbol: 'SOL' },
  { id: 'tether', symbol: 'USDT' },
  { id: 'bonk', symbol: 'BONK' },
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'dogecoin', symbol: 'DOGE' },
];

export default function MarketScreen() {
  const { t } = useTranslation();
  const theme = useAppStore((state) => state.theme);
  const navigation = useNavigation();

  const isDark = theme === 'dark';
  const bg = isDark ? '#000' : '#fff';
  const fg = isDark ? '#fff' : '#000';

  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPrices = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=solana,tether,bonk,bitcoin,ethereum,dogecoin&order=market_cap_desc&sparkline=false'
      );
      const data = await res.json();
      const mapped = {};
      data.forEach((item) => {
        mapped[item.id] = item;
      });
      setPrices(mapped);
    } catch (err) {
      Alert.alert(t('error'), 'فشل تحميل أسعار السوق');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPrices();
  };

  useEffect(() => {
    fetchPrices();
  }, []);

  const renderItem = (token) => {
    const info = prices[token.id];
    return (
      <TouchableOpacity
        key={token.id}
        style={styles.item}
        onPress={() => navigation.navigate('TokenDetails', { token: info })}
      >
        <View style={styles.tokenInfo}>
          <Image source={{ uri: info?.image }} style={styles.icon} />
          <Text style={[styles.token, { color: fg }]}>{token.symbol}</Text>
        </View>
        <Text style={[styles.price, { color: fg }]}>
          {info?.current_price ? `$${info.current_price}` : '...'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: fg }]}>{t('market')}</Text>
      {loading ? (
        <ActivityIndicator color="#ff0000" size="large" />
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {tokenList.map(renderItem)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    alignItems: 'center',
  },
  tokenInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 28,
    height: 28,
    marginRight: 10,
  },
  token: { fontSize: 16 },
  price: { fontSize: 16, fontWeight: 'bold' },
});
