# API EcolePasDirecte

Petite API Express utilisant Firebase Authentication pour identifier les utilisateurs et Firestore pour les profils, messages et votes. Les mots de passe restent gérés par Firebase Authentication.

## Démarrage

1. Installez Node.js 20 ou plus récent.
2. Dans Firebase Console, créez une clé de compte de service pour le projet `ecolepasdirect` et placez le fichier à la racine sous `service-account.json`.
3. Copiez `.env.example` vers `.env` et vérifiez les valeurs.
4. Lancez `npm install`, puis `npm start`.
5. Vérifiez le serveur sur `http://localhost:3000/api/health`.

Ne publiez jamais le fichier de compte de service ni le fichier `.env`. En production, configurez les identifiants Firebase dans l'hébergeur et ajoutez l'adresse du site à `ALLOWED_ORIGINS`.

## Authentification

Toutes les routes sauf `/api/health` demandent un jeton Firebase ID dans l'en-tête :

```http
Authorization: Bearer JETON_FIREBASE_ID
```

Dans le site, récupérez ce jeton avec `await auth.currentUser.getIdToken()` après la connexion.

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
| `GET` | `/api/votes` | Lire les résultats et son état de vote |
| `POST` | `/api/votes` | Voter une fois (`{ "choice": "Alex" }`) |

Les choix de vote disponibles sont `Alex`, `Johan` et `Aucun`. Les routes de profil et de messagerie utilisent la collection Firestore `users` déjà créée à l'inscription. Les messages envoyés par cette API utilisent des identifiants Firebase comme participants.

## Exemple JavaScript

```js
const token = await auth.currentUser.getIdToken();
const response = await fetch("http://localhost:3000/api/profile", {
  headers: { Authorization: `Bearer ${token}` }
});
const profile = await response.json();
```

Le site hébergé uniquement sur GitHub Pages ne peut pas héberger cette API Node : déployez l'API séparément, puis utilisez son adresse dans les appels `fetch`.