export type JSONSchema = Record<string, unknown>;

export type ToolCallback = (args: unknown, extra?: unknown) => unknown;

export interface RegisterToolParams {
  description: string;
  name: string;
  allToolNames: string[];
  depGroups: Record<string, unknown>;
  toolNameToDetailList: [string, unknown][];
  sampling?: boolean;
}

export interface RegisterWorkflowToolParams extends RegisterToolParams {
  predefinedSteps?: import("./utils/state.ts").MCPCStep[];
  sampling?: boolean;
  ensureStepActions?: string[];
  toolNameToIdMapping?: Map<string, string>;
}

export interface ArgsDefCreator {
  common: (
    extra: { [n: string]: JSONSchema },
    optionalFields?: string[],
  ) => JSONSchema;
  steps: () => JSONSchema;
  init: () => JSONSchema;
  proceed: () => JSONSchema;
  action: () => JSONSchema;
  forTool: () => JSONSchema;
  forCurrentState: (
    state: import("./utils/state.ts").WorkflowState,
  ) => JSONSchema;
  forNextState: (state: import("./utils/state.ts").WorkflowState) => JSONSchema;
  forSampling: () => JSONSchema;
  forAgentic: (
    toolNameToDetailList: [string, unknown][],
    sampling?: boolean,
    ACTION_KEY?: string,
    NEXT_ACTION_KEY?: string,
  ) => JSONSchema;
  forToolDescription: (
    description: string,
    state: import("./utils/state.ts").WorkflowState,
  ) => string;
  forInitialStepDescription: (
    steps: import("./utils/state.ts").MCPCStep[],
    state: import("./utils/state.ts").WorkflowState,
  ) => string;
}
