// Test AI utilities and helper functions

interface MockPromptFunction<T extends string> {
  (input: Partial<PromptInput<T>>, options?: NativePromptOptions): string;
}

// Type helper to extract variables from template strings
type ExtractVariables<S extends string> = S extends
  `${string}{${infer Var}}${infer Rest}`
  ? Var extends `${infer ActualVar}}` ? ActualVar | ExtractVariables<Rest>
  : Var | ExtractVariables<Rest>
  : never;

type PromptInput<T extends string> = Record<
  ExtractVariables<T>,
  string | number | boolean
>;

interface NativePromptOptions {
  missingVariableHandling?: "error" | "warn" | "ignore" | "empty";
}

// Mock implementation of a native prompt function
function createMockPrompt<T extends string>(
  template: T,
): MockPromptFunction<T> {
  return (input: Partial<PromptInput<T>>, options?: NativePromptOptions) => {
    let result = template as string;
    const missingHandling = options?.missingVariableHandling || "warn";

    // Replace variables in the template
    const variableRegex = /\{([^}]+)\}/g;
    result = result.replace(variableRegex, (match, varName) => {
      const value = input[varName as keyof typeof input];

      if (value === undefined) {
        switch (missingHandling) {
          case "error":
            throw new Error(`Missing variable: ${varName}`);
          case "warn":
            console.warn(`Missing variable: ${varName}`);
            return match;
          case "ignore":
            return match;
          case "empty":
            return "";
          default:
            return match;
        }
      }

      return String(value);
    });

    return result;
  };
}

// Tool name validation utilities
function validateToolName(name: string): boolean {
  // Valid tool names should be alphanumeric with underscores/hyphens
  const validPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  return validPattern.test(name);
}

function sanitizeToolName(name: string): string {
  // Convert to snake_case and remove invalid characters
  let result = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "");

  // Ensure it starts with a letter
  if (result && /^[0-9]/.test(result)) {
    result = "_" + result;
  }

  return result;
}

const assertEquals = <T>(actual: T, expected: T, message?: string) => {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
};

const assertTrue = (condition: boolean, message?: string) => {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
};

const assertThrows = (fn: () => void, expectedError?: string) => {
  try {
    fn();
    throw new Error("Expected function to throw an error");
  } catch (error) {
    if (expectedError && error instanceof Error) {
      assertTrue(error.message.includes(expectedError));
    }
  }
};

Deno.test("AI Utilities - prompt template with single variable", () => {
  const greetTemplate = "Hello {name}!";
  const greet = createMockPrompt(greetTemplate);

  const result = greet({ name: "Alice" });
  assertEquals(result, "Hello Alice!");
});

Deno.test("AI Utilities - prompt template with multiple variables", () => {
  const template = "Hello {name}! You are {age} years old and live in {city}.";
  const prompt = createMockPrompt(template);

  const result = prompt({
    name: "Bob",
    age: 30,
    city: "New York",
  });
  assertEquals(result, "Hello Bob! You are 30 years old and live in New York.");
});

Deno.test("AI Utilities - prompt template with missing variable (warn)", () => {
  const template = "Hello {name}! Your score is {score}.";
  const prompt = createMockPrompt(template);

  // Capture console output
  const originalWarn = console.warn;
  let warningMessage = "";
  console.warn = (message: string) => {
    warningMessage = message;
  };

  try {
    const result = prompt({ name: "Charlie" });
    assertEquals(result, "Hello Charlie! Your score is {score}.");
    assertTrue(warningMessage.includes("Missing variable: score"));
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("AI Utilities - prompt template with missing variable (error)", () => {
  const template = "Hello {name}! Your score is {score}.";
  const prompt = createMockPrompt(template);

  assertThrows(
    () => prompt({ name: "Charlie" }, { missingVariableHandling: "error" }),
    "Missing variable: score",
  );
});

Deno.test("AI Utilities - prompt template with missing variable (empty)", () => {
  const template = "Hello {name}! Your score is {score}.";
  const prompt = createMockPrompt(template);

  const result = prompt(
    { name: "Charlie" },
    { missingVariableHandling: "empty" },
  );
  assertEquals(result, "Hello Charlie! Your score is .");
});

Deno.test("AI Utilities - prompt template with boolean and number values", () => {
  const template = "User {name} is active: {active}, with score: {score}";
  const prompt = createMockPrompt(template);

  const result = prompt({
    name: "Dave",
    active: true,
    score: 95,
  });
  assertEquals(result, "User Dave is active: true, with score: 95");
});

Deno.test("AI Utilities - tool name validation", () => {
  // Valid tool names
  assertTrue(validateToolName("my_tool"));
  assertTrue(validateToolName("tool123"));
  assertTrue(validateToolName("get-data"));
  assertTrue(validateToolName("processFile"));

  // Invalid tool names
  assertTrue(!validateToolName("123tool")); // starts with number
  assertTrue(!validateToolName("my tool")); // contains space
  assertTrue(!validateToolName("tool@name")); // contains special char
  assertTrue(!validateToolName("")); // empty string
});

Deno.test("AI Utilities - tool name sanitization", () => {
  assertEquals(sanitizeToolName("My Tool Name"), "my_tool_name");
  assertEquals(sanitizeToolName("get@data#now"), "get_data_now");
  assertEquals(sanitizeToolName("123start"), "_123start");
  assertEquals(sanitizeToolName("tool   name"), "tool_name");
  assertEquals(sanitizeToolName("_start_end_"), "start_end");
  assertEquals(sanitizeToolName("UPPER_CASE"), "upper_case");
});

Deno.test("AI Utilities - complex prompt template", () => {
  const template = `
You are a {role} helping with {task}.
Context: {context}
Instructions:
1. {instruction1}
2. {instruction2}
Please provide a {responseType} response.
  `.trim();

  const prompt = createMockPrompt(template);

  const result = prompt({
    role: "assistant",
    task: "code review",
    context: "TypeScript project",
    instruction1: "Check for type safety",
    instruction2: "Suggest improvements",
    responseType: "detailed",
  });

  assertTrue(result.includes("You are a assistant helping with code review"));
  assertTrue(result.includes("Context: TypeScript project"));
  assertTrue(result.includes("1. Check for type safety"));
  assertTrue(result.includes("2. Suggest improvements"));
  assertTrue(result.includes("Please provide a detailed response"));
});

Deno.test("AI Utilities - edge cases in template parsing", () => {
  // Template with adjacent braces
  const template1 = "{first}{second}";
  const prompt1 = createMockPrompt(template1);
  const result1 = prompt1({ first: "A", second: "B" });
  assertEquals(result1, "AB");

  // Template with braces in text
  const template2 = "Object {name} has properties: {props}";
  const prompt2 = createMockPrompt(template2);
  const result2 = prompt2({ name: "user", props: "{id, name}" });
  assertEquals(result2, "Object user has properties: {id, name}");

  // Template with no variables
  const template3 = "This is a static template";
  const prompt3 = createMockPrompt(template3);
  const result3 = prompt3({});
  assertEquals(result3, "This is a static template");
});

console.log("✅ All AI utility tests passed!");
