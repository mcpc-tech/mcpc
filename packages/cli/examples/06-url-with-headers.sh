#!/bin/sh

# Example 6: Load configuration from URL with custom headers
# This demonstrates fetching config from a URL with authentication headers

echo "=== Example 6: Configuration from URL with Custom Headers ==="
echo ""
echo "This example loads configuration from a URL with custom HTTP headers"
echo "Useful for accessing private/authenticated configuration endpoints"
echo ""

# Example with GitHub API (requires personal access token)
if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  CONFIG_URL="https://api.github.com/repos/mcpc-tech/mcpc/contents/packages/cli/examples/configs/codex-fork.json"
  
  echo "Fetching config from GitHub API with authentication:"
  echo "  $CONFIG_URL"
  echo ""
  echo "Using custom headers:"
  echo "  - Authorization: Bearer \$GITHUB_PERSONAL_ACCESS_TOKEN"
  echo "  - Accept: application/vnd.github.raw"
  echo ""
  echo "Starting STDIO server..."
  echo "Press Ctrl+C to stop"
  echo ""
  
  deno run --allow-all src/bin.ts \
    --config-url "$CONFIG_URL" \
    -H "Authorization: Bearer $GITHUB_PERSONAL_ACCESS_TOKEN" \
    -H "Accept: application/vnd.github.raw"
else
  # Fallback to public URL
  CONFIG_URL="https://raw.githubusercontent.com/mcpc-tech/mcpc/main/packages/cli/examples/configs/codex-fork.json"
  
  echo "Note: GITHUB_PERSONAL_ACCESS_TOKEN not set"
  echo "Using public URL instead:"
  echo "  $CONFIG_URL"
  echo ""
  echo "Starting STDIO server..."
  echo "Press Ctrl+C to stop"
  echo ""
  
  deno run --allow-all src/bin.ts --config-url "$CONFIG_URL"
fi
