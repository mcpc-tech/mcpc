# MCPC Core Tests

This directory contains comprehensive tests for the MCPC Core library using
Deno's built-in testing framework.

## Test Structure

```
tests/
├── integration_test.ts     # Core utility integration tests
├── workflow_test.ts        # Workflow execution and management tests
├── utils_test.ts          # JSON and utility function tests
├── env_utils_test.ts      # Environment detection tests
├── ai_test.ts            # AI utilities and prompt template tests
├── run_tests.ts           # Test runner script
└── README.md              # This file
```

## Running Tests

### Individual Test Files

Run specific test files:

```bash
# Run integration tests
deno test --allow-env --allow-read tests/integration_test.ts

# Run workflow tests
deno test --allow-env --allow-read tests/workflow_test.ts

# Run utility tests
deno test --allow-env --allow-read tests/utils_test.ts

# Run AI utility tests
deno test --allow-env --allow-read tests/ai_test.ts

# Run environment tests
deno test --allow-env --allow-read tests/env_utils_test.ts
```

### All Tests

Run all tests using the predefined task:

```bash
# Run all tests
deno task test

# Run tests in watch mode
deno task test:watch
```

Or use the test runner script:

```bash
deno run --allow-env --allow-read tests/run_tests.ts
```

### All Tests in Directory

Run all tests in the tests directory:

```bash
deno test --allow-env --allow-read tests/
```

## Test Categories

### 1. Integration Tests (`integration_test.ts`)

- JSON parsing and manipulation
- Environment variable detection
- String and array operations
- Cross-cutting concerns

### 2. Workflow Tests (`workflow_test.ts`)

- Workflow step creation and management
- Action execution simulation
- State management
- Error handling
- Complex parameter passing

### 3. Utility Tests (`utils_test.ts`)

- JSON utilities (parseJSON, truncateJSON, optionalObject)
- Type safety validation
- Edge case handling

### 4. Environment Tests (`env_utils_test.ts`)

- Production environment detection
- SCF (Serverless Cloud Function) detection
- Environment variable cleanup

### 5. AI Utility Tests (`ai_test.ts`)

- Prompt template processing with variables
- Template variable extraction and validation
- Missing variable handling strategies
- Tool name validation and sanitization
- Complex template scenarios and edge cases

## Test Features

- **Type Safety**: All tests are written with TypeScript for compile-time safety
- **Environment Isolation**: Tests save and restore environment variables
- **Error Handling**: Comprehensive error case testing
- **Mock Objects**: Simulated workflow execution for testing complex logic
- **Integration Testing**: End-to-end testing of core functionality

## Permissions Required

Tests require the following Deno permissions:

- `--allow-env`: For testing environment variable functionality
- `--allow-read`: For reading test files and project structure

## Adding New Tests

When adding new tests:

1. Create a new test file in the `tests/` directory
2. Follow the naming convention: `feature_test.ts`
3. Use Deno's built-in testing framework
4. Include comprehensive error handling tests
5. Ensure environment cleanup in tests that modify environment variables
6. Add the new test file to the test runner script

## Test Coverage

The tests cover:

- ✅ Core utility functions
- ✅ Environment detection
- ✅ JSON processing
- ✅ Workflow management
- ✅ Error handling
- ✅ Type safety
- ✅ State management
- ✅ AI prompt templates
- ✅ Tool name validation

## CI/CD Integration

These tests are designed to be run in CI/CD environments:

```yaml
# Example GitHub Actions step
- name: Run Tests
  run: deno task test
```

The test runner exits with appropriate exit codes:

- `0`: All tests passed
- `1`: Some tests failed
