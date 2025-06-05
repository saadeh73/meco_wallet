import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebase';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleLogin() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: '763203847014-64gvrp0vdfqjdlsfvl5fs5laov29ojbj.apps.googleusercontent.com', // من ملف google-services.json
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential).catch(err => {
        console.log('فشل تسجيل الدخول:', err);
      });
    }
  }, [response]);

  return { request, promptAsync };
}
