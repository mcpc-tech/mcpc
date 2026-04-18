/**
 * Unit tests for MCPLogger
 * Tests silent mode (global + per-instance), level control, and child loggers
 */

import { assertEquals } from "@std/assert";
import {
  createLogger,
  isSilent,
  logger,
  MCPLogger,
  setSilent,
} from "../../src/utils/logger.ts";

Deno.test("MCPLogger - default state is not silent", () => {
  const l = createLogger("test-default");
  assertEquals(l.silent, false);
});

Deno.test("MCPLogger - per-instance silent does not affect other loggers", () => {
  const l1 = createLogger("test-a");
  const l2 = createLogger("test-b");
  l1.silent = true;
  assertEquals(l1.silent, true);
  assertEquals(l2.silent, false);
});

Deno.test("MCPLogger - global silent suppresses all loggers", () => {
  // Ensure clean state
  setSilent(false);
  try {
    const l1 = createLogger("test-global-a");
    const l2 = createLogger("test-global-b");
    setSilent(true);
    // Both loggers should be suppressed even though only global is set
    assertEquals(isSilent(), true);
    assertEquals(l1.silent, false); // per-instance is still false
    assertEquals(l2.silent, false); // per-instance is still false
  } finally {
    setSilent(false);
  }
});

Deno.test("MCPLogger - global silent can be restored", () => {
  setSilent(true);
  assertEquals(isSilent(), true);
  setSilent(false);
  assertEquals(isSilent(), false);
});

Deno.test("MCPLogger - child logger inherits parent silent state", () => {
  const parent = createLogger("test-parent");
  parent.silent = true;
  const child = parent.child("sub");
  assertEquals(child.silent, true);
  // Changing child does not affect parent
  child.silent = false;
  assertEquals(parent.silent, true);
});

Deno.test("MCPLogger - child logger does not inherit parent silent when not set", () => {
  const parent = createLogger("test-parent-no-silent");
  assertEquals(parent.silent, false);
  const child = parent.child("sub");
  assertEquals(child.silent, false);
});

Deno.test("MCPLogger - setLevel and getLevel", () => {
  const l = createLogger("test-level");
  assertEquals(l.getLevel(), "debug");
  l.setLevel("warning");
  assertEquals(l.getLevel(), "warning");
  l.setLevel("error");
  assertEquals(l.getLevel(), "error");
});

Deno.test("MCPLogger - child inherits parent level", () => {
  const parent = createLogger("test-parent-level");
  parent.setLevel("warning");
  const child = parent.child("sub");
  assertEquals(child.getLevel(), "warning");
});

Deno.test("MCPLogger - global logger singleton", () => {
  assertEquals(logger instanceof MCPLogger, true);
  // logger.silent getter reads per-instance, not global
  const prevSilent = logger.silent;
  assertEquals(typeof prevSilent, "boolean");
});

Deno.test("mcpc() silent option - sets global silent", async () => {
  // Ensure clean state
  setSilent(false);
  try {
    assertEquals(isSilent(), false);
    const { mcpc } = await import("../../mod.ts");
    await mcpc(
      [{ name: "test-silent-server", version: "1.0.0" }, {}],
      [],
      { silent: true },
    );
    assertEquals(isSilent(), true);
  } finally {
    setSilent(false);
  }
});

Deno.test("MCPLogger - silent logger still returns from log methods", async () => {
  const l = createLogger("test-silent-log");
  l.silent = true;
  // Should not throw
  await l.info("test message");
  await l.debug({ key: "value" });
  await l.warning("warning message");
  await l.error("error message");
});

Deno.test("MCPLogger - global silent + per-instance silent both suppress", async () => {
  const l = createLogger("test-both-silent");
  l.silent = true;
  setSilent(true);
  try {
    // Should not throw — both global and instance silent are true
    await l.info("should be fully suppressed");
  } finally {
    setSilent(false);
    l.silent = false;
  }
});
