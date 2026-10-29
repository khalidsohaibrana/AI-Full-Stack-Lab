import assert from "node:assert/strict";
import test from "node:test";
import { createExternalTools } from "./external-tools.js";

const config = {
  geocodingBaseUrl: "https://example.test/geocode",
  weatherBaseUrl: "https://example.test/weather",
  routingBaseUrl: "https://example.test/router",
};

test("weather resolves a place and requests today's forecast", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    if (requestedUrls.length === 1) {
      return Response.json({
        results: [{ name: "Lahore", admin1: "Punjab", country: "Pakistan", latitude: 31.52, longitude: 74.35 }],
      });
    }
    return Response.json({ timezone: "Asia/Karachi", current: { temperature_2m: 29, precipitation: 0, weather_code: 0 }, daily: { weather_code: [2], precipitation_probability_max: [0] } });
  };

  try {
    const weather = createExternalTools(config).find((tool) => tool.name === "get_weather");
    assert.ok(weather);
    const result = await weather.execute({ location: "Lahore" }, { userId: "test" });

    assert.equal((result as { location: string }).location, "Lahore, Punjab, Pakistan");
    assert.match(requestedUrls[1]!, /temperature_2m/);
    assert.deepEqual((result as { normalized: unknown }).normalized, {
      currentPrecipitationMm: 0,
      precipitationProbabilityPercent: 0,
      weatherDescription: "clear sky",
      rainExpected: false,
      umbrellaRecommended: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("directions use current coordinates and return a Google Maps link", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    if (requestedUrl.startsWith(config.geocodingBaseUrl)) {
      return Response.json({
        results: [{ name: "Lahore", latitude: 31.52, longitude: 74.35 }],
      });
    }
    return Response.json({ routes: [{ distance: 12345, duration: 3600 }] });
  };

  try {
    const directions = createExternalTools(config).find((tool) => tool.name === "get_directions");
    assert.ok(directions);
    const result = await directions.execute(
      { origin: "current location", destination: "Lahore", mode: "driving" },
      { userId: "test", currentLocation: { latitude: 31.5, longitude: 74.3 } },
    );

    assert.match(requestedUrl, /31\.5/);
    assert.equal((result as { distanceKm: number }).distanceKm, 12.35);
    assert.match((result as { googleMapsUrl: string }).googleMapsUrl, /google\.com\/maps\/dir/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("current-location requests fail clearly without permission", async () => {
  const weather = createExternalTools(config).find((tool) => tool.name === "get_weather");
  assert.ok(weather);

  await assert.rejects(
    () => weather.execute({ location: "current location" }, { userId: "test" }),
    /Current location is unavailable/,
  );
});
