# API EcolePasDirecte

Petite API Express utilisant Firebase Authentication pour identifier les utilisateurs et Firestore pour les profils, messages et votes. Les mots de passe restent gérés par Firebase Authentication.

## Démarrage

1. Installez Node.js 20 ou plus récent.
2. Dans Firebase Console, créez une clé de compte de service pour le projet `ecolepasdirect` et placez le fichier à la racine sous `service-account.json`.
3. Dans `.env`, définissez `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json`, `PORT=3000` et `ALLOWED_ORIGINS` avec l'adresse de votre site. En local, utilisez par exemple `http://localhost:5500`.
4. Lancez `npm install`, puis `npm start`.
5. Vérifiez le serveur sur `http://localhost:3000/api/health`.

Ne publiez jamais le fichier de compte de service ni le fichier `.env`. En production, configurez les identifiants Firebase dans l'hébergeur et ajoutez l'adresse du site à `ALLOWED_ORIGINS`.

## Authentification

Les routes métier demandent un jeton Firebase ID dans l'en-tête. Seules `/` et `/api/health` sont publiques :

```http
Authorization: Bearer JETON_FIREBASE_ID
```

Dans le site, récupérez ce jeton avec `await auth.currentUser.getIdToken()` après la connexion.
Le client partagé `src/js/api-client.js` ajoute ce jeton automatiquement pour la messagerie. Son adresse par défaut est `http://localhost:3000` ; pour un déploiement, définissez `window.EPD_API_URL` vers l'URL publique de l'API avant de charger ce fichier.

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

Le site hébergé uniquement sur GitHub Pages ne peut pas héberger cette API Node : déployez l'API séparément, puis utilisez son adresse dans les appels `fetch`.