#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> setting up book of toop agent..."
echo ""

confirm() {
  read -p "$1 (y/n) " answer
  [ "$answer" = "y" ]
}

# check for homebrew
echo "--- [1/3] checking for homebrew..."
if ! command -v brew &>/dev/null; then
  echo "homebrew is not installed. install it at https://brew.sh, then re-run this script."
  exit 1
fi
echo "✓ homebrew found"
echo ""

# check for ollama
echo "--- [2/3] checking for ollama..."
if [ ! -f "/opt/homebrew/bin/ollama" ]; then
  echo "ollama not found."
  if confirm "install ollama via homebrew?"; then
    brew install ollama
    echo "✓ ollama installed"
  else
    echo "skipping. agent will not work without ollama."
  fi
else
  echo "✓ ollama found"
fi
echo ""

# check for qwen2.5:7b-instruct model (check manifest files directly — doesn't require server to be running)
echo "--- [3/3] checking for qwen2.5:7b-instruct model..."
if [ ! -d "$HOME/.ollama/models/manifests/registry.ollama.ai/library/qwen2.5" ]; then
  echo "qwen2.5:7b-instruct not found (~5GB download)."
  if confirm "pull qwen2.5:7b-instruct now?"; then
    ollama pull qwen2.5:7b-instruct
    echo "✓ qwen2.5:7b-instruct pulled"
  else
    echo "skipping. agent will not work without qwen2.5:7b-instruct."
  fi
else
  echo "✓ qwen2.5:7b-instruct found"
fi
echo ""

# rebuild better-sqlite3 only if needed
echo "--- [4/4] checking better-sqlite3 compatibility..."
if node -e "require('$PROJECT_ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node')" &>/dev/null; then
  echo "✓ better-sqlite3 already compatible"
else
  echo "better-sqlite3 needs to be rebuilt for your current node version."
  if confirm "rebuild now?"; then
    npm rebuild better-sqlite3
    echo "✓ better-sqlite3 rebuilt"
  else
    echo "skipping. test script will fail without this."
  fi
fi

echo ""
echo "==> setup complete. run: npx tsx main/agent/test.ts"
