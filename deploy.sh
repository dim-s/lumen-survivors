#!/usr/bin/env bash
# =====================================================================
# Релиз LUMEN — Survivors на GitHub Pages.
# Коммитит изменения и пушит в main; Pages пересобирается сам (~1 мин).
#
#   ./deploy.sh "что изменил"
#
# Живая ссылка: https://dim-s.github.io/lumen-survivors/
# =====================================================================
set -e
cd "$(dirname "$0")"

msg="${1:-update}"

if [ -z "$(git status --porcelain)" ]; then
  echo "Нет изменений для релиза."
  exit 0
fi

git add -A
git commit -m "$msg"
git push

echo ""
echo "✓ Запушено. GitHub Pages обновится за ~1 минуту:"
echo "  https://dim-s.github.io/lumen-survivors/"
