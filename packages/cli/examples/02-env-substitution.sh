#!/bin/sh

# Example 2: Configuration with environment variable substitution
# The config uses $GITHUB_PERSONAL_ACCESS_TOKEN which is substituted at runtime

echo "=== Example 2: Environment Variable Substitution ==="
echo ""
echo "The codex-fork.json config uses \$GITHUB_PERSONAL_ACCESS_TOKEN"
echo "Make sure to set it before running:"
echo ""
echo "  export GITHUB_PERSONAL_ACCESS_TOKEN=\"ghp_your_token_here\""
echo ""

if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  echo "⚠️  Warning: GITHUB_PERSONAL_ACCESS_TOKEN not set"
  echo "   GitHub integration will not work"
  echo ""
fi

# Read config file
CONFIG=$(cat "$(dirname "$0")/configs/codex-fork.json")

echo "Starting STDIO server with environment variable substitution..."
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/bin.ts --config "$CONFIG"
