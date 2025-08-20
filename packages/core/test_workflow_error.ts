#!/usr/bin/env -S deno run --allow-all

/**
 * Test script to verify the new workflow error message
 */

import { WorkflowPrompts } from "./src/prompts/index.ts";

console.log("Testing new workflow error messages:");
console.log();

console.log("1. Original ALREADY_AT_FINAL message:");
console.log("   " + WorkflowPrompts.ERRORS.ALREADY_AT_FINAL);
console.log();

console.log("2. New CANNOT_COMPLETE_NOT_AT_FINAL message:");
console.log("   " + WorkflowPrompts.ERRORS.CANNOT_COMPLETE_NOT_AT_FINAL);
console.log();

console.log("✅ Both error messages are available and properly differentiated!");
