export type MCPCStep = {
  description: string;
  actions: Array<string>;
};

export class WorkflowState {
  private currentStepIndex: number = -1;
  private steps: Array<MCPCStep> = [];
  private isInitialized: boolean = false;

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

  hasNextStep(): boolean {
    return this.getNextStep() !== null;
  }

  isCompleted(): boolean {
    return this.isInitialized && this.currentStepIndex >= this.steps.length - 1;
  }

  initialize(steps: Array<MCPCStep>): void {
    this.steps = steps;
    this.currentStepIndex = 0;
    this.isInitialized = true;
  }

  moveToNextStep(): boolean {
    if (!this.hasNextStep()) {
      return false;
    }
    this.currentStepIndex++;
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
    };
  }
}
