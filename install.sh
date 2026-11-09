#!/usr/bin/env bash
# Installe / met a jour PDF Moodle Restore + mise a jour auto (timer systemd).
# Usage : curl -fsSL https://raw.githubusercontent.com/glime32/pdf-moodle-restore/main/install.sh | bash
set -euo pipefail

REPO="https://github.com/glime32/pdf-moodle-restore.git"
DIR="$HOME/extensions/pdf-fix"

if ! command -v git >/dev/null; then
  echo "Installation de git..."
  sudo pacman -S --needed --noconfirm git
fi

mkdir -p "$HOME/extensions"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  if [ -d "$DIR" ]; then
    mv "$DIR" "$DIR.ancien-$(date +%Y%m%d-%H%M%S)"
  fi
  git clone "$REPO" "$DIR"
fi

# Timer systemd utilisateur : git pull au demarrage de la session puis toutes les heures
UNIT="$HOME/.config/systemd/user"
mkdir -p "$UNIT"

cat > "$UNIT/pdf-moodle-restore-maj.service" <<EOF
[Unit]
Description=Mise a jour de l extension PDF Moodle Restore
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=$DIR/update.sh
EOF

cat > "$UNIT/pdf-moodle-restore-maj.timer" <<EOF
[Unit]
Description=Mise a jour auto de PDF Moodle Restore

[Timer]
OnStartupSec=30s
OnUnitActiveSec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now pdf-moodle-restore-maj.timer

echo
echo "OK : extension dans $DIR"
echo "Mise a jour auto : active (toutes les heures)."
echo
echo "Premiere installation seulement : dans Helium, chrome://extensions"
echo "  -> Mode developpeur -> Charger l extension non empaquetee -> $DIR"
echo "Deja chargee depuis ce dossier ? Rien a faire, elle se recharge seule."
