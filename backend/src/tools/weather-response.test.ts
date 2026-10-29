import test from "node:test";
import assert from "node:assert/strict";
import { createGroundedWeatherResponse, isWeatherRequest } from "./weather-response.js";

test("identifies weather requests", () => {
  assert.equal(isWeatherRequest("Should I carry an umbrella in Lahore?"), true);
  assert.equal(isWeatherRequest("Explain planning agents"), false);
});

test("formats weather from normalized evidence without model interpretation", () => {
  const response = createGroundedWeatherResponse("Should I carry an umbrella?", [
    {
      location: "Lahore",
      normalized: {
        currentPrecipitationMm: 0,
        precipitationProbabilityPercent: 0,
        weatherDescription: "clear sky",
        rainExpected: false,
        umbrellaRecommended: false,
      },
    },
  ]);

  assert.equal(
    response,
    "Current weather in Lahore: clear sky. Current precipitation is 0 mm, with a 0% precipitation probability. An umbrella is not necessary based on this data.",
  );
});

test("does not produce a weather answer without normalized evidence", () => {
  assert.equal(createGroundedWeatherResponse("What is the weather?", [{ temperature: 25 }]), null);
});

test("uses a concise location from the request", () => {
  const response = createGroundedWeatherResponse("What is the weather in Lahore today?", [
    {
      location: "لاہور, Pakistan",
      normalized: {
        currentPrecipitationMm: 0,
        precipitationProbabilityPercent: 0,
        weatherDescription: "clear sky",
        rainExpected: false,
        umbrellaRecommended: false,
      },
    },
  ]);

  assert.match(response ?? "", /^Current weather in Lahore:/);
});
