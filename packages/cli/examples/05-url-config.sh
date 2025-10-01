#!/bin/sh

# Example 5: Load configuration from URL
# This demonstrates fetching config from a remote URL

echo "=== Example 5: Configuration from URL ==="
echo ""
echo "This example loads configuration from a GitHub raw URL"
echo ""

# GitHub raw URL configuration
GITHUB_USER="mcpc-tech"
REPO_NAME="mcpc"
BRANCH="main"
CONFIG_PATH="packages/cli/examples/configs/codex-fork.json"
CONFIG_URL="https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/${BRANCH}/${CONFIG_PATH}"

echo "Fetching config from:"
echo "  $CONFIG_URL"
echo ""
echo "Starting STDIO server..."
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/bin.ts --config-url "$CONFIG_URL"
