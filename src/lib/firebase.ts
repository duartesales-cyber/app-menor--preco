import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBPkJn9e9f7FpQGE-cSGHRIb65R-OsVar0",
  authDomain: "menor-preco-54ef2.firebaseapp.com",
  projectId: "menor-preco-54ef2",
  storageBucket: "menor-preco-54ef2.firebasestorage.app",
  messagingSenderId: "609779296065",
  appId: "1:609779296065:web:bb92b8eeb9b9821deb63c0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-27b6107f-2829-403e-aeb7-5db74262e7b5");
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Erro ao entrar com Google", error);
    throw error;
  }
};