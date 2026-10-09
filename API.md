# Données Firebase EcolePasDirecte

GitHub Pages héberge uniquement les fichiers statiques. Le site utilise donc directement le SDK Firebase dans le navigateur : aucun serveur Express ni forfait Blaze n'est nécessaire pour les opérations Firestore de base.

## Configuration

1. Dans Firebase Console, vérifiez que l'authentification **E-mail/Mot de passe** est activée.
2. Vérifiez que Firestore est créé dans le projet `ecolepasdirect`.
3. Publiez les règles du dépôt avec :

```sh
firebase deploy --only firestore:rules --project ecolepasdirect
```

Cette commande ne déploie pas de Cloud Function. Les identifiants Firebase Admin et le fichier `.env` ne sont pas utilisés par le site.

## Votes

Les votes sont stockés dans Firestore sous `elections/class-representative`. Chaque bulletin se trouve dans `ballots/{uid}` et n'est lisible que par son propriétaire. Les règles n'autorisent qu'un bulletin par compte et exigent que son écriture et la mise à jour des compteurs aient lieu ensemble.

Les anciens compteurs stockés dans Realtime Database ne sont pas migrés automatiquement ; le scrutin Firestore démarre à zéro.

## Messagerie

La messagerie lit et écrit directement dans `conversations`. Les règles limitent l'accès aux membres enregistrés dans le champ `participants`. Le groupe général utilise le document `general_school`; chaque compte le rejoint sans pouvoir parcourir la liste privée des profils.

## Limites du forfait gratuit

Firebase applique des quotas gratuits et des limites d'utilisation à Firestore et Authentication. Consulte la page d'utilisation Firebase si le trafic augmente. Les services Cloud Functions restent inutilisés.
