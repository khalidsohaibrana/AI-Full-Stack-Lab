import type { Tool } from "./types.js";

type Coordinates = {
  latitude: number;
  longitude: number;
  name: string;
};

type GeocodingResponse = {
  results?: Array<{
    name?: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
  }>;
};

type NominatimResponse = Array<{
  display_name?: string;
  lat: string;
  lon: string;
}>;

type WeatherResponse = {
  timezone?: string;
  current?: Record<string, unknown>;
  daily?: Record<string, unknown>;
};

type RoutingResponse = {
  routes?: Array<{ distance: number; duration: number }>;
};

type BraveSearchResponse = {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      profile?: { long_name?: string };
    }>;
  };
};

type ExternalToolConfig = {
  geocodingBaseUrl: string;
  weatherBaseUrl: string;
  routingBaseUrl: string;
  webSearchProvider: "brave" | "bing-rss";
  webSearchApiKey?: string;
  webSearchBaseUrl: string;
  webSearchTimeoutMs: number;
  webSearchMaxResults: number;
};

export function createExternalTools(config: ExternalToolConfig): Tool[] {
  return [
    createWeatherTool(config),
    createDirectionsTool(config),
    createWebSearchTool(config),
  ];
}

function createWebSearchTool(config: ExternalToolConfig): Tool {
  return {
    name: "web_search",
    description: "Search the live web for current information and return concise cited results. Use this for recent facts, unfamiliar topics, and explicit web-search requests.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "A focused web search query." },
        maxResults: { type: "integer", minimum: 1, maximum: 10, description: "Maximum number of results, default 5." },
        recencyDays: { type: "integer", minimum: 1, maximum: 3650, description: "Optional freshness window in days." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async execute(argumentsValue) {
      const query = normalizeSearchQuery(readStringArgument(argumentsValue, "query"));
      const requestedMaxResults = readOptionalNumberArgument(argumentsValue, "maxResults");
      const maxResults = Math.min(
        10,
        Math.max(1, Math.floor(requestedMaxResults ?? config.webSearchMaxResults)),
      );
      const recencyDays = readOptionalNumberArgument(argumentsValue, "recencyDays");
      const useBrave = config.webSearchProvider === "brave" && Boolean(config.webSearchApiKey);
      const useGoogleNews = !useBrave && isNewsSearchQuery(query);
      const results = useBrave
        ? await searchBrave(query, maxResults, recencyDays, config)
        : useGoogleNews
          ? await searchGoogleNewsRss(query, maxResults, config)
          : await searchBingRss(query, maxResults, config);
      return {
        query,
        provider: useBrave ? "brave" : useGoogleNews ? "google-news-rss" : "bing-rss",
        providerFallback: config.webSearchProvider === "brave" && !config.webSearchApiKey
          ? `Brave is configured as preferred, but AI_WEB_SEARCH_API_KEY is missing; used ${useGoogleNews ? "Google News RSS" : "Bing RSS"} instead.`
          : undefined,
        resultCount: results.length,
        results,
        searchedAt: new Date().toISOString(),
        usageGuidance: "Use the result title, URL, and snippet as citations. Verify important claims against the linked source.",
      };
    },
  };
}

export function normalizeSearchQuery(input: string): string {
  const query = input.replace(/\s+/gu, " ").trim();
  const fundingMatch = query.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/iu);
  if (/\b(startups?|start-ups?|funding|funded|investment|venture)\b/iu.test(query) && fundingMatch) {
    return `IT startup funding ${fundingMatch[1]} ${fundingMatch[2]} investors`;
  }

  if (/\b(marketplace|used car|used cars|vehicle|listing|listings)\b/iu.test(query)) {
    const location = query.match(/\b(?:in|near)\s+([A-Za-z][A-Za-z .'-]{2,40}?)(?:[?.!,]|$)/iu)?.[1]?.trim();
    const model = query.match(/\b(?:used\s+)?([A-Za-z][A-Za-z0-9-]*\s+[A-Za-z][A-Za-z0-9-]*(?:\s+\d{4})?)\b/iu)?.[1]?.trim();
    if (model) return `${model}${location ? ` ${location}` : ""}`;
  }

  return query.length > 240 ? query.slice(0, 240) : query;
}

async function searchBrave(
  query: string,
  maxResults: number,
  recencyDays: number | undefined,
  config: ExternalToolConfig,
): Promise<WebSearchResult[]> {
  if (!config.webSearchApiKey) {
    throw new Error("Brave web search requires AI_WEB_SEARCH_API_KEY.");
  }
  const url = new URL(config.webSearchBaseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  if (recencyDays !== undefined && recencyDays > 0) {
    url.searchParams.set("freshness", `pd${Math.min(3650, Math.floor(recencyDays))}`);
  }
  const data = await fetchJson<BraveSearchResponse>(url, {
    headers: { "X-Subscription-Token": config.webSearchApiKey, Accept: "application/json" },
    timeoutMs: config.webSearchTimeoutMs,
  });
  return (data.web?.results ?? [])
    .filter((result) => typeof result.title === "string" && typeof result.url === "string")
    .slice(0, maxResults)
    .map((result, index) => ({
      position: index + 1,
      title: result.title!,
      url: result.url!,
      snippet: stripMarkup(result.description ?? ""),
      source: result.profile?.long_name ?? new URL(result.url!).hostname,
    }));
}

async function searchBingRss(
  query: string,
  maxResults: number,
  config: ExternalToolConfig,
): Promise<WebSearchResult[]> {
  const url = new URL(config.webSearchBaseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  const xml = await fetchText(url, { timeoutMs: config.webSearchTimeoutMs });
  const results: WebSearchResult[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/giu;
  for (const match of xml.matchAll(itemPattern)) {
    const item = match[1] ?? "";
    const title = readXmlTag(item, "title");
    const link = readXmlTag(item, "link");
    if (!title || !link) continue;
    results.push({
      position: results.length + 1,
      title,
      url: link,
      snippet: readXmlTag(item, "description") ?? "",
      source: (() => {
        try { return new URL(link).hostname; } catch { return "Bing"; }
      })(),
    });
    if (results.length >= maxResults) break;
  }
  return results;
}

async function searchGoogleNewsRss(
  query: string,
  maxResults: number,
  config: ExternalToolConfig,
): Promise<WebSearchResult[]> {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");
  const xml = await fetchText(url, { timeoutMs: config.webSearchTimeoutMs });
  const results: WebSearchResult[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/giu;
  for (const match of xml.matchAll(itemPattern)) {
    const item = match[1] ?? "";
    const title = readXmlTag(item, "title");
    const link = readXmlTag(item, "link");
    if (!title || !link) continue;
    results.push({
      position: results.length + 1,
      title,
      url: link,
      snippet: readXmlTag(item, "description") ?? "",
      source: readXmlTag(item, "source") ?? "Google News",
    });
    if (results.length >= maxResults) break;
  }
  return results;
}

function isNewsSearchQuery(query: string): boolean {
  return /\b(startups?|start-ups?|funding|funded|investment|venture|financing|news)\b/iu.test(query);
}

type WebSearchResult = {
  position: number;
  title: string;
  url: string;
  snippet: string;
  source: string;
};

function createWeatherTool(config: ExternalToolConfig): Tool {
  return {
    name: "get_weather",
    description: "Get today's current conditions and forecast for a place or the user's current location.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "A city or place name, or 'current location'.",
        },
      },
      required: ["location"],
      additionalProperties: false,
    },
    async execute(argumentsValue, context) {
      const location = readStringArgument(argumentsValue, "location");
      const coordinates = await resolveLocation(location, context, config);
      const url = new URL(config.weatherBaseUrl);
      url.searchParams.set("latitude", String(coordinates.latitude));
      url.searchParams.set("longitude", String(coordinates.longitude));
      url.searchParams.set(
        "current",
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
      );
      url.searchParams.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
      );
      url.searchParams.set("forecast_days", "1");
      url.searchParams.set("timezone", "auto");

      const data = await fetchJson<WeatherResponse>(url);
      const current = data.current ?? {};
      const today = data.daily ?? {};
      const currentPrecipitationMm = readNumber(current.precipitation) ?? 0;
      const precipitationProbabilityPercent = readFirstNumber(
        today.precipitation_probability_max,
      ) ?? 0;
      const currentWeatherCode = readNumber(current.weather_code);
      const todayWeatherCode = readFirstNumber(today.weather_code);
      const weatherDescription = describeWeatherCode(
        currentWeatherCode ?? todayWeatherCode,
      );
      const rainExpected =
        currentPrecipitationMm > 0 || precipitationProbabilityPercent > 0 ||
        isRainCode(currentWeatherCode ?? todayWeatherCode);
      return {
        location: coordinates.name,
        coordinates: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
        timezone: data.timezone,
        current: data.current,
        today: data.daily,
        normalized: {
          currentPrecipitationMm,
          precipitationProbabilityPercent,
          weatherDescription,
          rainExpected,
          umbrellaRecommended: rainExpected,
        },
        source: "Open-Meteo",
      };
    },
  };
}

function createDirectionsTool(config: ExternalToolConfig): Tool {
  return {
    name: "get_directions",
    description: "Get route distance and duration between an origin and destination. The origin may be 'current location'.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Starting place or 'current location'." },
        destination: { type: "string", description: "Ending place or address." },
        mode: {
          type: "string",
          enum: ["driving", "walking", "cycling"],
          description: "Travel mode; defaults to driving.",
        },
      },
      required: ["origin", "destination"],
      additionalProperties: false,
    },
    async execute(argumentsValue, context) {
      const origin = readStringArgument(argumentsValue, "origin");
      const destination = readStringArgument(argumentsValue, "destination");
      const modeValue = readOptionalStringArgument(argumentsValue, "mode") ?? "driving";
      const mode = isTravelMode(modeValue) ? modeValue : "driving";
      const [originCoordinates, destinationCoordinates] = await Promise.all([
        resolveLocation(origin, context, config),
        resolveLocation(destination, context, config),
      ]);
      const profile = mode === "driving" ? "driving" : mode;
      const routeUrl = new URL(
        `${config.routingBaseUrl.replace(/\/$/u, "")}/route/v1/${profile}/${originCoordinates.longitude},${originCoordinates.latitude};${destinationCoordinates.longitude},${destinationCoordinates.latitude}`,
      );
      routeUrl.searchParams.set("overview", "false");

      const data = await fetchJson<RoutingResponse>(routeUrl);
      const route = data.routes?.[0];
      if (!route) throw new Error("The routing provider returned no route.");

      return {
        origin: originCoordinates,
        destination: destinationCoordinates,
        mode,
        distanceKm: Number((route.distance / 1000).toFixed(2)),
        durationMinutes: Number((route.duration / 60).toFixed(1)),
        googleMapsUrl: buildGoogleMapsUrl(origin, destination, mode),
        source: "OSRM",
      };
    },
  };
}

