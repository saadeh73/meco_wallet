// App.js
import './polyfill';
import './shim';
import './i18n';
import React from 'react';
import { Buffer } from 'buffer';
import AppContainer from './AppContainer';

global.Buffer = Buffer;

console.log('🔧 Polyfill Status:');
console.log('- Buffer:', typeof Buffer !== 'undefined' ? '✅' : '❌');
console.log('- crypto.getRandomValues:', global.crypto?.getRandomValues ? '✅' : '❌');
console.log('🚀 MECO Wallet starting...');

export default function App() {
  return <AppContainer />;
}
