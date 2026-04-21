import { LogBox } from 'react-native';
LogBox.ignoreLogs(['"solana" is not a valid icon name']);

import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { ActivityIndicator, View, I18nManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from './store';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';

import * as Linking from 'expo-linking';
import { initWalletConnect, pairWalletConnect } from './services/walletConnectService';

import HomeScreen from './screens/HomeScreen';
import CreateWalletScreen from './screens/CreateWalletScreen';
import ImportWalletScreen from './screens/ImportWalletScreen';
import WalletScreen from './screens/WalletScreen';
import SettingsScreen from './screens/SettingsScreen';
import ReceiveScreen from './screens/ReceiveScreen';
import SendScreen from './screens/SendScreen';
import BackupScreen from './screens/BackupScreen';
import TransactionHistoryScreen from './screens/TransactionHistoryScreen';
import MarketScreen from './screens/MarketScreen';
import AppPortalScreen from './screens/AppPortalScreen';
import TokenDetailsScreen from './screens/TokenDetailsScreen';
import QRScannerScreen from './screens/QRScannerScreen';
import SwapScreen from './screens/SwapScreen';
import StakingScreen from './screens/StakingScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function BottomTabs() {
  const { t } = useTranslation();
  const primaryColor = useAppStore(state => state.primaryColor);
  const theme = useAppStore(state => state.theme);
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="Wallet"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: 'gray',
        tabBarIcon: ({ color, size, focused }) => {
          let iconName;
          if (route.name === 'Wallet') {
            iconName = focused ? 'wallet' : 'wallet-outline';
          } else if (route.name === 'Market') {
            iconName = focused ? 'stats-chart' : 'stats-chart-outline';
          } else if (route.name === 'AppPortal') {
            iconName = focused ? 'compass' : 'compass-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarStyle: {
          backgroundColor: isDark ? '#1A1A2E' : '#FFFFFF',
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 10,
          height: 60 + (insets.bottom > 0 ? insets.bottom : 10),
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          paddingTop: 10,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          marginBottom: insets.bottom > 0 ? 0 : 5,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ tabBarLabel: t('wallet') }} />
      <Tab.Screen name="Market" component={MarketScreen} options={{ tabBarLabel: t('market') }} />
      <Tab.Screen name="AppPortal" component={AppPortalScreen} options={{ tabBarLabel: t('explore') || 'استكشف' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: t('user_settings') }} />
    </Tab.Navigator>
  );
}

export default function AppContainer() {
  const theme = useAppStore(state => state.theme);
  const language = useAppStore(state => state.language);
  const primaryColor = useAppStore(state => state.primaryColor);
  const [initialRoute, setInitialRoute] = useState(null);
  const { t } = useTranslation();

  useEffect(() => {
    const loadSettings = async () => {
      await useAppStore.getState().loadLanguage();
      await useAppStore.getState().loadPrimaryColor();
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (language) {
      i18n.changeLanguage(language);
      I18nManager.forceRTL(language === 'ar');
    }
  }, [language]);

  useEffect(() => {
    initWalletConnect().catch(console.warn);
  }, []);

  const handleDeepLink = async (url) => {
    if (!url) return;
    console.log('🔗 Deep link received:', url);
    if (url.startsWith('meco-wallet://wc')) {
      const uri = url.replace('meco-wallet://wc?uri=', '');
      if (uri) {
        try {
          await pairWalletConnect(decodeURIComponent(uri));
        } catch (error) {
          console.error('❌ فشل الربط عبر الرابط العميق:', error);
        }
      }
    }
  };

  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        // ✅ انتظار تحميل الحساب النشط من SecureStore
        const success = await useAppStore.getState().loadActiveAccount();
        
        if (success) {
          // نجح تحميل الحساب النشط
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const hasBiometrics = await LocalAuthentication.isEnrolledAsync();
          if (hasHardware && hasBiometrics) {
            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: 'تأكيد الهوية للدخول',
              cancelLabel: 'إلغاء',
              disableDeviceFallback: true,
            });
            if (!result.success) {
              setInitialRoute('Home');
              return;
            }
          }
          setInitialRoute('BottomTabs');
          return;
        }

        // التحقق من وجود محفظة قديمة
        const initialized = await SecureStore.getItemAsync('wallet_initialized');
        if (initialized === 'true') {
          const loadWallet = useAppStore.getState().loadWallet;
          const ok = await loadWallet();
          if (ok) {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const hasBiometrics = await LocalAuthentication.isEnrolledAsync();
            if (hasHardware && hasBiometrics) {
              const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'تأكيد الهوية للدخول',
                cancelLabel: 'إلغاء',
                disableDeviceFallback: true,
              });
              if (!result.success) {
                setInitialRoute('Home');
                return;
              }
            }
            setInitialRoute('BottomTabs');
            return;
          }
        }
        setInitialRoute('Home');
      } catch (err) {
        console.warn('Init error:', err);
        setInitialRoute('Home');
      }
    };
    init();
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme === 'dark' ? '#000' : '#fff' }}>
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack.Navigator initialRouteName={initialRoute}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="CreateWallet" component={CreateWalletScreen} options={{ title: t('create_wallet') }} />
        <Stack.Screen name="ImportWallet" component={ImportWalletScreen} options={{ title: t('import_wallet') }} />
        <Stack.Screen name="BottomTabs" component={BottomTabs} options={{ headerShown: false }} />
        <Stack.Screen name="Send" component={SendScreen} options={{ title: t('send') }} />
        <Stack.Screen name="Receive" component={ReceiveScreen} options={{ title: t('receive') }} />
        <Stack.Screen name="Backup" component={BackupScreen} options={{ title: t('backup_wallet') }} />
        <Stack.Screen name="Swap" component={SwapScreen} options={{ title: t('swap_title') || 'تبادل', headerBackTitle: t('back') || 'رجوع' }} />
        <Stack.Screen name="Staking" component={StakingScreen} options={{ title: t('staking.title') || 'تخزين السيولة', headerBackTitle: t('back') || 'رجوع' }} />
        <Stack.Screen name="TokenDetails" component={TokenDetailsScreen} options={{ title: t('token_details'), headerBackTitle: t('back') }} />
        <Stack.Screen name="QRScanner" component={QRScannerScreen} options={{ title: t('qr_scanner.title'), headerBackTitle: t('back'), headerShown: false }} />
        <Stack.Screen name="TransactionHistory" component={TransactionHistoryScreen} options={{ title: t('transaction_history') }} />
        <Stack.Screen name="AppPortal" component={AppPortalScreen} options={{ title: t('explore') || 'استكشف' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
