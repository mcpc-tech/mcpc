#!/bin/sh

# Example 1: Inline configuration with --config
# Load config file and pass as inline JSON

echo "=== Example 1: Inline Configuration ==="
echo ""
echo "Reading codex-fork.json and passing as --config argument..."
echo ""

# Read config file
CONFIG=$(cat "$(dirname "$0")/configs/codex-fork.json")

echo "Starting STDIO server with inline config..."
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/bin.ts --config "$CONFIG"
