#!/bin/bash
set -e

INSTALL_DIR="$HOME/.cgraph"

echo "Installing cgraph..."

if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing install..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone --depth 1 https://github.com/NSLog0/cgraph.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
npm install --omit=dev
npm link

echo ""
echo "Done! Run: cgraph --version"
