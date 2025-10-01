#!/bin/sh

# Example 3: Start server with config file
# This demonstrates loading configuration from a JSON file

echo "=== Example 3: Configuration from File ==="
echo ""
echo "Creating mcpc.config.json..."
echo ""

# Create config file
cat > mcpc.config.json << 'EOF'
{
  "name": "file-based-server",
  "version": "1.0.0",
  "agents": [
    {
      "name": "file-agent",
      "description": "Agent loaded from config file",
      "deps": {
        "mcpServers": {}
      }
    }
  ]
}
EOF

echo "Config file created: mcpc.config.json"
echo ""
echo "Starting STDIO server (will auto-load mcpc.config.json)..."
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/bin.ts

# Cleanup
rm -f mcpc.config.json
