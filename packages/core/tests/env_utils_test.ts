import { assertEquals } from "@std/assert";

// Simple environment utility functions for testing
function isProdEnv(): boolean {
  return Deno.env.get("NODE_ENV") === "production";
}

function isSCF(): boolean {
  return Boolean(Deno.env.get("SCF_RUNTIME") || Deno.env.get("PROD_SCF"));
}

Deno.test("Environment utilities - isProdEnv with production environment", () => {
  // Save original env
  const originalEnv = Deno.env.get("NODE_ENV");

  try {
    Deno.env.set("NODE_ENV", "production");
    const result = isProdEnv();
    assertEquals(result, true);
  } finally {
    // Restore original env
    if (originalEnv) {
      Deno.env.set("NODE_ENV", originalEnv);
    } else {
      Deno.env.delete("NODE_ENV");
    }
  }
});

Deno.test("Environment utilities - isProdEnv with development environment", () => {
  // Save original env
  const originalEnv = Deno.env.get("NODE_ENV");

  try {
    Deno.env.set("NODE_ENV", "development");
    const result = isProdEnv();
    assertEquals(result, false);
  } finally {
    // Restore original env
    if (originalEnv) {
      Deno.env.set("NODE_ENV", originalEnv);
    } else {
      Deno.env.delete("NODE_ENV");
    }
  }
});

Deno.test("Environment utilities - isSCF with SCF_RUNTIME set", () => {
  // Save original env
  const originalSCFRuntime = Deno.env.get("SCF_RUNTIME");
  const originalProdSCF = Deno.env.get("PROD_SCF");

  try {
    Deno.env.set("SCF_RUNTIME", "nodejs16");
    if (originalProdSCF) {
      Deno.env.delete("PROD_SCF");
    }
    const result = isSCF();
    assertEquals(result, true);
  } finally {
    // Restore original env
    if (originalSCFRuntime) {
      Deno.env.set("SCF_RUNTIME", originalSCFRuntime);
    } else {
      Deno.env.delete("SCF_RUNTIME");
    }
    if (originalProdSCF) {
      Deno.env.set("PROD_SCF", originalProdSCF);
    }
  }
});

Deno.test("Environment utilities - isSCF with no SCF environment", () => {
  // Save original env
  const originalSCFRuntime = Deno.env.get("SCF_RUNTIME");
  const originalProdSCF = Deno.env.get("PROD_SCF");

  try {
    Deno.env.delete("SCF_RUNTIME");
    Deno.env.delete("PROD_SCF");
    const result = isSCF();
    assertEquals(result, false);
  } finally {
    // Restore original env
    if (originalSCFRuntime) {
      Deno.env.set("SCF_RUNTIME", originalSCFRuntime);
    }
    if (originalProdSCF) {
      Deno.env.set("PROD_SCF", originalProdSCF);
    }
  }
});
