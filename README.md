# WebRTC Call

Application d'appel audio/vidéo P2P avec partage d'écran, auto-hébergée sur ta machine.

## Architecture

```
Navigateur A ◄──── WebRTC P2P ────► Navigateur B
       ▲                                ▲
       │      Serveur de signalisation  │
       └────────── (Socket.io) ─────────┘
              (pas de relais média)
```

Le serveur Node.js ne fait qu'établir les connexions (signalisation). Une fois connectés, les médias (audio, vidéo, écran) circulent directement entre les navigateurs en P2P.

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

## Inviter des personnes à distance

Le serveur écoute sur le port 3000 de ta machine. Pour que des amis à distance puissent se connecter, expose ton serveur :

### Option 1 : Cloudflare Tunnel (recommandé, gratuit)

```bash
npm install -g cloudflared
cloudflared tunnel --url http://localhost:3000
```

### Option 2 : ngrok

```bash
npx ngrok http 3000
```

### Option 3 : même réseau local

Donne simplement ton IP locale (ex: `http://192.168.1.42:3000`).

## Fonctionnement

1. **Créer un appel** — clic sur "Créer un appel", un code de 6 caractères est généré
2. **Inviter** — envoie le code (ou le lien avec `?room=CODE`) à tes amis
3. **Appel** — micro, caméra et partage d'écran fonctionnent en P2P
4. **Quitter** — le code de salle est supprimé une fois tout le monde parti

## Fichiers

| Fichier | Rôle |
|---------|------|
| `server.js` | Serveur Express + Socket.io (signalisation) |
| `public/index.html` | Interface utilisateur |
| `public/style.css` | Styles |
| `public/client.js` | Logique WebRTC (connexions P2P, médias) |

## Limites

- 2-6 participants recommandés (architecture maillage P2P)
- Nécessite HTTPS pour fonctionner hors localhost (fourni automatiquement par Cloudflare/ngrok)
- Pas d'enregistrement ni de chat texte
