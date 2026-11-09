#!/usr/bin/env bash
# Mise a jour auto (lancee par pdf-moodle-restore-maj.timer) : avance le depot si GitHub a du nouveau.
# Pas de reseau (ou plus de 20 s sans reponse) : on sort sans erreur, le tour suivant reessaie.
# Des modifications locales bloquent la mise a jour : rien n'est ecrase et l'unite passe en echec.
# Tout est dans main() pour que bash lise le script en entier avant que git le remplace.
main() {
  set -uo pipefail
  cd "$(dirname "$(readlink -f "$0")")" || return 1
  if ! timeout 20 git fetch --quiet origin 2>/dev/null; then
    echo "pas de reseau : prochain tour" >&2
    return 0
  fi
  local up
  up=$(git rev-parse --verify --quiet '@{u}') || return 0
  git merge-base --is-ancestor "$up" HEAD && return 0 # rien de nouveau, ou commits locaux pas encore pousses
  # .allowed_signers est lu dans la version deja installee : un push qui le modifie ne change rien
  if ! git -c gpg.ssh.allowedSignersFile="$PWD/.allowed_signers" verify-commit "$up" 2>/dev/null; then
    echo "pdf-moodle-restore : $up n'a pas de signature connue, mise a jour refusee" >&2
    return 1
  fi
  if ! git merge --ff-only --quiet "$up"; then
    echo "pdf-moodle-restore : mise a jour bloquee (modifications locales dans $(pwd))" >&2
    return 1
  fi
}
main "$@"; exit
