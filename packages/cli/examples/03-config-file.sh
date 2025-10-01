#!/bin/sh

# Example 3: Load configuration from file with --config-file
# Most straightforward way to use a config file

echo "=== Example 3: Configuration from File ==="
echo ""
echo "Using --config-file to load codex-fork.json..."
echo ""

CONFIG_FILE="$(dirname "$0")/configs/codex-fork.json"

echo "Config file: $CONFIG_FILE"
echo ""
echo "Starting STDIO server..."
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/bin.ts --config-file "$CONFIG_FILE"
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/bin.ts

# Cleanup
rm -f mcpc.config.json
