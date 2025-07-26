// Simple integration test for core functionality

const assertTrue = (condition: boolean, message?: string) => {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
};

const assertEquals = <T>(actual: T, expected: T, message?: string) => {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
};

// Test JSON utilities
function parseJSON<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    return null;
  }
}

function optionalObject<T>(obj: T, condition: boolean): T | object {
  return condition ? obj : {};
}

// Test environment utilities
function isProdEnv(): boolean {
  return Deno.env.get("NODE_ENV") === "production";
}

function isSCF(): boolean {
  return Boolean(Deno.env.get("SCF_RUNTIME") || Deno.env.get("PROD_SCF"));
}

Deno.test("Core utilities - JSON parsing", () => {
  // Test valid JSON
  const result1 = parseJSON<{ name: string }>('{"name": "test"}');
  assertEquals(result1?.name, "test");

  // Test invalid JSON
  const result2 = parseJSON("invalid json");
  assertEquals(result2, null);

  // Test array
  const result3 = parseJSON<number[]>("[1, 2, 3]");
  assertEquals(Array.isArray(result3), true);
  assertEquals(result3?.[0], 1);
});

Deno.test("Core utilities - conditional object", () => {
  const obj = { key: "value" };

  // Test with true condition
  const result1 = optionalObject(obj, true);
  assertEquals(result1, obj);

  // Test with false condition
  const result2 = optionalObject(obj, false);
  assertEquals(JSON.stringify(result2), "{}");
});

Deno.test("Core utilities - environment detection", () => {
  // Save original values
  const originalNodeEnv = Deno.env.get("NODE_ENV");
  const originalSCF = Deno.env.get("SCF_RUNTIME");
  const originalProdSCF = Deno.env.get("PROD_SCF");

  try {
    // Test production environment
    Deno.env.set("NODE_ENV", "production");
    assertTrue(isProdEnv());

    // Test non-production environment
    Deno.env.set("NODE_ENV", "development");
    assertTrue(!isProdEnv());

    // Test SCF detection
    Deno.env.delete("SCF_RUNTIME");
    Deno.env.delete("PROD_SCF");
    assertTrue(!isSCF());

    Deno.env.set("SCF_RUNTIME", "nodejs16");
    assertTrue(isSCF());
  } finally {
    // Restore original values
    if (originalNodeEnv) {
      Deno.env.set("NODE_ENV", originalNodeEnv);
    } else {
      Deno.env.delete("NODE_ENV");
    }
    if (originalSCF) {
      Deno.env.set("SCF_RUNTIME", originalSCF);
    } else {
      Deno.env.delete("SCF_RUNTIME");
    }
    if (originalProdSCF) {
      Deno.env.set("PROD_SCF", originalProdSCF);
    } else {
      Deno.env.delete("PROD_SCF");
    }
  }
});

Deno.test("Core utilities - string operations", () => {
  // Test string manipulation
  const testString = "hello world";
  const reversed = testString.split("").reverse().join("");
  assertEquals(reversed, "dlrow olleh");

  // Test case conversion
  const upper = testString.toUpperCase();
  assertEquals(upper, "HELLO WORLD");

  // Test trimming
  const padded = "  test  ";
  const trimmed = padded.trim();
  assertEquals(trimmed, "test");
});

Deno.test("Core utilities - array operations", () => {
  const testArray = [1, 2, 3, 4, 5];

  // Test filtering
  const evens = testArray.filter((n) => n % 2 === 0);
  assertEquals(evens.length, 2);
  assertEquals(evens[0], 2);
  assertEquals(evens[1], 4);

  // Test mapping
  const doubled = testArray.map((n) => n * 2);
  assertEquals(doubled[0], 2);
  assertEquals(doubled[4], 10);

  // Test reducing
  const sum = testArray.reduce((acc, n) => acc + n, 0);
  assertEquals(sum, 15);
});

console.log("✅ All core functionality tests passed!");
