import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDtAuU7pSBSRBylLqsGrh08LagfRX1YWIw",
  authDomain: "meco-wallet-f48e5.firebaseapp.com",
  projectId: "meco-wallet-f48e5",
  storageBucket: "meco-wallet-f48e5.firebasestorage.app",
  messagingSenderId: "763203847014",
  appId: "1:763203847014:web:aee0305a57dafee55abea7",
  measurementId: "G-FER8D7DDRQ"
};

// تهيئة التطبيق
const app = initializeApp(firebaseConfig);

// تهيئة المصادقة لـ Expo
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// قاعدة البيانات
const db = getFirestore(app);

export { auth, db };
