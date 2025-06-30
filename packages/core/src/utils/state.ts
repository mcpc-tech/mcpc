export type MCPCStep = {
  description: string;
  actions: Array<string>;
};

export class WorkflowState {
  private currentStepIndex: number = -1;
  private steps: Array<MCPCStep> = [];
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
    return this.isInitialized && this.currentStepIndex >= this.steps.length - 1;
  }

  initialize(steps: Array<MCPCStep>): void {
    this.steps = steps;
    this.currentStepIndex = 0;
    this.isInitialized = true;
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
    this.isInitialized = false;
  }

  getDebugInfo(): any {
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
