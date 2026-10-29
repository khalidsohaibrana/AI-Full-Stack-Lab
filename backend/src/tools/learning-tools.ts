import type { Tool } from "./types.js";

export const learningTools: Tool[] = [
  {
    name: "get_current_time",
    description: "Get the current ISO timestamp for the server.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    async execute() {
      return { timestamp: new Date().toISOString() };
    },
  },
  {
    name: "calculator",
    description: "Evaluate a basic arithmetic expression using numbers and +, -, *, /, and parentheses.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "For example: (15 * 8) + 2",
        },
      },
      required: ["expression"],
      additionalProperties: false,
    },
    async execute(argumentsValue) {
      const expression = readExpression(argumentsValue);
      return { expression, result: evaluateExpression(expression) };
    },
  },
];

function readExpression(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new Error("calculator arguments must be an object.");
  }

  const expression = (value as Record<string, unknown>).expression;

  if (typeof expression !== "string" || expression.trim().length === 0) {
    throw new Error("calculator requires a non-empty expression.");
  }

  return expression.trim();
}

function evaluateExpression(expression: string): number {
  const tokens = expression.match(/(?:\d+(?:\.\d+)?)|[()+\-*/]/g);

  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) {
    throw new Error("Expression contains unsupported characters.");
  }

  let position = 0;

  function parsePrimary(): number {
    const token = tokens?.[position++];

    if (token === "(") {
      const value = parseAdditive();
      if (tokens?.[position++] !== ")") throw new Error("Missing closing parenthesis.");
      return value;
    }

    if (token === "-") return -parsePrimary();

    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Expected a number.");
    return value;
  }

  function parseMultiplicative(): number {
    let value = parsePrimary();

    while (tokens?.[position] === "*" || tokens?.[position] === "/") {
      const operator = tokens[position++];
      const right = parsePrimary();
      if (operator === "/" && right === 0) throw new Error("Cannot divide by zero.");
      value = operator === "*" ? value * right : value / right;
    }

    return value;
  }

  function parseAdditive(): number {
    let value = parseMultiplicative();

    while (tokens?.[position] === "+" || tokens?.[position] === "-") {
      const operator = tokens[position++];
      const right = parseMultiplicative();
      value = operator === "+" ? value + right : value - right;
    }

    return value;
  }

  const result = parseAdditive();
  if (position !== tokens.length) throw new Error("Expression could not be parsed.");
  return result;
}
