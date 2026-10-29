type WeatherOutput = {
  location?: unknown;
  normalized?: {
    currentPrecipitationMm?: unknown;
    precipitationProbabilityPercent?: unknown;
    weatherDescription?: unknown;
    rainExpected?: unknown;
    umbrellaRecommended?: unknown;
  };
};

export function isWeatherRequest(request: string): boolean {
  return /\b(weather|rain|raining|precipitation|forecast|umbrella)\b/iu.test(request);
}

export function isWeatherOnlyRequest(request: string): boolean {
  return isWeatherRequest(request) && !/\b(and|also|plus|calculate|compute|sum|multiply|divide|times)\b|[+*/=]/iu.test(request);
}

export function createGroundedWeatherResponse(
  request: string,
  outputs: unknown[],
): string | null {
  if (!isWeatherRequest(request)) return null;

  const weather = outputs.find(isWeatherOutput);
  if (!weather?.normalized) return null;

  const location = formatLocation(request, weather.location);
  const normalized = weather.normalized;
  const description = readString(normalized.weatherDescription, "current conditions are unavailable");
  const precipitation = readNumber(normalized.currentPrecipitationMm, 0);
  const probability = readNumber(normalized.precipitationProbabilityPercent, 0);
  const rainExpected = normalized.rainExpected === true;
  const umbrellaRecommended = normalized.umbrellaRecommended === true;
  const weatherLine = `Current weather in ${location}: ${description}. Current precipitation is ${precipitation} mm, with a ${probability}% precipitation probability.`;

  if (/\b(umbrella|rain|raining|precipitation)\b/iu.test(request)) {
    return `${weatherLine} ${umbrellaRecommended ? "An umbrella is recommended." : "An umbrella is not necessary based on this data."}`;
  }

  return `${weatherLine} ${rainExpected ? "Rain is expected." : "No rain is expected."}`;
}

function isWeatherOutput(value: unknown): value is WeatherOutput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as WeatherOutput;
  return Boolean(candidate.normalized && typeof candidate.normalized === "object");
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatLocation(request: string, value: unknown): string {
  const requestedLocation = request.match(/\b(?:in|for)\s+([a-z][a-z\s-]*)/iu)?.[1]?.trim();
  if (requestedLocation) return requestedLocation.replace(/\s+(?:weather|today)$/iu, "");
  if (typeof value === "string" && value.trim()) return value.split(",")[0]?.trim() || "the requested location";
  return "the requested location";
}
