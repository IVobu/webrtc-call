# WebRTC Call

Application d'appel audio/vidéo P2P avec partage d'écran et chat texte.

## Déploiement en ligne (Render)

Le dépôt contient un `render.yaml` pour préparer le déploiement du serveur Node.js sur Render.

1. Ouvre le dépôt GitHub et crée un **Blueprint** depuis ce dépôt.
2. Sélectionne la branche `restore/webrtc-chat-2026-10-18`.
3. Lance le déploiement et attends que Render fournisse une URL publique en `https://…onrender.com`.
4. Ouvre cette URL dans deux navigateurs/appareils pour tester un appel.

**Important :** le site n'a pas d'URL publique de production tant que le déploiement Render n'a pas été lancé. Le code GitHub seul n'héberge pas l'application. Les services gratuits peuvent se mettre en veille. Pour des appels fiables entre réseaux différents, configure un serveur TURN via `TURN_URL`, `TURN_USERNAME` et `TURN_CREDENTIAL` dans les variables d'environnement Render.

## Architecture

```
Navigateur A ◄──── WebRTC P2P ────► Navigateur B
       ▲                                ▲
       │      Serveur de signalisation  │
       └────────── (Socket.io) ─────────┘
```

Le serveur Node.js gère la signalisation. Les médias circulent directement entre navigateurs lorsque la connectivité réseau le permet.

## Lancer en local

Prérequis : Node.js 16+.

```bash
npm install
npm start
```

Puis ouvre http://localhost:3000.

## Fonctions présentes dans la branche de travail

- Chat texte dans la salle.
- Panneau latéral rétractable et redimensionnable.
- Partages d'écran multiples avec réglage de volume indépendant.
- Volume individuel des participants (0 à 200 %) et contrôle de sourdine.
- Caméra désactivée par défaut.
- Réglages micro, qualité/FPS, avatar réactif et affichage des noms.
- Tuiles de partage redimensionnables et réorganisables.

## Limites à connaître

- Architecture en maillage P2P : la charge réseau/CPU augmente avec le nombre de participants et de partages.
- Le partage audio d'un écran dépend du navigateur et du système d'exploitation.
- Le contrôle du volume au-dessus de 100 % utilise Web Audio et doit être vérifié dans le navigateur cible.
- Les vérifications statiques ne remplacent pas un test d'appel réel à plusieurs appareils.
