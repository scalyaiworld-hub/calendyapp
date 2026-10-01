#!/usr/bin/env bash
# Lista los git worktrees extra y quita solo los seguros.
# Seguro = sin cambios pendientes, rama subida al remoto sin commits sin subir
# y (PR fusionado o rama ya contenida en origin/main).
#
# Uso:
#   scripts/clean-worktrees.sh           # solo informa (dry-run)
#   scripts/clean-worktrees.sh --apply   # quita los seguros (sin --force)

set -u

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

cd "$(git rev-parse --show-toplevel)" || exit 1
main_wt=$(git rev-parse --show-toplevel)

git fetch -q origin 2>/dev/null || echo "aviso: no se pudo hacer fetch; los datos del remoto pueden estar desactualizados"

removed=0
kept=0

while read -r path; do
  [ "$path" = "$main_wt" ] && continue

  branch=$(git -C "$path" branch --show-current)
  name=$(basename "$path")

  if [ -z "$branch" ]; then
    echo "KEEP   $name: HEAD desacoplado (sin rama)"
    kept=$((kept + 1))
    continue
  fi

  dirty=$(git -C "$path" status --porcelain | wc -l | tr -d ' ')
  if [ "$dirty" != "0" ]; then
    echo "KEEP   $name ($branch): $dirty archivo(s) con cambios sin commitear"
    kept=$((kept + 1))
    continue
  fi

  if [ "$(git branch -r --list "origin/$branch" | wc -l | tr -d ' ')" = "0" ]; then
    echo "KEEP   $name ($branch): la rama no está en el remoto"
    kept=$((kept + 1))
    continue
  fi

  unpushed=$(git rev-list --count "origin/$branch..$branch")
  if [ "$unpushed" != "0" ]; then
    echo "KEEP   $name ($branch): $unpushed commit(s) sin subir"
    kept=$((kept + 1))
    continue
  fi

  in_main=$(git rev-list --count "origin/main..$branch")
  pr_merged=0
  if command -v gh >/dev/null 2>&1; then
    pr_merged=$(gh pr list --head "$branch" --state merged --json number -q 'length' 2>/dev/null || echo 0)
  fi
  if [ "$in_main" != "0" ] && [ "${pr_merged:-0}" = "0" ]; then
    echo "KEEP   $name ($branch): $in_main commit(s) que no están en main y sin PR fusionado"
    kept=$((kept + 1))
    continue
  fi

  if [ "$APPLY" = "1" ]; then
    if git worktree remove "$path"; then
      echo "REMOVE $name ($branch)"
      removed=$((removed + 1))
    else
      echo "KEEP   $name ($branch): git se negó a quitarlo"
      kept=$((kept + 1))
    fi
  else
    echo "SAFE   $name ($branch): se quitaría con --apply"
    removed=$((removed + 1))
  fi
done < <(git worktree list --porcelain | sed -n 's/^worktree //p')

git worktree prune

if [ "$APPLY" = "1" ]; then
  echo "Quitados: $removed | Conservados: $kept"
else
  echo "Seguros: $removed | Conservados: $kept (dry-run, usa --apply para quitar)"
fi
