# Déployer Cohérence-Politique : administration locale, site public

Cohérence-Politique fonctionne en deux instances séparées, sur deux adresses différentes.

| | Machine locale (vous) | Site public (serveur) |
|---|---|---|
| Rôle | Calculer : imports, classification, programmes, synthèses, chat « Demander » | Montrer : toutes les pages de données, en lecture seule |
| Claude | Votre abonnement via Claude Code (`claude -p`) | Aucun : pas de clé, pas de job, pas de chat |
| Administration | Onglets « Demander » et « Données & jobs » | Inexistante : pas d'onglet, pas de page `/admin`, les API répondent 404 |
| Base de données | `data/coherence.db`, mise à jour par les jobs | Copie reçue par `npm run publish` |

La seule porte d'entrée du site public est la réception de la base (`PUT /api/admin/db`), protégée par un jeton long. Elle ne permet que d'écrire une base SQLite vérifiée (intégrité, tables attendues) ; elle ne donne accès à rien d'autre.

## 1. Préparer le jeton

Générez un jeton d'au moins 24 caractères, par exemple :

```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Mettez-le dans le `.env` local :

```
COHERENCE_ADMIN_TOKEN=<le jeton>
COHERENCE_PUBLISH_URL=https://votre-domaine.fr
```

En local, le jeton a un effet secondaire : les onglets d'administration demandent une connexion sur `/admin` (mot de passe = le jeton). Si vous êtes seul sur votre machine, vous pouvez laisser `COHERENCE_ADMIN_TOKEN` vide en local et ne le passer qu'au moment de publier :

```
COHERENCE_ADMIN_TOKEN=<le jeton> npm run publish -- https://votre-domaine.fr
```

## 2. Héberger le site public

Un petit serveur (VPS à 5 € par mois, Fly.io, Railway…) suffit : Next.js et SQLite tiennent dans un conteneur. Vercel ne convient pas (binaire natif `better-sqlite3`, disque persistant nécessaire).

Avec Docker, sur le serveur :

```
git clone https://github.com/BigBlackC0de/coherence-politique.git && cd coherence-politique
docker build -t coherence .
docker run -d --name coherence --restart unless-stopped \
  -p 3000:3000 \
  -v coherence-data:/data \
  -e COHERENCE_ADMIN_TOKEN=<le jeton> \
  coherence
```

L'image fixe déjà `COHERENCE_PUBLIC=1` : aucune administration n'est servie. Placez un reverse proxy avec HTTPS devant (Caddy fait cela en deux lignes : `votre-domaine.fr { reverse_proxy localhost:3000 }`). Le proxy doit accepter des corps de requête de plusieurs centaines de Mo pour la publication (Caddy : `request_body { max_size 2GB }` ; Nginx : `client_max_body_size 2g;`).

## 3. Publier

Depuis la machine locale, quand les analyses sont à jour :

```
npm run publish
```

Le script fait une copie cohérente de la base, retire les PDF binaires et l'historique du chat (inutiles au public, lourds), puis l'envoie. Le serveur vérifie l'intégrité et bascule sans interruption. Comptez quelques centaines de Mo par publication ; relancez-la après chaque série de jobs.

## 3 bis. Veille automatique des nouveaux votes

Les analyses qui utilisent Claude tournent sur la machine locale (abonnement ou clé), pas sur le serveur public. La veille fait donc le lien : elle vérifie l'Assemblée et le Sénat, analyse ce qui est nouveau, puis republie.

```
npm run veille                  # vérifie, traite les nouveautés, publie si besoin
npm run veille -- --budget 10   # plafond de coût du passage (20 $ équiv. par défaut)
npm run veille -- --no-publish  # analyse sans publier
```

Ce qu'elle fait, dans l'ordre : import des scrutins AN et Sénat → classification des seuls nouveaux scrutins → comptes rendus, débats, explication des votes des 45 derniers jours (les comptes rendus arrivent après le vote) → scores → réécriture des synthèses des **seuls thèmes** touchés par un vote notable (importance 3 ou plus) → publication si la base a changé. Sans nouveauté, elle ne coûte rien et ne publie rien. Les prises de parole (analyse coûteuse) restent un job séparé.

Planification Windows, une fois par jour à 7 h 30 (le poste doit être allumé ; `/RL LIMITED` n'exige pas de droits administrateur) :

```
schtasks /Create /SC DAILY /ST 07:30 /TN "Coherence-Politique veille" /TR "cmd /c cd /d C:\chemin\vers\coherence-politique && npm run veille >> data\veille.log 2>&1" /RL LIMITED
```

Pour la lancer à la main : `schtasks /Run /TN "Coherence-Politique veille"`. Pour la retirer : `schtasks /Delete /TN "Coherence-Politique veille" /F`. Le journal est dans `data/veille.log`. L'Assemblée met ses données à jour chaque jour, le Sénat (via NosParlementaires) avec un décalage possible de quelques jours : un passage quotidien suffit.

## 4. Ce que voient les visiteurs

Tout sauf l'administration : boussole, partis, thèmes, scrutins, parlementaires, assiduité, comparaison. Mode clair ou sombre selon leur réglage, bascule dans la barre. Aucune donnée personnelle n'est collectée : pas de compte, pas de cookie hors préférence de thème (stockée dans le navigateur).

## Vérifier le cloisonnement

Sur le site public, ces adresses doivent répondre comme indiqué :

| Adresse | Réponse attendue |
|---|---|
| `/sources`, `/demander`, `/admin` | redirection vers l'accueil |
| `POST /api/jobs`, `POST /api/ask`, `POST /api/documents` | 404 |
| `PUT /api/admin/db` sans jeton | 401 |
