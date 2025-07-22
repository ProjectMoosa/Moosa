import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, enableNetwork, disableNetwork } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyB9xp6ZcCUUE0-9oE9_hzlk5WwB5WJFvok",
  authDomain: "moosa-99acc.firebaseapp.com",
  projectId: "moosa-99acc",
  storageBucket: "moosa-99acc.firebasestorage.app",
  messagingSenderId: "207684737966",
  appId: "1:207684737966:web:04407e7723eed0998d463f",
  measurementId: "G-KMGG17KF78"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// Performance optimizations
if (process.env.NODE_ENV === 'development') {
  // Enable offline persistence for better performance
  // This will cache data locally for faster access
}

// Initialize Analytics only on client side
let analytics = null;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

export { app, auth, db, analytics }; 