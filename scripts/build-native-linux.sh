#!/bin/bash
# Build the stata_bridge Node-API addon for Linux.
# Output: bin/stata_bridge-linux.node (built for the host architecture).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NATIVE_DIR="$PROJECT_ROOT/native/stata_bridge"
BIN_DIR="$PROJECT_ROOT/bin"
FINAL_OUT="$BIN_DIR/stata_bridge-linux.node"
NODE_GYP="$PROJECT_ROOT/node_modules/.bin/node-gyp"

echo "=========================================="
echo "Building stata_bridge for Linux ($(uname -m))"
echo "=========================================="

[ -x "$NODE_GYP" ] || NODE_GYP="$(command -v node-gyp || true)"
[ -n "$NODE_GYP" ] || { echo "ERROR: node-gyp not found (run npm ci, or npm install -g node-gyp)"; exit 1; }
command -v g++ &> /dev/null || { echo "ERROR: g++ not found (e.g. sudo apt install build-essential)"; exit 1; }
[ -d "$NATIVE_DIR" ] || { echo "ERROR: Native module not found: $NATIVE_DIR"; exit 1; }

mkdir -p "$BIN_DIR"

echo ""
echo "=== Step 1: Building ==="
cd "$NATIVE_DIR"
"$NODE_GYP" clean 2>/dev/null || true
"$NODE_GYP" configure
"$NODE_GYP" build

BUILT="$NATIVE_DIR/build/Release/stata_bridge.node"
[ -f "$BUILT" ] || { echo "ERROR: build failed: $BUILT not found"; exit 1; }
cp "$BUILT" "$FINAL_OUT"

echo ""
echo "=== Step 2: Verifying ==="
if command -v ldd &> /dev/null && ldd "$FINAL_OUT" | grep -q "not found"; then
    echo "ERROR: unresolved shared libraries:"
    ldd "$FINAL_OUT" | grep "not found"
    exit 1
fi
node -e "
const addon = require(process.argv[1]);
for (const name of ['initSession', 'execute', 'setBreak', 'shutdown', 'beginDatasetCapture']) {
    if (typeof addon[name] !== 'function') throw new Error('missing export: ' + name);
}
console.log('Exports OK:', Object.keys(addon).length, 'functions');
" "$FINAL_OUT"

echo ""
echo "=========================================="
echo "BUILD SUCCESSFUL"
echo "Output: $FINAL_OUT"
echo "=========================================="

exit 0
