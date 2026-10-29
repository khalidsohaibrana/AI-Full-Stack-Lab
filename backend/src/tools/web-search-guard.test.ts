import test from "node:test";
import assert from "node:assert/strict";
import { enforceSearchEvidence, isLiveSearchRequest } from "./web-search-guard.js";

test("recognizes live listing and marketplace requests", () => {
  assert.equal(isLiveSearchRequest("Find a used car listing in Lahore"), true);
  assert.equal(isLiveSearchRequest("Explain what semantic memory is"), false);
});

test("returns a deterministic honest response when search has no results", () => {
  const answer = enforceSearchEvidence(
    "Find a used Suzuki Cultus listing",
    "I found some options at https://example.com",
    [{ query: "used Suzuki Cultus", results: [] }],
  );
  assert.match(answer, /could not find vehicle listings or prices/);
  assert.doesNotMatch(answer, /example\.com/);
});

test("removes URLs that were not returned by search", () => {
  const answer = enforceSearchEvidence(
    "Search for current AI agent news",
    "Verified: https://allowed.example/story. Also see https://invented.example/home.",
    [{ results: [{ url: "https://allowed.example/story" }] }],
  );
  assert.match(answer, /https:\/\/allowed\.example\/story/);
  assert.doesNotMatch(answer, /invented\.example/);
});
