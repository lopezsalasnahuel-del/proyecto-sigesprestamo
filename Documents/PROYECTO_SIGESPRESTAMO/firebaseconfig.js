// Usamos los paquetes instalados en tu PC
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAtZY0kyneJx5NRgWC1lih7iT1bPBC26po",
  authDomain: "sigeprestamo.firebaseapp.com",
  projectId: "sigeprestamo",
  storageBucket: "sigeprestamo.firebasestorage.app",
  messagingSenderId: "551842965352",
  appId: "1:551842965352:web:281484b0d07d71246018dd",
  measurementId: "G-0MNEF5P878"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Solo exportamos las INSTANCIAS (la conexión)
export { auth, db };