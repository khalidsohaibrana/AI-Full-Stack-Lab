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

type ExternalToolConfig = {
  geocodingBaseUrl: string;
  weatherBaseUrl: string;
  routingBaseUrl: string;
};

export function createExternalTools(config: ExternalToolConfig): Tool[] {
  return [
    createWeatherTool(config),
    createDirectionsTool(config),
  ];
}

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
      return {
        location: coordinates.name,
        coordinates: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
        timezone: data.timezone,
        current: data.current,
        today: data.daily,
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

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "AI-Full-Stack-Lab-learning-app/0.1" },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `External provider returned HTTP ${response.status} for ${url.toString()}${detail ? `: ${detail}` : "."}`,
    );
  }
  return response.json() as Promise<T>;
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
