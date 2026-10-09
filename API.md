# API EcolePasDirecte

Petite API Express utilisant Firebase Authentication pour identifier les utilisateurs et Firestore pour les profils, messages et votes. Les mots de passe restent gérés par Firebase Authentication.

## Démarrage

1. Installez Node.js 20 ou plus récent.
2. Dans Firebase Console, créez une clé de compte de service pour le projet `ecolepasdirect` et placez le fichier à la racine sous `service-account.json`.
3. Dans `.env`, définissez `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json`, `PORT=3000` et `ALLOWED_ORIGINS` avec l'adresse de votre site. En local, utilisez par exemple `http://localhost:5500`.
4. Lancez `npm install`, puis `npm start` pour tester l'API en local.
5. Vérifiez le serveur sur `http://localhost:3000/api/health`.

Ne publiez jamais le fichier de compte de service ni le fichier `.env`.

## Déploiement pour GitHub Pages

GitHub Pages ne peut pas exécuter Express. Le projet est configuré pour publier l'API comme Firebase Function, dans le même projet Firebase :

1. Activez le forfait Blaze du projet Firebase (requis pour déployer des Cloud Functions).
2. Installez la CLI avec `npm install -g firebase-tools`, puis connectez-vous avec `firebase login`.
3. Déployez l'API avec `firebase deploy --only functions:backend --project ecolepasdirect`.
4. L'URL sera `https://europe-west1-ecolepasdirect.cloudfunctions.net/backend`. Le site GitHub Pages l'utilise automatiquement ; en local, le client continue d'utiliser `http://localhost:3000`.

Les identifiants Firebase Admin sont fournis automatiquement dans Cloud Functions ; le fichier de compte de service local ne doit pas être déployé.

## Authentification

Les routes métier demandent un jeton Firebase ID dans l'en-tête. Seules `/` et `/api/health` sont publiques :

```http
Authorization: Bearer JETON_FIREBASE_ID
```

Dans le site, récupérez ce jeton avec `await auth.currentUser.getIdToken()` après la connexion.
Le client partagé `src/js/api-client.js` ajoute ce jeton automatiquement pour les appels protégés.

## Routes

| Méthode | Route | Fonction |
| --- | --- | --- |
| `GET` | `/api/health` | Vérifier que l'API répond |
| `GET` | `/api/profile` | Lire son profil |
| `PATCH` | `/api/profile` | Modifier son nom (`{ "username": "Alex" }`) |
| `GET` | `/api/conversations` | Lister ses conversations |
| `GET` | `/api/messages/:otherUserId` | Lire les 100 derniers messages |
| `POST` | `/api/messages` | Envoyer un message (`{ "recipientId": "UID", "content": "Salut" }`) |
| `DELETE` | `/api/conversations/:otherUserId` | Supprimer une conversation |
| `GET` | `/api/chat/conversations` | Lister les conversations existantes par nom d'utilisateur |
| `POST` | `/api/chat/conversations` | Créer une conversation privée (`{ "recipientName": "Alex" }`) |
| `GET` | `/api/chat/conversations/:chatId/messages` | Lire les messages d'une conversation existante |
| `POST` | `/api/chat/conversations/:chatId/messages` | Envoyer un message texte dans une conversation ou un groupe existant |
| `PATCH` | `/api/chat/conversations/:chatId/messages/:messageId/reaction` | Ajouter/retirer une réaction (`{ "emoji": "👍" }`, `null` pour retirer) |
| `DELETE` | `/api/chat/conversations/:chatId/messages/:messageId` | Supprimer son propre message |
| `DELETE` | `/api/chat/conversations/:chatId` | Supprimer une conversation (sauf le groupe général) |
| `GET` | `/api/votes` | Lire les résultats et son état de vote |
| `POST` | `/api/votes` | Voter une fois (`{ "choice": "Alex" }`) |

Les choix de vote disponibles sont `Alex`, `Johan` et `Aucun`. Les routes de profil et de messagerie utilisent la collection Firestore `users` déjà créée à l'inscription. Les routes `/api/chat` conservent le format historique des conversations par noms ; les pages utilisent l'API pour les votes, la connexion, l'envoi de messages texte et les suppressions. Les écouteurs Firestore de la messagerie restent actifs pour l'affichage en temps réel.

## Exemple JavaScript

```js
const token = await auth.currentUser.getIdToken();
const response = await fetch("http://localhost:3000/api/profile", {
  headers: { Authorization: `Bearer ${token}` }
});
const profile = await response.json();
```

Le site hébergé uniquement sur GitHub Pages utilise l'API Firebase Functions après son déploiement.