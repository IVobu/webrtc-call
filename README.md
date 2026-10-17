# WebRTC Call

Application d'appel audio/vidéo P2P avec partage d'écran, avatar réactif et chat,
auto-hébergée sur ta machine.

## Architecture

```
Navigateur A ◄──── WebRTC P2P ────► Navigateur B
       ▲                                ▲
       │      Serveur de signalisation  │
       └────────── (Socket.io) ─────────┘
              (pas de relais média)
```

Le serveur Node.js ne fait qu'établir les connexions (signalisation), relayer le chat
et diffuser l'état (qui parle, qui partage). Les médias circulent directement entre
les navigateurs en P2P (maillage).

## Prérequis

- Node.js 16+

## Installation

```bash
cd webrtc-call
npm install
```

## Lancement

```bash
node server.js
```

Puis ouvre http://localhost:3000 dans ton navigateur.

### Optionnel : serveur TURN

Certains réseaux (NAT symétrique, certains VPN) bloquent le P2P. Un serveur TURN permet
de relayer les médias en dernier recours :

```bash
TURN_URL="turn:mon-serveur:3478" TURN_USERNAME="user" TURN_CREDENTIAL="pass" node server.js
```

## Inviter des personnes à distance

Le serveur écoute sur le port 3000 de ta machine. Pour que des amis à distance puissent
se connecter, expose ton serveur :

### Option 1 : Cloudflare Tunnel (recommandé, gratuit)

```bash
npx cloudflared tunnel --url http://localhost:3000
```

### Option 2 : ngrok

```bash
npx ngrok http 3000
```

### Option 3 : même réseau local

Donne simplement ton IP locale (ex: `http://192.168.1.42:3000`).

## Fonctionnement

1. **Créer un appel** — clic sur "Créer un appel", un code de 8 caractères est généré
2. **Inviter** — envoie le code (ou le lien avec `?room=CODE`) à tes amis
3. **Appel** — micro, caméra, partage d'écran et chat fonctionnent en P2P
4. **Quitter** — le code de salle est supprimé une fois tout le monde parti

## Fonctionnalités

### Avatar réactif

Chaque participant peut définir deux images (URL ou fichier) sur la page d'accueil :

- **Image au repos** — affichée par défaut
- **Image en parlant** — affichée quand le micro détecte la parole

La détection de parole se fait localement via la Web Audio API (niveau du micro). L'état
`parle / ne parle pas` est diffusé aux autres participants pour que leur tuile mette à jour
l'avatar.

### Réglages (bouton "Réglages" en appel)

| Réglage | Défaut | Description |
|---------|--------|-------------|
| Bounce de l'avatar à la parole | **désactivé** | Anime l'avatar (zoom) quand tu parles |
| Intensité du bounce | 1.15 | Facteur d'échelle de l'animation |
| Sensibilité micro | 18 | Seuil de volume pour considérer que tu parles |

Les réglages et les images sont sauvegardés dans le `localStorage` du navigateur.

### Partage d'écran

Quand un participant partage son écran, une **grande tuile dédiée** s'affiche en haut de la
grille (la sienne ou celle des autres). Elle disparaît à la fin du partage. La caméra et
l'avatar restent visibles en dessous.

### Chat

Un panneau de chat texte est disponible via le bouton "Chat" (badge de messages non lus).
Le nom affiché vient du serveur : impossible d'usurper un autre participant.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `server.js` | Serveur Express + Socket.io (signalisation, chat, broadcast, validation) |
| `public/index.html` | Interface utilisateur |
| `public/style.css` | Styles |
| `public/client.js` | Logique WebRTC (négociation parfaite, médias, avatar réactif, chat) |

## Limites

- 8 participants max par salle (architecture maillage P2P)
- Nécessite HTTPS pour fonctionner hors localhost (fourni automatiquement par Cloudflare/ngrok)
- Pas d'enregistrement
