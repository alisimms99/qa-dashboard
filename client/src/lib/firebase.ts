import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider } from "firebase/auth";

// Firebase configuration
// Real values from Firebase Console
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAq1qscwFphoZNR4d4YCfuWyWXnC5BLR9A",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ojpm-qa-dashboard.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ojpm-qa-dashboard",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ojpm-qa-dashboard.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "757496134364",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:757496134364:web:5db9e32e92e5e8685f9219",
};

// Initialize Firebase
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Auth
export const auth: Auth = getAuth(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  hd: "oddjobspropertymaintenance.com", // Restrict to company domain
});

export default app;

