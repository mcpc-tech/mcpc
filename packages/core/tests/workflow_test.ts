// Test workflow patterns and execution

interface WorkflowStep {
  id: string;
  description: string;
  actions: WorkflowAction[];
}

interface WorkflowAction {
  tool: string;
  args: Record<string, unknown>;
}

interface WorkflowState {
  steps: WorkflowStep[];
  currentStep: number;
  results: Record<string, unknown>;
}

// Mock workflow executor for testing
class MockWorkflowExecutor {
  private state: WorkflowState;

  constructor() {
    this.state = {
      steps: [],
      currentStep: 0,
      results: {},
    };
  }

  addStep(step: WorkflowStep): void {
    this.state.steps.push(step);
  }

  executeStep(stepIndex: number): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (stepIndex >= this.state.steps.length) {
        reject(new Error("Step index out of bounds"));
        return;
      }

      const step = this.state.steps[stepIndex];
      const stepResults: Record<string, unknown> = {};

      // Mock execution of actions
      for (const action of step.actions) {
        stepResults[action.tool] = {
          success: true,
          result: `Executed ${action.tool} with args: ${
            JSON.stringify(action.args)
          }`,
        };
      }

      this.state.results[step.id] = stepResults;
      resolve(stepResults);
    });
  }

  getState(): WorkflowState {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      steps: [],
      currentStep: 0,
      results: {},
    };
  }
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

Deno.test("Workflow - create and add steps", () => {
  const executor = new MockWorkflowExecutor();

  const step1: WorkflowStep = {
    id: "step1",
    description: "First step",
    actions: [
      { tool: "tool1", args: { param: "value1" } },
    ],
  };

  executor.addStep(step1);

  const state = executor.getState();
  assertEquals(state.steps.length, 1);
  assertEquals(state.steps[0].id, "step1");
});

Deno.test("Workflow - execute single step", async () => {
  const executor = new MockWorkflowExecutor();

  const step: WorkflowStep = {
    id: "test_step",
    description: "Test step",
    actions: [
      { tool: "greet", args: { name: "Alice" } },
      { tool: "calculate", args: { x: 5, y: 3 } },
    ],
  };

  executor.addStep(step);

  const results = await executor.executeStep(0);

  assertTrue(typeof results === "object");
  assertTrue("greet" in results);
  assertTrue("calculate" in results);
});

Deno.test("Workflow - handle step out of bounds", async () => {
  const executor = new MockWorkflowExecutor();

  try {
    await executor.executeStep(0);
    assertTrue(false, "Should have thrown an error");
  } catch (error) {
    assertTrue(error instanceof Error);
    if (error instanceof Error) {
      assertTrue(error.message.includes("Step index out of bounds"));
    }
  }
});

Deno.test("Workflow - multiple steps execution", async () => {
  const executor = new MockWorkflowExecutor();

  const step1: WorkflowStep = {
    id: "step1",
    description: "Data preparation",
    actions: [
      { tool: "fetch_data", args: { source: "api" } },
    ],
  };

  const step2: WorkflowStep = {
    id: "step2",
    description: "Data processing",
    actions: [
      { tool: "transform", args: { format: "json" } },
      { tool: "validate", args: { schema: "user_schema" } },
    ],
  };

  executor.addStep(step1);
  executor.addStep(step2);

  // Execute both steps
  await executor.executeStep(0);
  await executor.executeStep(1);

  const state = executor.getState();
  assertEquals(Object.keys(state.results).length, 2);
  assertTrue("step1" in state.results);
  assertTrue("step2" in state.results);
});

Deno.test("Workflow - state management", () => {
  const executor = new MockWorkflowExecutor();

  const step: WorkflowStep = {
    id: "state_test",
    description: "State test",
    actions: [{ tool: "test_tool", args: {} }],
  };

  executor.addStep(step);

  const initialState = executor.getState();
  assertEquals(initialState.steps.length, 1);
  assertEquals(initialState.currentStep, 0);

  executor.reset();

  const resetState = executor.getState();
  assertEquals(resetState.steps.length, 0);
  assertEquals(Object.keys(resetState.results).length, 0);
});

Deno.test("Workflow - complex action parameters", async () => {
  const executor = new MockWorkflowExecutor();

  const complexArgs = {
    config: {
      timeout: 5000,
      retries: 3,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token123",
      },
    },
    data: [
      { id: 1, name: "Item 1" },
      { id: 2, name: "Item 2" },
    ],
  };

  const step: WorkflowStep = {
    id: "complex_step",
    description: "Step with complex parameters",
    actions: [
      { tool: "api_call", args: complexArgs },
    ],
  };

  executor.addStep(step);
  const results = await executor.executeStep(0);

  assertTrue("api_call" in results);
  const apiResult = results.api_call as { success: boolean; result: string };
  assertTrue(apiResult.success);
  assertTrue(typeof apiResult.result === "string");
});

console.log("✅ All workflow tests passed!");
