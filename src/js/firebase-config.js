// 🔴 INSTRUCTIONS IMPORTANTES:
// 1. Allez sur https://console.firebase.google.com
// 2. Créez un nouveau projet (ou utilisez un existant)
// 3. Allez dans Paramètres du Projet > Onglet "Général"
// 4. Scroll jusqu'à "Vos applications" > Cliquez sur "Web" (</> icone)
// 5. Copiez la configuration et remplacez le code ci-dessous

// ⭐ REMPLACEZ CETTE CONFIGURATION PAR LA VOTRE
const firebaseConfig = {
  apiKey: "AIzaSyAJRxSO6NDTAhAoUX-uqmTJT68cJjog1bw",
  authDomain: "ecolepasdirect.firebaseapp.com",
  projectId: "ecolepasdirect",
  storageBucket: "ecolepasdirect.firebasestorage.app",
  messagingSenderId: "524734025311",
  appId: "1:524734025311:web:4a90c2bf70e04101b415ea",
  measurementId: "G-X1GYGMFBC6"
};

// Initialiser Firebase
firebase.initializeApp(firebaseConfig);

// Récupérer les services
const db = firebase.firestore();
const auth = firebase.auth();

console.log("✅ Firebase initialisé avec succès!");
