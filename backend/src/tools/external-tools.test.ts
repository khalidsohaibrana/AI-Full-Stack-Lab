import assert from "node:assert/strict";
import test from "node:test";
import { createExternalTools, normalizeSearchQuery } from "./external-tools.js";

const config = {
  geocodingBaseUrl: "https://example.test/geocode",
  weatherBaseUrl: "https://example.test/weather",
  routingBaseUrl: "https://example.test/router",
  webSearchProvider: "bing-rss" as const,
  webSearchBaseUrl: "https://example.test/search",
  webSearchTimeoutMs: 1000,
  webSearchMaxResults: 5,
};

test("normalizes long research prompts into focused search queries", () => {
  assert.equal(
    normalizeSearchQuery("Find the top 10 IT startups that received funding in October 2026. Include startup, amount, date, investors, and source URL."),
    "IT startup funding October 2026 investors",
  );
});

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

test("web search parses ranked RSS results and limits the result count", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(`<?xml version="1.0"?><rss><channel>
      <item><title>First &amp; Best Result</title><link>https://example.com/first</link><description>First &lt;b&gt;snippet&lt;/b&gt;</description></item>
      <item><title>Second Result</title><link>https://example.com/second</link><description>Second snippet</description></item>
    </channel></rss>`, { headers: { "Content-Type": "application/rss+xml" } });
  };

  try {
    const search = createExternalTools(config).find((tool) => tool.name === "web_search");
    assert.ok(search);
    const result = await search.execute({ query: "AI agents", maxResults: 1 }, { userId: "test" }) as {
      provider: string;
      resultCount: number;
      results: Array<{ title: string; url: string; snippet: string; position: number }>;
    };

    assert.match(requestedUrl, /q=AI\+agents/);
    assert.equal(result.provider, "bing-rss");
    assert.equal(result.resultCount, 1);
    assert.deepEqual(result.results[0], {
      position: 1,
      title: "First & Best Result",
      url: "https://example.com/first",
      snippet: "First snippet",
      source: "example.com",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Brave search sends the API key and normalizes citations", async () => {
  const originalFetch = globalThis.fetch;
  let requestedHeaders: HeadersInit | undefined;
  globalThis.fetch = async (_input, init) => {
    requestedHeaders = init?.headers;
    return Response.json({ web: { results: [{ title: "Brave result", url: "https://example.com/result", description: "A result", profile: { long_name: "Example" } }] } });
  };

  try {
    const search = createExternalTools({ ...config, webSearchProvider: "brave", webSearchApiKey: "secret", webSearchBaseUrl: "https://api.search.brave.com/res/v1/web/search" }).find((tool) => tool.name === "web_search");
    assert.ok(search);
    const result = await search.execute({ query: "latest AI", recencyDays: 7 }, { userId: "test" }) as { results: Array<{ source: string; url: string }> };

    assert.equal((requestedHeaders as Record<string, string>)["X-Subscription-Token"], "secret");
    assert.deepEqual(result.results, [{ position: 1, title: "Brave result", url: "https://example.com/result", snippet: "A result", source: "Example" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Brave preference falls back to Bing RSS when no API key is configured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<?xml version="1.0"?><rss><channel>
    <item><title>Fallback result</title><link>https://example.com/fallback</link><description>Fallback snippet</description></item>
  </channel></rss>`, { headers: { "Content-Type": "application/rss+xml" } });

  try {
    const search = createExternalTools({
      ...config,
      webSearchProvider: "brave",
      webSearchBaseUrl: "https://api.search.brave.com/res/v1/web/search",
    }).find((tool) => tool.name === "web_search");
    assert.ok(search);
    const result = await search.execute(
      { query: "latest IT startup funding", maxResults: "10", recencyDays: "0" },
      { userId: "test" },
    ) as { provider: string; providerFallback?: string; resultCount: number; results: Array<{ source: string }> };

    assert.equal(result.provider, "google-news-rss");
    assert.match(result.providerFallback ?? "", /AI_WEB_SEARCH_API_KEY/);
    assert.equal(result.resultCount, 1);
    assert.equal(result.results[0]?.source, "Google News");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
