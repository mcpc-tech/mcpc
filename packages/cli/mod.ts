// CLI package main exports
export { createApp, createServer } from "./src/app.ts";
export * from "./src/server.ts";
export {
  loadConfig,
  type MCPCConfig,
  validateConfig,
} from "./src/config/loader.ts";

// Re-export markdown loader from plugin package
export {
  isMarkdownAgentFile,
  loadMarkdownAgentFile,
  type MarkdownAgentFrontMatter,
  markdownAgentToComposeDefinition,
  markdownLoaderPlugin,
  type ParsedMarkdownAgent,
  parseMarkdownAgent,
} from "@mcpc/plugin-markdown-loader";

// Register markdown loader for CLI usage (auto-enabled)
import {
  loadMarkdownAgentFile,
  setMarkdownAgentLoader,
} from "@mcpc/plugin-markdown-loader";
setMarkdownAgentLoader(loadMarkdownAgentFile);
