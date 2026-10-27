export type AppConfig = {
  port: number;
  frontendOrigin: string;
  ai: {
    provider: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    instructions: string;
    contextWindowTokens: number;
    maxOutputTokens: number;
    contextSafetyMarginTokens: number;
    availableInputTokens: number;
    tokenEstimator: {
      strategy: "character-ratio" | "whitespace";
      charsPerToken: number;
      messageOverheadTokens: number;
    };
  };
  validationErrors: string[];
};

const defaults = {
  port: 3001,
  frontendOrigin: "http://localhost:5173",
  provider: "openai-compatible",
  instructions: "You are a helpful assistant. Answer clearly and concisely.",
  contextWindowTokens: 8_000,
  maxOutputTokens: 1_000,
  contextSafetyMarginTokens: 500,
  tokenEstimatorStrategy: "character-ratio" as const,
  charsPerToken: 4,
  messageOverheadTokens: 4,
} as const;

function readTokenEstimatorStrategy(
  environment: Record<string, string | undefined>,
  validationErrors: string[],
): "character-ratio" | "whitespace" {
  const value = environment.AI_TOKEN_ESTIMATOR?.trim();

  if (!value) return defaults.tokenEstimatorStrategy;
  if (value === "character-ratio" || value === "whitespace") return value;

  validationErrors.push(
    "AI_TOKEN_ESTIMATOR must be either character-ratio or whitespace",
  );
  return defaults.tokenEstimatorStrategy;
}

function readPositiveInteger(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: number,
  validationErrors: string[],
): number {
  const value = environment[name]?.trim();

  if (!value) return fallback;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    validationErrors.push(`${name} must be a positive integer`);
    return fallback;
  }

  return parsed;
}

function readNonNegativeInteger(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: number,
  validationErrors: string[],
): number {
  const value = environment[name]?.trim();

  if (!value) return fallback;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    validationErrors.push(`${name} must be a non-negative integer`);
    return fallback;
  }

  return parsed;
}

export function loadConfig(
  environment: Record<string, string | undefined> = process.env,
): AppConfig {
  const validationErrors: string[] = [];
  const contextWindowTokens = readPositiveInteger(
    environment,
    "AI_CONTEXT_WINDOW_TOKENS",
    defaults.contextWindowTokens,
    validationErrors,
  );
  const maxOutputTokens = readPositiveInteger(
    environment,
    "AI_MAX_OUTPUT_TOKENS",
    defaults.maxOutputTokens,
    validationErrors,
  );
  const contextSafetyMarginTokens = readNonNegativeInteger(
    environment,
    "AI_CONTEXT_SAFETY_MARGIN_TOKENS",
    defaults.contextSafetyMarginTokens,
    validationErrors,
  );
  const charsPerToken = readPositiveInteger(
    environment,
    "AI_CHARS_PER_TOKEN",
    defaults.charsPerToken,
    validationErrors,
  );
  const messageOverheadTokens = readNonNegativeInteger(
    environment,
    "AI_MESSAGE_OVERHEAD_TOKENS",
    defaults.messageOverheadTokens,
    validationErrors,
  );

  const availableInputTokens =
    contextWindowTokens - maxOutputTokens - contextSafetyMarginTokens;

  if (availableInputTokens <= 0) {
    validationErrors.push(
      "AI_CONTEXT_WINDOW_TOKENS must be greater than AI_MAX_OUTPUT_TOKENS plus AI_CONTEXT_SAFETY_MARGIN_TOKENS",
    );
  }

  return {
    port: readPositiveInteger(
      environment,
      "PORT",
      defaults.port,
      validationErrors,
    ),
    frontendOrigin:
      environment.FRONTEND_ORIGIN?.trim() || defaults.frontendOrigin,
    ai: {
      provider: environment.AI_PROVIDER?.trim() || defaults.provider,
      apiKey: environment.AI_API_KEY?.trim() || undefined,
      baseUrl: environment.AI_BASE_URL?.trim() || undefined,
      model: environment.AI_MODEL?.trim() || undefined,
      instructions:
        environment.AI_SYSTEM_INSTRUCTIONS?.trim() || defaults.instructions,
      contextWindowTokens,
      maxOutputTokens,
      contextSafetyMarginTokens,
      availableInputTokens,
      tokenEstimator: {
        strategy: readTokenEstimatorStrategy(environment, validationErrors),
        charsPerToken,
        messageOverheadTokens,
      },
    },
    validationErrors,
  };
}
