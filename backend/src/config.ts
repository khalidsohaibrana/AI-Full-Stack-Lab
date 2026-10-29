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
    contextTruncationStrategy: "recent-turns";
    oversizedMessagePolicy: "reject";
    tokenEstimator: {
      strategy: "character-ratio" | "whitespace";
      charsPerToken: number;
      messageOverheadTokens: number;
    };
  };
  agent: {
    maxIterations: number;
    maxToolCalls: number;
    toolTimeoutMs: number;
    maxToolResultChars: number;
  };
  planning: {
    enabled: boolean;
    maxSteps: number;
    maxReplans: number;
    maxStepRetries: number;
    maxGenerationAttempts: number;
  };
  multiAgent: {
    maxAgents: number;
    maxConcurrency: number;
    maxGenerationAttempts: number;
  };
  external: {
    geocodingBaseUrl: string;
    weatherBaseUrl: string;
    routingBaseUrl: string;
  };
  embedding: {
    provider: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    dimensions?: number;
    validationErrors: string[];
  };
  retrieval: {
    enabled: boolean;
    topK: number;
    minSimilarity: number;
    minImportance: number;
    defaultUserId: string;
    validationErrors: string[];
  };
  storage: {
    provider: "in-memory" | "postgres";
    databaseUrl?: string;
    validationErrors: string[];
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
  contextTruncationStrategy: "recent-turns" as const,
  oversizedMessagePolicy: "reject" as const,
  tokenEstimatorStrategy: "character-ratio" as const,
  charsPerToken: 4,
  messageOverheadTokens: 4,
  storageProvider: "in-memory" as const,
  agentMaxIterations: 5,
  agentMaxToolCalls: 10,
  agentToolTimeoutMs: 10_000,
  agentMaxToolResultChars: 8_000,
  planningEnabled: false,
  planningMaxSteps: 8,
  planningMaxReplans: 2,
  planningMaxStepRetries: 1,
  planningMaxGenerationAttempts: 2,
  multiAgentMaxAgents: 4,
  multiAgentMaxConcurrency: 3,
  multiAgentMaxGenerationAttempts: 2,
  geocodingBaseUrl: "https://nominatim.openstreetmap.org/search",
  weatherBaseUrl: "https://api.open-meteo.com/v1/forecast",
  routingBaseUrl: "https://router.project-osrm.org",
} as const;

function readStorageProvider(
  environment: Record<string, string | undefined>,
  validationErrors: string[],
): "in-memory" | "postgres" {
  const value = environment.AI_MEMORY_STORE?.trim();

  if (!value) return defaults.storageProvider;
  if (value === "in-memory" || value === "postgres") return value;

  validationErrors.push("AI_MEMORY_STORE must be either in-memory or postgres");
  return defaults.storageProvider;
}

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

function readContextTruncationStrategy(
  environment: Record<string, string | undefined>,
  validationErrors: string[],
): "recent-turns" {
  const value = environment.AI_CONTEXT_TRUNCATION_STRATEGY?.trim();

  if (!value) return defaults.contextTruncationStrategy;
  if (value === "recent-turns") return value;

  validationErrors.push(
    "AI_CONTEXT_TRUNCATION_STRATEGY must be recent-turns",
  );
  return defaults.contextTruncationStrategy;
}

function readOversizedMessagePolicy(
  environment: Record<string, string | undefined>,
  validationErrors: string[],
): "reject" {
  const value = environment.AI_OVERSIZED_MESSAGE_POLICY?.trim();

  if (!value) return defaults.oversizedMessagePolicy;
  if (value === "reject") return value;

  validationErrors.push("AI_OVERSIZED_MESSAGE_POLICY must be reject");
  return defaults.oversizedMessagePolicy;
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

function readOptionalPositiveInteger(
  environment: Record<string, string | undefined>,
  name: string,
  validationErrors: string[],
): number | undefined {
  const value = environment[name]?.trim();

  if (!value) return undefined;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    validationErrors.push(`${name} must be a positive integer when provided`);
    return undefined;
  }

  return parsed;
}

function readBoolean(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: boolean,
  validationErrors: string[],
): boolean {
  const value = environment[name]?.trim().toLowerCase();

  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;

  validationErrors.push(`${name} must be true or false`);
  return fallback;
}

function readBoundedNumber(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  validationErrors: string[],
): number {
  const value = environment[name]?.trim();

  if (!value) return fallback;

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    validationErrors.push(
      `${name} must be a number between ${minimum} and ${maximum}`,
    );
    return fallback;
  }

  return parsed;
}

