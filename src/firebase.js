import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCTUpII-npKw2vmVWC-jfXJi0YyePZuFlI",
  authDomain: "dashboard-eder.firebaseapp.com",
  projectId: "dashboard-eder",
  storageBucket: "dashboard-eder.firebasestorage.app",
  messagingSenderId: "4817163394",
  appId: "1:4817163394:web:cda64cfa2a830a1d1e509b"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);