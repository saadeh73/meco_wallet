import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';
import WalletScreen from './screens/WalletScreen';
import CreateWalletScreen from './screens/CreateWalletScreen';
import ImportWalletScreen from './screens/ImportWalletScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';

const Stack = createNativeStackNavigator();

export default function AppContainer() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: 'محفظتي' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'الإعدادات' }} />
        <Stack.Screen name="CreateWallet" component={CreateWalletScreen} options={{ title: 'إنشاء محفظة' }} />
        <Stack.Screen name="ImportWallet" component={ImportWalletScreen} options={{ title: 'استيراد محفظة' }} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'نسيت كلمة المرور؟' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