export function loadConfig(
  environment: Record<string, string | undefined> = process.env,
): AppConfig {
  const validationErrors: string[] = [];
  const embeddingValidationErrors: string[] = [];
  const retrievalValidationErrors: string[] = [];
  const storageValidationErrors: string[] = [];
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
  const embeddingDimensions = readOptionalPositiveInteger(
    environment,
    "AI_EMBEDDING_DIMENSIONS",
    embeddingValidationErrors,
  );
  const retrievalTopK = readPositiveInteger(
    environment,
    "AI_MEMORY_RETRIEVAL_TOP_K",
    5,
    retrievalValidationErrors,
  );
  const retrievalMinSimilarity = readBoundedNumber(
    environment,
    "AI_MEMORY_RETRIEVAL_MIN_SIMILARITY",
    0.55,
    -1,
    1,
    retrievalValidationErrors,
  );
  const retrievalMinImportance = readBoundedNumber(
    environment,
    "AI_MEMORY_RETRIEVAL_MIN_IMPORTANCE",
    0,
    0,
    1,
    retrievalValidationErrors,
  );
  const storageProvider = readStorageProvider(environment, storageValidationErrors);
  const databaseUrl = environment.AI_MEMORY_DATABASE_URL?.trim() || undefined;
  const agentValidationErrors: string[] = [];
  const agentMaxIterations = readPositiveInteger(
    environment,
    "AI_AGENT_MAX_ITERATIONS",
    defaults.agentMaxIterations,
    agentValidationErrors,
  );
  const agentMaxToolCalls = readPositiveInteger(
    environment,
    "AI_AGENT_MAX_TOOL_CALLS",
    defaults.agentMaxToolCalls,
    agentValidationErrors,
  );
  const agentToolTimeoutMs = readPositiveInteger(
    environment,
    "AI_AGENT_TOOL_TIMEOUT_MS",
    defaults.agentToolTimeoutMs,
    agentValidationErrors,
  );
  const agentMaxToolResultChars = readPositiveInteger(
    environment,
    "AI_AGENT_MAX_TOOL_RESULT_CHARS",
    defaults.agentMaxToolResultChars,
    agentValidationErrors,
  );
  validationErrors.push(...agentValidationErrors);
  const planningValidationErrors: string[] = [];
  const planningMaxSteps = readPositiveInteger(environment, "AI_PLANNER_MAX_STEPS", defaults.planningMaxSteps, planningValidationErrors);
  const planningMaxReplans = readNonNegativeInteger(environment, "AI_PLANNER_MAX_REPLANS", defaults.planningMaxReplans, planningValidationErrors);
  const planningMaxStepRetries = readNonNegativeInteger(environment, "AI_PLANNER_MAX_STEP_RETRIES", defaults.planningMaxStepRetries, planningValidationErrors);
  const planningMaxGenerationAttempts = readPositiveInteger(environment, "AI_PLANNER_MAX_GENERATION_ATTEMPTS", defaults.planningMaxGenerationAttempts, planningValidationErrors);
  validationErrors.push(...planningValidationErrors);
  const multiAgentValidationErrors: string[] = [];
  const multiAgentMaxAgents = readPositiveInteger(environment, "AI_MULTI_AGENT_MAX_AGENTS", defaults.multiAgentMaxAgents, multiAgentValidationErrors);
  const multiAgentMaxConcurrency = readPositiveInteger(environment, "AI_MULTI_AGENT_MAX_CONCURRENCY", defaults.multiAgentMaxConcurrency, multiAgentValidationErrors);
  const multiAgentMaxGenerationAttempts = readPositiveInteger(environment, "AI_MULTI_AGENT_MAX_GENERATION_ATTEMPTS", defaults.multiAgentMaxGenerationAttempts, multiAgentValidationErrors);
  validationErrors.push(...multiAgentValidationErrors);

  if (storageProvider === "postgres" && !databaseUrl) {
    storageValidationErrors.push(
      "AI_MEMORY_DATABASE_URL is required when AI_MEMORY_STORE is postgres",
    );
  }

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
      contextTruncationStrategy: readContextTruncationStrategy(
        environment,
        validationErrors,
      ),
      oversizedMessagePolicy: readOversizedMessagePolicy(
        environment,
        validationErrors,
      ),
      tokenEstimator: {
        strategy: readTokenEstimatorStrategy(environment, validationErrors),
        charsPerToken,
        messageOverheadTokens,
      },
    },
    agent: {
      maxIterations: agentMaxIterations,
      maxToolCalls: agentMaxToolCalls,
      toolTimeoutMs: agentToolTimeoutMs,
      maxToolResultChars: agentMaxToolResultChars,
    },
    planning: {
      enabled: readBoolean(environment, "AI_PLANNING_ENABLED", defaults.planningEnabled, validationErrors),
      maxSteps: planningMaxSteps,
      maxReplans: planningMaxReplans,
      maxStepRetries: planningMaxStepRetries,
      maxGenerationAttempts: planningMaxGenerationAttempts,
    },
    multiAgent: {
      maxAgents: multiAgentMaxAgents,
      maxConcurrency: multiAgentMaxConcurrency,
      maxGenerationAttempts: multiAgentMaxGenerationAttempts,
    },
    external: {
      geocodingBaseUrl:
        environment.AI_GEOCODING_BASE_URL?.trim() || defaults.geocodingBaseUrl,
      weatherBaseUrl:
        environment.AI_WEATHER_BASE_URL?.trim() || defaults.weatherBaseUrl,
      routingBaseUrl:
        environment.AI_ROUTING_BASE_URL?.trim() || defaults.routingBaseUrl,
    },
    embedding: {
      provider:
        environment.AI_EMBEDDING_PROVIDER?.trim() || defaults.provider,
      apiKey: environment.AI_EMBEDDING_API_KEY?.trim() || undefined,
      baseUrl: environment.AI_EMBEDDING_BASE_URL?.trim() || undefined,
      model: environment.AI_EMBEDDING_MODEL?.trim() || undefined,
      dimensions: embeddingDimensions,
      validationErrors: embeddingValidationErrors,
    },
    retrieval: {
      enabled: readBoolean(
        environment,
        "AI_MEMORY_RETRIEVAL_ENABLED",
        true,
        retrievalValidationErrors,
      ),
      topK: retrievalTopK,
      minSimilarity: retrievalMinSimilarity,
      minImportance: retrievalMinImportance,
      defaultUserId:
        environment.AI_DEFAULT_USER_ID?.trim() || "local-user",
      validationErrors: retrievalValidationErrors,
    },
    storage: {
      provider: storageProvider,
      databaseUrl,
      validationErrors: storageValidationErrors,
    },
    validationErrors,
  };
}
