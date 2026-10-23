#!/bin/bash
# Build the Data Viewer plugin (Stata C plugin API) for Linux.
# Output: bin/stata_data_bridge-linux.plugin
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE_DIR="$PROJECT_ROOT/native/stata_data_plugin"
OUTPUT="$PROJECT_ROOT/bin/stata_data_bridge-linux.plugin"

command -v gcc &> /dev/null || { echo "ERROR: gcc not found (e.g. sudo apt install build-essential)"; exit 1; }
mkdir -p "$PROJECT_ROOT/bin"

gcc -shared -fPIC -O2 -DSYSTEM=OPUNIX \
    "$SOURCE_DIR/stplugin.c" "$SOURCE_DIR/stata_data_plugin.c" \
    -o "$OUTPUT"

nm -D "$OUTPUT" | grep -q " T stata_call" || { echo "ERROR: stata_call is not exported from $OUTPUT"; exit 1; }
echo "Output: $OUTPUT"
