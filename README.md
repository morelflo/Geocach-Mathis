# 🗺️ Geocach-Mathis – Chasse au trésor GPS

Petite application web de géocaching pour un anniversaire d'enfant (pensée pour 6 ans).

- **Le jeu** (`index.html`) : une grosse flèche-boussole indique la direction de la cachette.
  L'écran indique « froid / tiède / chaud / brûlant » (le fond change de couleur) et la distance en mètres et en pas.
  L'énigme est **lue à voix haute** (bouton 🔊), avec un indice facultatif.
  Arrivé à moins de 15 m de la cachette : confettis, fanfare, vibration, puis énigme suivante.
  À la fin, un écran « trésor » affiche tous les badges gagnés.
- **Le back-office** (`admin.html`) : placez 3 ou 4 cachettes sur une carte (clic, ou « Ajouter à ma position » en marchant sur place).
  Les marqueurs se déplacent à la main. Pour chaque cachette, vous écrivez l'énigme, l'indice, le message de victoire et l'emoji gagné.
  Tout s'enregistre automatiquement.

Pas de serveur, pas de compte, pas de base de données : ce sont des fichiers HTML/JS statiques.

## 1. Mettre en ligne (obligatoire pour le GPS sur téléphone)

Les téléphones n'autorisent le GPS et la boussole que sur un site **HTTPS**. Le plus simple est GitHub Pages (gratuit) :

1. Sur GitHub : **Settings → Pages**.
2. *Source* : « Deploy from a branch », choisir la branche (par ex. `main`) et le dossier `/ (root)`, puis **Save**.
3. Après une minute, le site est disponible sur `https://<votre-compte>.github.io/Geocach-Mathis/`.
   - Le jeu : `…/Geocach-Mathis/`
   - Le back-office : `…/Geocach-Mathis/admin.html`

Test sur ordinateur : `python3 -m http.server` dans le dossier, puis ouvrir http://localhost:8000/admin.html.

## 2. Préparer la chasse

Deux façons de faire :

**A. Directement sur le téléphone de jeu (le plus simple)**
Ouvrez `admin.html` sur le téléphone, allez au parc et, devant chaque cachette, appuyez sur
**📍 Ajouter à ma position**, puis écrivez l'énigme. La chasse est enregistrée dans ce téléphone.

**B. Depuis l'ordinateur, puis envoi au téléphone**
Préparez tout sur l'ordinateur. Cliquez ensuite sur **📱 Envoyer vers un téléphone** et scannez le QR code (ou envoyez le lien par SMS).
La chasse complète est contenue dans le lien et s'enregistre sur le téléphone à l'ouverture.

**C. Chasse « officielle » dans le dépôt** (facultatif)
**💾 Exporter** télécharge un `hunt.json`. Remplacez celui du dépôt pour qu'il soit chargé par défaut sur n'importe quel appareil.
Ordre de chargement : lien partagé > chasse enregistrée sur l'appareil > `hunt.json`.

> Le `hunt.json` fourni est un **exemple** (au jardin du Luxembourg) avec des énigmes adaptées à 6 ans :
> l'arbre, le banc, la fontaine, le toboggan. Gardez les textes, déplacez juste les points !

## 3. Tester avant le jour J

- **🧪 Tester (simulation)** (`index.html?sim=1`) : une carte s'affiche, touchez-la pour « déplacer » le joueur.
  Vous vérifiez ainsi tout le parcours depuis le canapé.
- **↺ Remettre la partie à zéro** avant de donner le téléphone à l'enfant.

## 4. Le jour J : conseils

- Mettez le volume à fond, luminosité au maximum. L'écran reste allumé pendant le jeu.
- Au premier lancement, **acceptez la localisation** et, sur iPhone, l'accès à « mouvement et orientation » (boussole).
- Le GPS d'un téléphone peut se tromper de 10 à 20 m, surtout sous les arbres. Si la cachette ne se valide pas,
  le bouton **⋯** (en haut à droite, menu parent) permet de **valider la cachette** ou de revenir en arrière.
- Rayon de 15 m conseillé, à augmenter (20-25 m) dans un parc très boisé.
- Tenez le téléphone à plat pour que la boussole soit fiable. Si la boussole n'est pas disponible, la flèche
  montre la direction avec le Nord en haut (activez alors « Montrer la carte à l'enfant »).
- La partie en cours est sauvegardée : fermer l'appli ou recharger la page ne fait rien perdre.

## Structure

```
index.html      le jeu
admin.html      le back-office
hunt.json       la chasse par défaut (exemple)
css/style.css
js/hunt.js      données, partage, calculs GPS (commun)
js/player.js    logique du jeu
js/admin.js     logique du back-office
```

Bibliothèques chargées par CDN : [Leaflet](https://leafletjs.com) (cartes OpenStreetMap) et qrcodejs (QR code).
Il n'y a pas de mot de passe sur le back-office : l'adresse `admin.html` n'est simplement pas montrée à l'enfant.
