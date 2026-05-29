#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NATIVE_DIR="$PROJECT_ROOT/native/stata_bridge"
BUILD_DIR="$PROJECT_ROOT/build_temp"
BIN_DIR="$PROJECT_ROOT/bin"

ARM64_OUT="$BUILD_DIR/arm64.node"
X86_64_OUT="$BUILD_DIR/x86_64.node"
FINAL_OUT="$BIN_DIR/stata_bridge-darwin.node"

echo "=========================================="
echo "Building stata_bridge universal2 binary"
echo "=========================================="

command -v node-gyp &> /dev/null || { echo "ERROR: node-gyp not installed (npm install -g node-gyp)"; exit 1; }
[ -d "$NATIVE_DIR" ] || { echo "ERROR: Native module not found: $NATIVE_DIR"; exit 1; }

mkdir -p "$BUILD_DIR" "$BIN_DIR"

echo ""
echo "=== Step 1: Building for arm64 ==="
cd "$NATIVE_DIR"
node-gyp clean 2>/dev/null || true
node-gyp configure --arch=arm64
node-gyp build --arch=arm64

ARM64_NODE=$(find "$NATIVE_DIR" -name "*.node" -path "*arm64*" 2>/dev/null | head -1)
[ -z "$ARM64_NODE" ] && ARM64_NODE=$(find "$NATIVE_DIR/build" -name "*.node" 2>/dev/null | head -1)
[ -f "$ARM64_NODE" ] || { echo "ERROR: arm64 build failed"; exit 1; }

cp "$ARM64_NODE" "$ARM64_OUT"
echo "arm64 build successful: $ARM64_OUT"

echo ""
echo "=== Step 2: Building for x86_64 (via Rosetta) ==="
node-gyp clean 2>/dev/null || true
arch -x86_64 node-gyp configure
arch -x86_64 node-gyp build

X86_64_NODE=$(find "$NATIVE_DIR" -name "*.node" -path "*x86_64*" 2>/dev/null | head -1)
[ -z "$X86_64_NODE" ] && X86_64_NODE=$(find "$NATIVE_DIR/build" -name "*.node" 2>/dev/null | head -1)
[ -f "$X86_64_NODE" ] || { echo "ERROR: x86_64 build failed"; exit 1; }

cp "$X86_64_NODE" "$X86_64_OUT"
echo "x86_64 build successful: $X86_64_OUT"

echo ""
echo "=== Step 3: Merging with lipo ==="
lipo -create "$ARM64_OUT" "$X86_64_OUT" -output "$FINAL_OUT"

echo ""
echo "=== Step 4: Verifying universal2 binary ==="
lipo -info "$FINAL_OUT"

echo ""
echo "=== Step 5: Cleaning up ==="
rm -rf "$BUILD_DIR"
echo "Cleanup complete"

echo ""
echo "=========================================="
echo "BUILD SUCCESSFUL"
echo "Output: $FINAL_OUT"
echo "=========================================="

exit 0
