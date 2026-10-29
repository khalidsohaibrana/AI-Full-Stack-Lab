export type JsonSchema = Record<string, unknown>;

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type ToolResult = {
  toolCallId: string;
  name: string;
  output: unknown;
  isError?: boolean;
};

export type ToolExecutionContext = {
  userId: string;
  conversationId?: string;
  signal?: AbortSignal;
  currentLocation?: {
    latitude: number;
    longitude: number;
  };
};

export type Tool = ToolDefinition & {
  execute: (
    argumentsValue: unknown,
    context: ToolExecutionContext,
  ) => Promise<unknown>;
};
