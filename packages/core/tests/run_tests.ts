#!/usr/bin/env -S deno run --allow-env --allow-read

/**
 * Test runner for MCPC Core
 *
 * This script runs all tests in the tests/ directory
 * and provides a summary of the results.
 */

async function runTests() {
  console.log("🧪 Running MCPC Core Tests...\n");

  const testFiles = [
    "tests/integration_test.ts",
    "tests/workflow_test.ts",
    "tests/utils_test.ts",
    "tests/env_utils_test.ts",
    "tests/ai_test.ts",
  ];

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const testFile of testFiles) {
    console.log(`📁 Running ${testFile}...`);

    try {
      const command = new Deno.Command("deno", {
        args: ["test", "--allow-env", "--allow-read", testFile],
        stdout: "inherit",
        stderr: "inherit",
      });

      const { code } = await command.output();

      if (code === 0) {
        console.log(`✅ ${testFile} - All tests passed\n`);
        passedTests++;
      } else {
        console.log(`❌ ${testFile} - Some tests failed\n`);
        failedTests++;
      }
      totalTests++;
    } catch (error) {
      console.error(`❌ Error running ${testFile}:`, error);
      failedTests++;
      totalTests++;
    }
  }

  console.log("📊 Test Summary:");
  console.log(`Total test files: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(
    `Success rate: ${Math.round((passedTests / totalTests) * 100)}%\n`,
  );

  if (failedTests === 0) {
    console.log("🎉 All tests passed!");
    Deno.exit(0);
  } else {
    console.log("💥 Some tests failed!");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await runTests();
}
