#!/usr/bin/env bash
set -euo pipefail

echo "=== Personal Task & Workload Planner — Desktop Setup Check ==="
echo ""

# 1. Node & npm
echo "[1/4] Checking Node.js and npm..."
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v)
  echo "  ✓ Node.js installed: $NODE_VER"
else
  echo "  ✗ Node.js is missing. Please install Node.js 22 LTS or 24 LTS."
  exit 1
fi

if command -v npm >/dev/null 2>&1; then
  NPM_VER=$(npm -v)
  echo "  ✓ npm installed: $NPM_VER"
else
  echo "  ✗ npm is missing."
  exit 1
fi

# 2. Rust toolchain
echo ""
echo "[2/4] Checking Rust toolchain (rustc, cargo, rustup)..."
RUST_MISSING=0
if command -v rustc >/dev/null 2>&1; then
  echo "  ✓ rustc: $(rustc --version)"
else
  echo "  ✗ rustc not found"
  RUST_MISSING=1
fi

if command -v cargo >/dev/null 2>&1; then
  echo "  ✓ cargo: $(cargo --version)"
else
  echo "  ✗ cargo not found"
  RUST_MISSING=1
fi

if command -v rustup >/dev/null 2>&1; then
  echo "  ✓ rustup: $(rustup --version | head -n 1)"
else
  echo "  ✗ rustup not found"
  RUST_MISSING=1
fi

if [ "$RUST_MISSING" -ne 0 ]; then
  echo ""
  echo "  To install Rust toolchain, run:"
  echo "    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  echo "  Then restart your terminal or run:"
  echo "    source \"\$HOME/.cargo/env\""
  echo ""
fi

# 3. Platform prerequisites
echo "[3/4] Checking OS build prerequisites..."
OS="$(uname -s)"
case "$OS" in
  Darwin)
    echo "  Detected OS: macOS"
    if xcode-select -p >/dev/null 2>&1; then
      echo "  ✓ Xcode Command Line Tools found: $(xcode-select -p)"
    else
      echo "  ✗ Xcode Command Line Tools missing. Run:"
      echo "    xcode-select --install"
    fi
    ;;
  Linux)
    echo "  Detected OS: Linux"
    echo "  Ensure webkit2gtk, libssl-dev, and build-essential packages are installed."
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "  Detected OS: Windows environment"
    echo "  Ensure Microsoft C++ Build Tools or Visual Studio (C++ workload) is installed."
    ;;
  *)
    echo "  Detected OS: $OS"
    ;;
esac

# 4. Summary & next steps
echo ""
echo "[4/4] Next steps:"
if [ "$RUST_MISSING" -eq 0 ]; then
  echo "  ✓ All core tools installed!"
  echo "  - Run in development mode: npm run tauri:dev"
  echo "  - Build desktop bundles:   npm run tauri:build"
else
  echo "  ! Complete Rust installation above before running Tauri desktop commands."
fi
echo "=============================================================="
