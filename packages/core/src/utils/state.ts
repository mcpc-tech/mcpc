export type MCPCStep = {
  description: string;
  actions: Array<string>;
};

export type StepStatus = "pending" | "running" | "completed" | "failed";

export type StepWithStatus = MCPCStep & {
  status: StepStatus;
  result?: string;
  error?: string;
};

export class WorkflowState {
  private currentStepIndex: number = -1;
  private steps: Array<MCPCStep> = [];
  private stepStatuses: Array<StepStatus> = [];
  private stepResults: Array<string> = [];
  private stepErrors: Array<string> = [];
  private isInitialized: boolean = false;
  private isStarted: boolean = false;

  constructor(steps?: MCPCStep[]) {
    if (steps) {
      this.initialize(steps);
    }
  }

  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  getSteps(): Array<MCPCStep> {
    return this.steps;
  }

  isWorkflowInitialized(): boolean {
    return this.isInitialized;
  }

  getCurrentStep(): MCPCStep | null {
    if (!this.isInitialized || this.currentStepIndex < 0) {
      return null;
    }
    return this.steps[this.currentStepIndex] || null;
  }

  getNextStep(): MCPCStep | null {
    if (!this.isInitialized) return null;
    const nextIndex = this.currentStepIndex + 1;
    return this.steps[nextIndex] || null;
  }

  // Get the previous step in the workflow
  getPreviousStep(): MCPCStep | null {
    if (!this.isInitialized) return null;
    const prevIndex = this.currentStepIndex - 1;
    return this.steps[prevIndex] || null;
  }

  hasNextStep(): boolean {
    return this.getNextStep() !== null;
  }

  // Check if there is a previous step available
  hasPreviousStep(): boolean {
    return this.getPreviousStep() !== null;
  }

  // Check if currently at the first step
  isAtFirstStep(): boolean {
    return this.isInitialized && this.currentStepIndex === 0;
  }

  // Check if currently at the last step
  isAtLastStep(): boolean {
    return this.isInitialized && this.currentStepIndex >= this.steps.length - 1;
  }

  isWorkflowStarted(): boolean {
    return this.isStarted;
  }

  isCompleted(): boolean {
    return this.isInitialized && this.currentStepIndex > this.steps.length - 1;
  }

  // Mark workflow as completed by moving beyond the last step
  markCompleted(): void {
    if (this.isInitialized) {
      this.currentStepIndex = this.steps.length;
    }
  }

  initialize(steps: Array<MCPCStep>): void {
    this.steps = steps;
    this.stepStatuses = new Array(steps.length).fill("pending");
    this.stepResults = new Array(steps.length).fill("");
    this.stepErrors = new Array(steps.length).fill("");
    this.currentStepIndex = 0;
    this.isInitialized = true;
    this.isStarted = false; // Reset started state when initializing
  }

  // Mark current step as running
  markCurrentStepRunning(): void {
    if (
      this.isInitialized && this.currentStepIndex >= 0 &&
      this.currentStepIndex < this.steps.length
    ) {
      this.stepStatuses[this.currentStepIndex] = "running";
    }
  }

  // Mark current step as completed
  markCurrentStepCompleted(result?: string): void {
    if (
      this.isInitialized && this.currentStepIndex >= 0 &&
      this.currentStepIndex < this.steps.length
    ) {
      this.stepStatuses[this.currentStepIndex] = "completed";
      if (result) {
        this.stepResults[this.currentStepIndex] = result;
      }
    }
  }

  // Mark current step as failed
  markCurrentStepFailed(error?: string): void {
    if (
      this.isInitialized && this.currentStepIndex >= 0 &&
      this.currentStepIndex < this.steps.length
    ) {
      this.stepStatuses[this.currentStepIndex] = "failed";
      if (error) {
        this.stepErrors[this.currentStepIndex] = error;
      }
    }
  }

  // Get steps with their status
  getStepsWithStatus(): Array<StepWithStatus> {
    return this.steps.map((step, index) => ({
      ...step,
      status: this.stepStatuses[index] || "pending",
      result: this.stepResults[index] || undefined,
      error: this.stepErrors[index] || undefined,
    }));
  }

  // Get basic workflow progress data for template rendering
  getProgressData() {
    return {
      steps: this.steps,
      statuses: this.stepStatuses,
      results: this.stepResults,
      errors: this.stepErrors,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.steps.length,
    };
  }

  start() {
    this.isStarted = true;
  }

  moveToNextStep(): boolean {
    if (!this.hasNextStep()) {
      return false;
    }
    this.currentStepIndex++;
    return true;
  }

  // Move to the previous step in the workflow
  moveToPreviousStep(): boolean {
    if (!this.hasPreviousStep()) {
      return false;
    }
    this.currentStepIndex--;
    return true;
  }

  // Move to a specific step by index (optional feature)
  moveToStep(stepIndex: number): boolean {
    if (
      !this.isInitialized ||
      stepIndex < 0 ||
      stepIndex >= this.steps.length
    ) {
      return false;
    }
    this.currentStepIndex = stepIndex;
    return true;
  }

  reset(): void {
    this.currentStepIndex = -1;
    this.steps = [];
    this.stepStatuses = [];
    this.stepResults = [];
    this.stepErrors = [];
    this.isInitialized = false;
    this.isStarted = false; // Reset started state when resetting
  }

  getDebugInfo(): {
    currentStepIndex: number;
    totalSteps: number;
    isInitialized: boolean;
    currentStep: string | undefined;
    nextStep: string | undefined;
    previousStep: string | undefined;
    isAtFirstStep: boolean;
    hasPreviousStep: boolean;
  } {
    return {
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.steps.length,
      isInitialized: this.isInitialized,
      currentStep: this.getCurrentStep()?.description,
      nextStep: this.getNextStep()?.description,
      previousStep: this.getPreviousStep()?.description,
      isAtFirstStep: this.isAtFirstStep(),
      hasPreviousStep: this.hasPreviousStep(),
    };
  }
}
