#!/bin/sh

# Example 4: Start HTTP server
# This demonstrates running the HTTP server with configuration

echo "=== Example 4: HTTP Server ==="
echo ""
echo "Starting HTTP server on port 9000..."
echo ""

export MCPC_CONFIG='[
  {
    "name": "http-agent",
    "description": "Agent exposed via HTTP",
    "deps": {
      "mcpServers": {}
    }
  }
]'

echo "Server will be available at: http://localhost:9000"
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/server.ts
