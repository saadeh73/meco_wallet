// polyfill.js - متوافق مع React Native + Solana Web3.js + Termux
import { Buffer } from 'buffer';
import * as Random from 'expo-random';

// ========== BUFFER ==========
global.Buffer = Buffer;

// ========== PROCESS ==========
global.process = global.process || {};
global.process.env = global.process.env || { 
  NODE_ENV: 'production',
  SOLANA_NETWORK: 'mainnet-beta'
};
global.process.version = 'v16.0.0';
global.process.browser = false;
global.process.nextTick = setImmediate;

// ========== CRYPTO ==========
if (!global.crypto) {
  try {
    global.crypto = {
      getRandomValues: (array) => {
        const bytes = Random.getRandomBytes(array.length);
        for (let i = 0; i < array.length; i++) {
          array[i] = bytes[i];
        }
        return array;
      },
      subtle: {
        digest: () => Promise.reject(new Error('SubtleCrypto not available in React Native')),
        importKey: () => Promise.reject(new Error('SubtleCrypto not available')),
        exportKey: () => Promise.reject(new Error('SubtleCrypto not available')),
        encrypt: () => Promise.reject(new Error('SubtleCrypto not available')),
        decrypt: () => Promise.reject(new Error('SubtleCrypto not available')),
      }
    };
  } catch (error) {
    console.warn('⚠️ Crypto: Using fallback', error.message);
    global.crypto = {
      getRandomValues: (array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      },
      subtle: {
        digest: () => Promise.reject(new Error('SubtleCrypto not available'))
      }
    };
  }
}

// ========== TEXT ENCODING ==========
if (!global.TextEncoder || !global.TextDecoder) {
  try {
    // الطريقة الأكثر موثوقية لـ React Native
    const { TextEncoder, TextDecoder } = require('text-encoding');
    global.TextEncoder = TextEncoder;
    global.TextDecoder = TextDecoder;
  } catch (error) {
    // Fallback ضروري إذا لم تكن المكتبة مثبتة
    console.warn('⚠️ Text encoding not available, adding minimal polyfill');
    
    global.TextEncoder = class TextEncoder {
      encode(str) {
        return Buffer.from(str, 'utf8');
      }
    };
    
    global.TextDecoder = class TextDecoder {
      decode(bytes) {
        return Buffer.from(bytes).toString('utf8');
      }
    };
  }
}

// ========== PERFORMANCE ==========
if (!global.performance) {
  const startTime = Date.now();
  global.performance = {
    now: () => Date.now() - startTime,
    timing: { 
      navigationStart: startTime,
      fetchStart: 0,
      domainLookupStart: 0,
      domainLookupEnd: 0,
      connectStart: 0,
      connectEnd: 0,
      requestStart: 0,
      responseStart: 0,
      responseEnd: 0
    }
  };
}

// ========== GLOBALS ==========
if (!global.setImmediate) {
  global.setImmediate = (fn, ...args) => setTimeout(() => fn(...args), 0);
}

if (!global.clearImmediate) {
  global.clearImmediate = (id) => clearTimeout(id);
}

if (!global.btoa) {
  global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}

if (!global.atob) {
  global.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
}

if (typeof __dirname === 'undefined') {
  global.__dirname = '/';
}

if (typeof __filename === 'undefined') {
  global.__filename = '';
}

// ========== SOLANA-SPECIFIC ==========
// بعض مكتبات Solana تتطلب هذه
if (!global.location) {
  global.location = {
    protocol: 'https:',
    hostname: 'localhost',
    port: '',
    href: 'https://localhost'
  };
}

if (!global.navigator) {
  global.navigator = {
    userAgent: 'ReactNative',
    platform: 'ReactNative'
  };
}

// ========== URL ==========
if (!global.URL) {
  global.URL = {
    createObjectURL: () => '',
    revokeObjectURL: () => {}
  };
}

console.log('✅ Polyfills loaded successfully for Solana Web3');
