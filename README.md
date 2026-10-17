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

## Confidentialité

Les pseudos sont visibles par défaut et peuvent être masqués localement avec « Afficher les pseudos »; ce choix est enregistré dans le navigateur. Le pseudo et les avatars sont conservés uniquement dans le stockage local du navigateur; les avatars choisis sont transmis aux participants par la signalisation, donc choisis des images que tu acceptes de partager. Les largeurs et l'état ancré des panneaux participants/paramètres sont également mémorisés localement. Le lien de salle et la source navigateur OBS placent le code temporaire dans le fragment URL (`#room=...`), qui n'est pas envoyé dans la requête HTTP ni dans les journaux du serveur. Toute personne qui reçoit ce lien peut toutefois entrer dans l'appel tant que la salle est active; le fragment peut rester dans l'historique du navigateur, être copié ou apparaître dans une capture d'écran. Il est retiré de l'adresse après une jointure réussie et un nouvel appel génère un nouveau code. L'application n'affiche pas les adresses IP, candidats ICE ou descriptions SDP.

WebRTC échange néanmoins des descriptions SDP et candidats ICE via le serveur de signalisation, puis avec les autres navigateurs ; des informations réseau peuvent donc être visibles par le serveur et les pairs selon le navigateur et le réseau. Le partage d'écran capture ce que tu choisis dans la boîte de dialogue du navigateur : vérifie la fenêtre ou l'écran sélectionné avant de partager.

## Prérequis

- Node.js 16+

## Installation

```bash
cd webrtc-call
npm install
```

## Lancement

```bash
npm start
```

Puis ouvre http://localhost:3000 dans ton navigateur.

Par défaut, le serveur écoute uniquement sur ta machine (`127.0.0.1`). Pour le rendre accessible aux autres appareils de ton réseau local, définis `HOST=0.0.0.0` avant de le lancer.

Sous PowerShell :

```powershell
$env:HOST = "0.0.0.0"
npm start
```

## Inviter des personnes à distance

Pour inviter un ami hors de ton réseau local, utilise un tunnel HTTPS vers le serveur local. Le serveur reste lié à `127.0.0.1` ; le tunnel fournit l'accès public temporaire :

### Option 1 : Cloudflare Tunnel (recommandé, gratuit)

```bash
npm install -g cloudflared
cloudflared tunnel --url http://localhost:3000
```

### Option 2 : ngrok

```bash
npx ngrok http 3000
```

### Même réseau local

Lance le serveur avec `HOST=0.0.0.0`, puis donne à ton ami ton IP locale et le port (ex: `http://192.168.1.42:3000`). L'accès direct par HTTP peut ne pas autoriser la caméra et le micro ; HTTPS est recommandé.

## Fonctionnement

