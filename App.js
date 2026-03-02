// App.js
import './polyfill';
import './shim'; // أضف هذا السطر
import './i18n';
import React from 'react';
import AppContainer from './AppContainer';

// اختبار Polyfills
console.log('🔧 Polyfill Status:');
console.log('- Buffer:', typeof Buffer !== 'undefined' ? '✅' : '❌');
console.log('- crypto.getRandomValues:', global.crypto?.getRandomValues ? '✅' : '❌');
console.log('- process.nextTick:', typeof process.nextTick !== 'undefined' ? '✅' : '❌');

console.log('🚀 MECO Wallet starting...');

export default function App() {
  return <AppContainer />;
}
