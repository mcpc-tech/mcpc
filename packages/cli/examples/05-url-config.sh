#!/bin/sh

# Example 5: Load configuration from GitHub URL
# This demonstrates fetching config from a remote URL

echo "=== Example 5: Configuration from GitHub URL ==="
echo ""
echo "This example loads configuration from a GitHub raw URL"
echo ""

# Set the GitHub raw URL (replace with your actual repo URL after pushing)
GITHUB_USER="mcpc-tech"
REPO_NAME="mcpc"
BRANCH="main"
CONFIG_PATH="packages/cli/examples/configs/simple.json"

export MCPC_CONFIG_URL="https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/${BRANCH}/${CONFIG_PATH}"

echo "Fetching config from:"
echo "  $MCPC_CONFIG_URL"
echo ""
echo "Starting STDIO server..."
echo "Press Ctrl+C to stop"
echo ""

deno run --allow-all src/bin.ts
