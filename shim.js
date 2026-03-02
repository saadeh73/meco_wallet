// shim.js - دعم إضافي لـ React Native
if (typeof __dirname === 'undefined') global.__dirname = '/';
if (typeof __filename === 'undefined') global.__filename = '';
if (typeof process === 'undefined') {
  global.process = require('process');
} else {
  const bProcess = require('process');
  for (var p in bProcess) {
    if (!(p in process)) {
      process[p] = bProcess[p];
    }
  }
}

// Buffer polyfill
if (typeof Buffer === 'undefined') global.Buffer = require('buffer').Buffer;

// Crypto polyfill
if (typeof crypto === 'undefined') global.crypto = require('crypto');

// Stream polyfill
if (typeof stream === 'undefined') global.stream = require('stream');

// Make sure these are available
global.process.version = 'v16.0.0';
global.process.browser = false;

console.log('✅ Shim loaded for React Native compatibility');
