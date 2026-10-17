# WebRTC Call

Application d'appel audio/vidéo P2P avec partage d'écran et chat texte.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FIVobu%2Fwebrtc-call%2Ftree%2Frestore%2Fwebrtc-chat-2026-10-18)

## Déploiement en ligne (Render)

1. Clique sur le bouton **Deploy to Render** ci-dessus et connecte ton compte GitHub à Render si demandé.
2. Vérifie que la branche proposée est `restore/webrtc-chat-2026-10-18`.
3. Valide **Deploy Blueprint**.
4. Attends que le service passe à l'état **Live**, puis ouvre l'URL publique fournie par Render (en `https://…onrender.com`).

**Important :** je ne peux pas créer l'URL publique finale sans accès à ton compte d'hébergement. Le bouton prépare le déploiement; l'URL du site sera créée par Render après validation. Le service gratuit peut se mettre en veille. Pour améliorer les connexions entre réseaux différents, configure un serveur TURN via `TURN_URL`, `TURN_USERNAME` et `TURN_CREDENTIAL` dans les variables d'environnement Render.

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
