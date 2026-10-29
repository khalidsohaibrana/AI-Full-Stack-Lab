import type {
  Tool,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from "./types.js";
import { validateToolDefinition } from "./validation.js";

export class ToolRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRegistryError";
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    const errors = validateToolDefinition(tool);

    if (errors.length > 0 || typeof tool.execute !== "function") {
      throw new ToolRegistryError(
        errors.length > 0
          ? `Invalid tool definition: ${errors.join(", ")}`
          : "Tool execute must be a function",
      );
    }

    if (this.tools.has(tool.name)) {
      throw new ToolRegistryError(`A tool named ${tool.name} is already registered.`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  listDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map(({ name, description, parameters }) => ({
      name,
      description,
      parameters: structuredClone(parameters),
    }));
  }

  async execute(
    toolName: string,
    argumentsValue: unknown,
    context: ToolExecutionContext,
    timeoutMs: number,
  ): Promise<ToolResult> {
    const tool = this.get(toolName);

    if (!tool) {
      return {
        toolCallId: "",
        name: toolName,
        output: { error: `Unknown tool: ${toolName}` },
        isError: true,
      };
    }

    try {
      const output = await withTimeout(
        tool.execute(argumentsValue, context),
        timeoutMs,
      );

      return { toolCallId: "", name: toolName, output };
    } catch (error) {
      return {
        toolCallId: "",
        name: toolName,
        output: {
          error: error instanceof Error ? error.message : "Tool execution failed.",
        },
        isError: true,
      };
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Tool execution timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
