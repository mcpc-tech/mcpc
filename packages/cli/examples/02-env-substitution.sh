#!/bin/sh

# Example 2: Start server with environment variable substitution
# This demonstrates $VAR_NAME substitution in configuration

echo "=== Example 2: Environment Variable Substitution ==="
echo ""
echo "Setting API_KEY and SERVER_NAME environment variables..."
echo ""

export API_KEY="my-secret-api-key-123"
export SERVER_NAME="my-custom-server"

export MCPC_CONFIG='[
  {
    "name": "$SERVER_NAME-agent",
    "description": "Agent with API key: $API_KEY",
    "deps": {
      "mcpServers": {}
    }
  }
]'

echo "Configuration will substitute:"
echo "  \$SERVER_NAME -> $SERVER_NAME"
echo "  \$API_KEY -> $API_KEY"
echo ""
echo "Starting STDIO server..."
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/bin.ts