async function resolveLocation(
  value: string,
  context: Parameters<Tool["execute"]>[1],
  config: ExternalToolConfig,
): Promise<Coordinates> {
  if (value.trim().toLowerCase() === "current location") {
    if (!context.currentLocation) {
      throw new Error("Current location is unavailable. Ask the user to grant location permission first.");
    }

    return { ...context.currentLocation, name: "Current location" };
  }

  const coordinateMatch = value.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/u);
  if (coordinateMatch) {
    return {
      latitude: Number(coordinateMatch[1]),
      longitude: Number(coordinateMatch[2]),
      name: value.trim(),
    };
  }

  const url = new URL(config.geocodingBaseUrl);
  url.searchParams.set(
    config.geocodingBaseUrl.includes("nominatim") ? "q" : "name",
    value,
  );
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const data = await fetchJson<GeocodingResponse | NominatimResponse>(url);
  if (Array.isArray(data)) {
    const result = data[0];
    if (!result) throw new Error(`Could not find a location for '${value}'.`);

    return {
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      name: result.display_name ?? value,
    };
  }

  const result = data.results?.[0];
  if (!result) throw new Error(`Could not find a location for '${value}'.`);

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    name: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
  };
}

async function fetchJson<T>(url: URL, options: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `External provider returned HTTP ${response.status} for ${url.toString()}${detail ? `: ${detail}` : "."}`,
    );
  }
  return response.json() as Promise<T>;
}

