import './i18n';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

import React from 'react';
import AppContainer from './AppContainer';

export default function App() {
  return <AppContainer />;
}
