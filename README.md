# WebRTC Call

Application d'appel audio/vidéo P2P avec partage d'écran et chat texte.

## Lancer le site comme avant (en local + Cloudflare Tunnel)

Prérequis : Node.js 16+.

1. Récupère cette branche sur la machine qui héberge déjà le site :
   `git checkout restore/webrtc-chat-2026-10-18`
   `git pull origin restore/webrtc-chat-2026-10-18`
2. Installe les dépendances si nécessaire : `npm install`
3. Lance l'application : `npm start`
4. Dans un autre terminal, démarre Cloudflare Tunnel vers le serveur local, par exemple :
   `cloudflared tunnel --url http://localhost:3000`

Garde les deux terminaux ouverts. Cloudflare peut attribuer une nouvelle URL aux tunnels temporaires après un redémarrage. Si tu utilisais un tunnel nommé/configuré, conserve plutôt sa commande habituelle.

Le code sur GitHub ne met pas automatiquement à jour un processus déjà lancé sur ton ordinateur : après avoir récupéré les changements, il faut redémarrer le serveur local. Le lien public fonctionne seulement tant que le serveur et le tunnel sont actifs.

## Architecture

```
Navigateur A ◄──── WebRTC P2P ────► Navigateur B
       ▲                                ▲
       │      Serveur de signalisation  │
       └────────── (Socket.io) ─────────┘
```

Le serveur Node.js gère la signalisation. Les médias circulent directement entre navigateurs lorsque la connectivité réseau le permet.

## Fonctions présentes dans cette branche de travail

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
