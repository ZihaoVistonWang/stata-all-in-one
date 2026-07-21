#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE_DIR="$PROJECT_ROOT/native/stata_data_plugin"
BUILD_DIR="$PROJECT_ROOT/build_data_plugin"
OUTPUT="$PROJECT_ROOT/bin/stata_data_bridge-darwin.plugin"

mkdir -p "$BUILD_DIR" "$PROJECT_ROOT/bin"

clang -bundle -DSYSTEM=APPLEMAC \
    "$SOURCE_DIR/stplugin.c" "$SOURCE_DIR/stata_data_plugin.c" \
    -o "$BUILD_DIR/stata_data_bridge.arm64.plugin" \
    -target arm64-apple-macos11

clang -bundle -DSYSTEM=APPLEMAC \
    "$SOURCE_DIR/stplugin.c" "$SOURCE_DIR/stata_data_plugin.c" \
    -o "$BUILD_DIR/stata_data_bridge.x86_64.plugin" \
    -target x86_64-apple-macos10.15

lipo -create \
    "$BUILD_DIR/stata_data_bridge.arm64.plugin" \
    "$BUILD_DIR/stata_data_bridge.x86_64.plugin" \
    -output "$OUTPUT"

lipo -info "$OUTPUT"
node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true })" "$BUILD_DIR"
