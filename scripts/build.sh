#!/bin/bash
set -e

cd "$(dirname "$0")/.." # run from project root regardless of where script is called from

echo "Installing root dependencies..."
npm install

echo "Installing renderer dependencies..."
npm --prefix renderer install

echo "Building..."
npm run package

echo "Done → release/toop journal-$(node -p "require('./package.json').version")-arm64.dmg"