1. **Créer un appel** — clic sur « Créer un appel »; un code de 6 caractères est généré.
2. **Inviter** — copie le lien d'appel depuis l'interface. Il préremplit le code via le fragment URL; à la jointure réussie, le fragment est retiré de la barre d'adresse. Partage le lien uniquement avec les personnes autorisées.
3. **Pseudo** — le nom choisi est restauré depuis le stockage local du navigateur au prochain passage sur cet appareil.
4. **OBS Browser Source** — dans OBS, ajoute une source navigateur et utilise le lien fourni par « Copier le lien OBS ». La page transparente affiche les pseudos et avatars réactifs des personnes présentes sans rejoindre l'appel comme participant, sans demander micro/caméra et sans transmettre de média. Depuis la liste des participants, ouvre un nom pour copier un lien OBS filtré sur cette personne ou un lien de groupe. Ces liens sont propres à cette application, pas des liens FugiTech/Reactive. Le filtre et le code sont dans le fragment URL, qui n'est pas envoyé au serveur dans la requête HTTP; le lien individuel ne présente que l'identifiant choisi et le lien de groupe tous les participants. Garde ces liens privés, car ils donnent accès aux avatars/noms de la salle active. Si la salle se termine, la source affiche l'état terminé.
5. **Micro et caméra** — le micro est nécessaire pour rejoindre. La caméra est désactivée par défaut pour préserver la confidentialité; choisis-la dans les périphériques puis active « Caméra » si nécessaire.
6. **Périphériques d'entrée** — sélectionne le microphone et la caméra dans la colonne Paramètres. Les changements s'appliquent pendant l'appel aux pairs connectés; si un appareil est débranché, choisis-en un autre. Les noms des appareils restent dans les menus locaux.
7. **Avatar réactif** — importe séparément des images PNG, JPEG, GIF ou WebP (250 Ko maximum par image) pour le repos et la parole. Les options « petit rebond quand tu parles » et « griser l'image au repos » sont activées par défaut et réglables; elles utilisent uniquement des effets CSS et respectent la réduction des animations du système. La signature binaire est contrôlée en plus du type déclaré; SVG, URL distantes, archives et profils natifs ne sont pas acceptés. L'état parlant est détecté localement à partir du niveau sonore; seul l'état binaire parlant/silencieux et les images choisies sont signalés aux pairs et à la source OBS. Les GIF peuvent rester animés. La page publique [FugiTech Reactive Images](https://reactive.fugi.tech/) consultée sans compte présente seulement une connexion Discord; elle ne documente ni format d'export, ni valeurs par défaut. Ces effets sont des choix sobres propres à l'application, pas une parité revendiquée avec Reactive.
8. **Filtres audio** — l'annulation de l'écho, la réduction du bruit et le volume automatique utilisent les traitements natifs du navigateur lorsqu'ils sont pris en charge. Ils sont activés par défaut et réglables pendant l'appel. Leur effet dépend du navigateur et du matériel ; ce n'est pas un moteur IA tiers identique à celui de Discord.
9. **Partage d'écran** — tu peux partager jusqu'à deux écrans ou fenêtres simultanément, en plus de la caméra. Chaque capture demande une action utilisateur. L'audio système est désactivé par défaut et peut être demandé explicitement pour les prochaines captures; certains navigateurs ou choix de fenêtre ne fournissent pas de piste audio. Si la capture audio échoue, un message indique de réessayer sans audio ou avec un navigateur compatible. L'audio partagé peut exposer des notifications/contenus confidentiels et augmente l'usage réseau/CPU. Chaque source possède son propre aperçu et bouton d'arrêt; les pairs voient chaque flux séparément et peuvent régler le volume/couper l'audio de chaque partage indépendamment du micro et des autres sources. La capture est limitée par défaut à 540p/15 FPS ; la résolution et la fréquence maximale peuvent être ajustées pour toutes les sources actives. Le panneau de partage et chaque vignette peuvent être redimensionnés localement; masquer une vignette ou la redimensionner ne modifie pas la capture ni la taille transmise aux pairs. Les dimensions ne sont pas conservées après la fermeture de la vignette ou de l'appel.
10. **Contrôles et disposition** — la liste des participants à gauche permet de couper/rétablir l'audio distant ou d'ajuster son volume indépendamment. Un clic sur un participant ouvre les liens OBS individuel et de groupe. Chaque partage reçu/émis peut être masqué dans ta propre vue sans interrompre le flux. Le titre de chaque partage apparaît discrètement au survol ou au focus clavier; « Afficher les pseudos » contrôle globalement les noms et est mémorisé localement. L'aperçu local (pseudo/avatar/caméra) est au-dessus du groupe de partages; les autres avatars/caméras sont en dessous. Les panneaux latéraux peuvent être redimensionnés avec leurs séparateurs ou ancrés sur leur bord pour agrandir la zone centrale; largeur et état ancré sont mémorisés sur l'appareil. Sur les écrans étroits, les panneaux redeviennent empilés et peuvent nécessiter un défilement ciblé.
11. **Quitter** — le code de salle est supprimé une fois tout le monde parti.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `server.js` | Serveur Express + Socket.io (signalisation) |
| `public/index.html` | Interface utilisateur |
| `public/style.css` | Styles |
| `public/client.js` | Logique WebRTC (connexions P2P, médias) |
| `public/overlay.html`, `public/overlay.js`, `public/overlay.css` | Source navigateur OBS en lecture seule |

## Limites

- 2-6 participants recommandés (architecture maillage P2P)
- Nécessite HTTPS pour fonctionner hors localhost (fourni automatiquement par Cloudflare/ngrok)
- Pas d'enregistrement ni de chat texte
