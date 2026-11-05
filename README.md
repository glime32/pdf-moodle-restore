# PDF Moodle Restore

Extension pour **Helium** (ou tout navigateur Chromium) avec l'extension **PDF Viewer** (pdf.js).

## Le problème

Après un redémarrage, Helium restaure les onglets PDF Moodle… mais la session Moodle est perdue.
Le lecteur PDF reçoit une page de connexion au lieu du PDF → page vide.

## Ce que fait l'extension

Au démarrage d'Helium, si des PDF Moodle sont ouverts et que tu n'es plus connecté :

1. ouvre la connexion CAS de Moodle ;
2. Bitwarden remplit l'identifiant et le mot de passe, l'extension clique sur « Se connecter » ;
3. dès que Moodle répond, ferme l'onglet CAS, **revient sur ton onglet** et recharge les PDF sur place.

Aucun mot de passe n'est stocké par l'extension : c'est Bitwarden qui remplit.

## Installation

Dans un terminal :

```bash
curl -fsSL https://raw.githubusercontent.com/glime32/pdf-moodle-restore/main/install.sh | bash
```

Puis, **la première fois seulement** : `chrome://extensions` → Mode développeur →
Charger l'extension non empaquetée → `~/extensions/pdf-fix`.

### Réglages Bitwarden

- Remplissage automatique → **Remplissage automatique au chargement de la page** : activé
- Sécurité → **Délai d'expiration du coffre** : Jamais (sinon le coffre est verrouillé au démarrage)

## Mises à jour

`install.sh` crée un timer systemd utilisateur qui fait `git pull` au démarrage puis toutes les heures.
L'extension voit la nouvelle version sur le disque et se recharge toute seule.

Vérifier le timer : `systemctl --user status pdf-moodle-restore-maj.timer`

## Désinstaller

```bash
systemctl --user disable --now pdf-moodle-restore-maj.timer
rm ~/.config/systemd/user/pdf-moodle-restore-maj.*
rm -rf ~/extensions/pdf-fix
```

Puis retirer l'extension dans `chrome://extensions`.
