export type WebSearchEvidence = {
  query?: string;
  results: Array<{ url: string; title?: string; snippet?: string }>;
};

export function isLiveSearchRequest(request: string): boolean {
  return /\b(search|find|listing|listings|marketplace|used car|price|prices|availability|latest|current)\b/iu.test(request);
}

export function enforceSearchEvidence(
  request: string,
  answer: string,
  evidence: WebSearchEvidence[],
): string {
  if (!isLiveSearchRequest(request)) return answer;

  const usableEvidence = evidence.filter((item) => Array.isArray(item.results));
  const allResults = usableEvidence.flatMap((item) => item.results);
  if (usableEvidence.length === 0 || allResults.length === 0) {
    const query = usableEvidence.find((item) => item.query)?.query;
    const subject = /\b(startup|start-ups|funding|funded|investment|venture)\b/iu.test(request)
      ? "funding results"
      : /\b(car|cars|vehicle|marketplace|listing|listings|price|prices)\b/iu.test(request)
        ? "vehicle listings or prices"
        : "verified live results";
    return `I could not find ${subject} for this request${query ? ` using the query “${query}”` : ""}. I will not invent facts, prices, listings, or URLs. Try a broader search or configure a search provider with better coverage.`;
  }

  const allowedUrls = new Set(allResults.map((result) => result.url));
  return answer.replace(/https?:\/\/[^\s)\]]+/giu, (candidate) => {
    const normalized = candidate.replace(/[.,;:!?]+$/u, "");
    return allowedUrls.has(normalized)
      ? normalized
      : "[unverified URL omitted]";
  });
}
