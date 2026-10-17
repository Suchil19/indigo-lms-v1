import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyC5ZSVU4Eg4D9b-9-gRZ8FyRrT0VRIkbTM",
    authDomain: "indigo-lms.firebaseapp.com",
    projectId: "indigo-lms",
    storageBucket: "indigo-lms.firebasestorage.app",
    messagingSenderId: "423451757211",
    appId: "1:423451757211:web:6ba8e3f9abb4904f6e943e",
    measurementId: "G-P0Q83N83TQ"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);


// OBLIGATORIO: export const (no solo const)
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);