async function fetchText(url: URL, options: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<string> {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `External provider returned HTTP ${response.status} for ${url.toString()}${detail ? `: ${detail}` : "."}`,
    );
  }
  return response.text();
}

async function fetchWithTimeout(
  url: URL,
  options: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AI-Full-Stack-Lab-learning-app/0.1",
        ...options.headers,
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`External provider timed out after ${options.timeoutMs ?? 10_000}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function readXmlTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]
    ? stripMarkup(decodeHtmlEntities(match[1])).trim()
    : undefined;
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]*>/gu, "").replace(/\s+/gu, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

function readOptionalNumberArgument(value: unknown, name: string): number | undefined {
  if (!value || typeof value !== "object") throw new Error("Tool arguments must be an object.");
  const result = (value as Record<string, unknown>)[name];
  if (result === undefined) return undefined;
  const numericResult = typeof result === "string" && result.trim() !== ""
    ? Number(result)
    : result;
  if (typeof numericResult !== "number" || !Number.isFinite(numericResult)) {
    throw new Error(`${name} must be a finite number when provided.`);
  }
  return numericResult;
}

function readStringArgument(value: unknown, name: string): string {
  const result = readOptionalStringArgument(value, name);
  if (!result) throw new Error(`${name} must be a non-empty string.`);
  return result;
}

function readOptionalStringArgument(value: unknown, name: string): string | undefined {
  if (!value || typeof value !== "object") throw new Error("Tool arguments must be an object.");
  const result = (value as Record<string, unknown>)[name];
  return typeof result === "string" && result.trim() ? result.trim() : undefined;
}

function isTravelMode(value: string): value is "driving" | "walking" | "cycling" {
  return value === "driving" || value === "walking" || value === "cycling";
}

function buildGoogleMapsUrl(origin: string, destination: string, mode: string): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("travelmode", mode);
  return url.toString();
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readFirstNumber(value: unknown): number | undefined {
  return Array.isArray(value) ? readNumber(value[0]) : readNumber(value);
}

function isRainCode(code: number | undefined): boolean {
  return code !== undefined && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95);
}

function describeWeatherCode(code: number | undefined): string {
  if (code === 0) return "clear sky";
  if (code === 1) return "mainly clear";
  if (code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code !== undefined && code >= 51 && code <= 57) return "drizzle";
  if (code !== undefined && code >= 61 && code <= 67) return "rain or freezing rain";
  if (code !== undefined && code >= 71 && code <= 77) return "snow";
  if (code !== undefined && code >= 80 && code <= 82) return "rain showers";
  if (code !== undefined && code >= 85 && code <= 86) return "snow showers";
  if (code !== undefined && code >= 95) return "thunderstorm";
  return "unknown conditions";
}
