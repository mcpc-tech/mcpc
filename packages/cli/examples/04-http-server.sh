#!/bin/sh

# Example 4: HTTP server with configuration
# Expose the agent via HTTP API on port 9000

echo "=== Example 4: HTTP Server ==="
echo ""
echo "Starting HTTP server on port 9000 with codex-fork config..."
echo ""

# Read config file
CONFIG=$(cat "$(dirname "$0")/configs/codex-fork.json")

echo "Server will be available at: http://localhost:9000"
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/server.ts --config "$CONFIG"
