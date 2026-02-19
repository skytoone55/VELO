#!/bin/bash
# Script pour lancer PPE avec son propre .env
# Sauvegarde .env.local, remplace par .env.ppe.local, puis restaure à l'arrêt

cd "$(dirname "$0")/.."

# Sauvegarder le .env.local actuel
if [ -f .env.local ]; then
  cp .env.local .env.local.bak
fi

# Copier le .env PPE
cp .env.ppe.local .env.local

# Fonction de restauration
cleanup() {
  echo ""
  echo "🔄 Restauration de .env.local (ECO-VOLT)..."
  if [ -f .env.local.bak ]; then
    cp .env.local.bak .env.local
    rm .env.local.bak
  fi
  echo "✅ Restauré"
}

# Restaurer même en cas de Ctrl+C
trap cleanup EXIT

echo "🟢 Démarrage PPE Énergie sur port 3003..."
npx next dev -p 3003
