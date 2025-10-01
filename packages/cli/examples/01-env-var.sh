#!/bin/sh

# Example 1: Start server with environment variable configuration
# This demonstrates loading config from MCPC_CONFIG environment variable

echo "=== Example 1: Configuration from Environment Variable ==="
echo ""
echo "Setting MCPC_CONFIG with a simple agent configuration..."
echo ""

export MCPC_CONFIG='[
  {
    "name": "hello-agent",
    "description": "A simple hello world agent",
    "deps": {
      "mcpServers": {}
    }
  }
]'

echo "Starting STDIO server..."
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/bin.ts
