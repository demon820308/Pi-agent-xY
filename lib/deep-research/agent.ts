import { getPiAgentDefaultModel } from "./credentials";
import { searchWeb, scrapeUrl, SearchResult } from "./scraper";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StructuredFact {
  fact: string;
  url: string;
  title: string;
}

export interface ResearchDimension {
  topic: string;
  questions: string[];
}

export interface ResearchOutline {
  title: string;
  dimensions: ResearchDimension[];
}

export interface ResearchProgress {
  type: "status" | "query" | "scrape" | "learning" | "progress" | "done" | "error"
    | "scoping" | "planning" | "gap_checking" | "writing";
  message?: string;
  query?: string;
  url?: string;
  learning?: string;
  depth?: number;
  maxDepth?: number;
  report?: string;
}

export type ProgressCallback = (event: ResearchProgress) => void;

// ── Unified LLM Caller ───────────────────────────────────────────────────────

async function callLLM(systemPrompt: string, userPrompt: string, jsonMode = false, model?: { provider: string; modelId: string }): Promise<string> {
  const config = await getPiAgentDefaultModel(model?.provider, model?.modelId);

  let endpoint = `${config.baseURL}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.headers
  };

  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const isGoogle = config.provider === "google" || config.provider === "gemini" || config.provider.includes("google") || config.provider.includes("gemini");
  const isAnthropic = config.provider === "anthropic" ||
                      config.provider.includes("anthropic") ||
                      config.provider.startsWith("minimax") ||
                      config.baseURL.includes("/anthropic");

  if (isAnthropic) {
    let baseUrl = config.baseURL;
    if (config.provider.startsWith("minimax") && !baseUrl.includes("/anthropic")) {
      if (baseUrl.includes("api.minimaxi.com")) {
        baseUrl = "https://api.minimaxi.com/anthropic";
      } else if (baseUrl.includes("api.minimax.io")) {
        baseUrl = "https://api.minimax.io/anthropic";
      }
    }
    endpoint = `${baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl}/v1/messages`;
    if (!config.headers["x-api-key"] && config.apiKey) {
      headers["x-api-key"] = config.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    }
  }

  let responseText = "";

  try {
    if (isGoogle) {
      const modelId = config.modelId.startsWith("models/") ? config.modelId : `models/${config.modelId}`;
      const googleUrl = `https://generativelanguage.googleapis.com/v1beta/${modelId}:generateContent?key=${config.apiKey}`;

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemPrompt}\n\n[USER INPUT]:\n${userPrompt}` }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 8000,
          responseMimeType: jsonMode ? "application/json" : "text/plain"
        }
      };

      const res = await fetch(googleUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(600000)
      });
      if (!res.ok) {
        throw new Error(`Google API returned status ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as any;
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    } else if (isAnthropic) {
      const payload = {
        model: config.modelId,
        system: systemPrompt,
        max_tokens: 8000,
        messages: [
          { role: "user", content: userPrompt }
        ]
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(600000)
      });
      if (!res.ok) {
        throw new Error(`Anthropic API returned status ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as any;
      responseText = data.content?.[0]?.text?.trim() || "";

    } else {
      const payload: any = {
        model: config.modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 8000
      };

      if (jsonMode) {
        payload.response_format = { type: "json_object" };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(600000)
      });
      if (!res.ok) {
        throw new Error(`OpenAI-compatible API returned status ${res.status}: ${await res.text()}`);
      }
      const data = await res.json() as any;
      responseText = data.choices?.[0]?.message?.content?.trim() || "";
    }
  } catch (err: any) {
    console.error(`[agent] LLM invocation failed on provider "${config.provider}":`, err);
    throw new Error(`LLM Error: ${err.message || String(err)}`);
  }

  return responseText;
}

// ── JSON Helper ──────────────────────────────────────────────────────────────

function cleanAndParseJSON(text: string): any {
  let clean = text.trim();
  if (clean.startsWith("```")) {
    const lines = clean.split("\n");
    if (lines[0].startsWith("```")) {
      clean = lines.slice(1, lines[lines.length - 1].startsWith("```") ? -1 : undefined).join("\n").trim();
    }
  }
  clean = clean.replace(/^```json/i, "").replace(/```$/m, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
    console.error("[agent] Failed to parse JSON. Raw content:", text);
    throw new Error("Failed to parse structured JSON from model response.");
  }
}

// ── Throttled Parallel Helper ────────────────────────────────────────────────

async function throttleActions<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

// ── Deduplication Helper ─────────────────────────────────────────────────────

function deduplicateFacts(facts: StructuredFact[]): StructuredFact[] {
  const seen = new Set<string>();
  return facts.filter(f => {
    const key = f.fact.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "").slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Content Summarizer ───────────────────────────────────────────────────────

async function summarizeContent(
  url: string,
  title: string,
  content: string,
  model?: { provider: string; modelId: string }
): Promise<string> {
  const systemPrompt = `You are a content summarizer. Condense the provided web page content into a clean, structured summary that preserves all factual information, statistics, named entities, dates, and key claims. Remove boilerplate, navigation, ads, and irrelevant filler.
Output the summary as plain text (not JSON). Keep all concrete data points.`;

  const truncated = content.length > 20000 ? content.substring(0, 20000) + "... [Truncated]" : content;
  const userPrompt = `Webpage URL: ${url}
Webpage Title: ${title}

Raw Content:
${truncated}

Provide a structured summary preserving all factual content.`;

  return await callLLM(systemPrompt, userPrompt, false, model);
}

// ── LLM with Truncation Retry ────────────────────────────────────────────────

const CONTEXT_ERROR_PATTERNS = [
  /context.*(?:length|window|limit|token)/i,
  /maximum.*(?:context|token|length)/i,
  /(?:token|prompt).*limit/i,
  /too many tokens/i,
  /exceeds.*(?:limit|maximum)/i,
  /request.*too large/i,
  /429/,
  /rate.?limit/i,
];

function isContextLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${err.stack}` : String(err);
  return CONTEXT_ERROR_PATTERNS.some(p => p.test(msg));
}

async function callLLMWithTruncationRetry(
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean,
  model: { provider: string; modelId: string } | undefined,
  onProgress?: ProgressCallback,
  maxRetries = 3
): Promise<string> {
  let currentPrompt = userPrompt;
  const originalLength = currentPrompt.length;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callLLM(systemPrompt, currentPrompt, jsonMode, model);
    } catch (err: any) {
      if (!isContextLimitError(err) || attempt === maxRetries) {
        throw err;
      }

      const reduction = Math.max(1, Math.floor(currentPrompt.length * 0.3));
      const newLength = currentPrompt.length - reduction;
      currentPrompt = currentPrompt.slice(0, newLength)
        + "\n\n[Content truncated due to context limit — reduced from "
        + originalLength + " to " + newLength + " chars]";

      onProgress?.({
        type: "status",
        message: `[Retry] Context limit hit (attempt ${attempt + 1}/${maxRetries}). Truncating input from ${originalLength} to ${newLength} chars...`
      });
    }
  }

  throw new Error("LLM call failed after all truncation retries");
}

// ── Phase 1: Scoping & Outline Generation ────────────────────────────────────

async function generateResearchOutline(query: string, model?: { provider: string; modelId: string }): Promise<ResearchOutline> {
  const systemPrompt = `You are a senior research strategist. Given a research topic, decompose it into 3-4 distinct research dimensions (sub-topics), each with 2-3 concrete investigative questions that must be answered for a comprehensive report.
You MUST output a raw JSON object with this exact structure:
{
  "title": "A concise title for the overall research",
  "dimensions": [
    {
      "topic": "Name of the sub-topic / dimension",
      "questions": ["Specific question 1", "Specific question 2", "Specific question 3"]
    }
  ]
}
Ensure the dimensions cover different angles: technical, market/industry, comparative, future outlook, etc. Be specific and avoid overlap.`;

  const userPrompt = `Research Topic: "${query}"

Decompose this into research dimensions and investigative questions.`;

  const raw = await callLLM(systemPrompt, userPrompt, true, model);
  return cleanAndParseJSON(raw);
}

// ── Phase 2: Query Generation ────────────────────────────────────────────────

async function generateQueriesForDimension(
  dimension: ResearchDimension,
  existingFacts: string[],
  count: number,
  model?: { provider: string; modelId: string }
): Promise<{ query: string; rationale: string }[]> {
  const systemPrompt = `You are a search query specialist. Generate precise, diverse search queries to find factual, data-rich content for a specific research dimension.
You MUST output a raw JSON object with this exact structure:
{
  "queries": [
    {
      "query": "exact search term",
      "rationale": "brief reason for this search query"
    }
  ]
}
Make queries specific enough to surface authoritative sources. Vary the phrasing to cover different search engines.`;

  const userPrompt = `Research Dimension: "${dimension.topic}"
Investigative Questions:
${dimension.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Already gathered facts (avoid redundancy):
${existingFacts.length > 0 ? existingFacts.map((f, i) => `${i + 1}. ${f}`).join("\n") : "(none yet)"}

Generate up to ${count} search queries to find new, specific information for this dimension.`;

  const raw = await callLLM(systemPrompt, userPrompt, true, model);
  const data = cleanAndParseJSON(raw);
  return (data.queries || []).slice(0, count);
}

// ── Phase 3: Page Processing & Fact Extraction ───────────────────────────────

async function extractFactsFromPage(
  query: string,
  url: string,
  title: string,
  content: string,
  model?: { provider: string; modelId: string }
): Promise<{ facts: StructuredFact[]; followUpQueries: string[] }> {
  const systemPrompt = `You are a research analyst. Read the scraped page content and extract key facts, statistics, findings, and data points relevant to the research topic.
Each fact must be a concrete, specific piece of information (a number, a named entity, a date, a claim with attribution).
You MUST output a raw JSON object with this exact structure:
{
  "facts": ["fact 1", "fact 2", "fact 3", ...],
  "followUpQueries": ["query 1", "query 2", ...]
}
Limit to the most concrete, verifiable facts. Do NOT include vague generalities.`;

  const truncatedContent = content.length > 15000 ? content.substring(0, 15000) + "... [Content Truncated] ..." : content;
  const userPrompt = `Research Topic: "${query}"
Webpage URL: ${url}
Webpage Title: ${title}

Webpage Content:
${truncatedContent}`;

  const raw = await callLLM(systemPrompt, userPrompt, true, model);
  const data = cleanAndParseJSON(raw);

  const facts: StructuredFact[] = (data.facts || []).map((fact: string) => ({
    fact,
    url,
    title
  }));

  return {
    facts,
    followUpQueries: data.followUpQueries || []
  };
}

// ── Phase 4: Gap Analysis ────────────────────────────────────────────────────

async function checkResearchGaps(
  outline: ResearchOutline,
  facts: StructuredFact[],
  model?: { provider: string; modelId: string }
): Promise<{ gaps: string[]; followUpQueries: { query: string; rationale: string }[] }> {
  const systemPrompt = `You are a research quality auditor. Review the gathered facts against the original research outline and identify gaps — dimensions or questions that lack sufficient evidence, data, or depth.
You MUST output a raw JSON object with this exact structure:
{
  "gaps": ["Description of gap 1", "Description of gap 2", ...],
  "followUpQueries": [
    { "query": "search query to fill gap", "rationale": "which gap it addresses" }
  ]
}
Only flag genuine gaps where the existing facts are insufficient. Be specific about what information is missing.`;

  const factsByDimension = outline.dimensions.map(dim => {
    const relevantFacts = facts.filter(f =>
      dim.questions.some(q => f.fact.toLowerCase().includes(q.toLowerCase().slice(0, 20)))
    );
    return `## ${dim.topic}\nQuestions: ${dim.questions.join("; ")}\nFacts found: ${relevantFacts.length > 0 ? relevantFacts.map(f => `- ${f.fact}`).join("\n") : "(none)"}`;
  }).join("\n\n");

  const userPrompt = `Original Research Outline:
Title: ${outline.title}
${outline.dimensions.map(d => `- ${d.topic}: ${d.questions.join(", ")}`).join("\n")}

Gathered Facts Summary:
${factsByDimension}

Total facts collected: ${facts.length}

Identify gaps and suggest targeted follow-up search queries to fill them.`;

  const raw = await callLLM(systemPrompt, userPrompt, true, model);
  return cleanAndParseJSON(raw);
}

// ── Phase 5: Report Synthesis ────────────────────────────────────────────────

export async function generateReport(
  query: string,
  outline: ResearchOutline,
  facts: StructuredFact[],
  urls: string[],
  model?: { provider: string; modelId: string },
  onProgress?: ProgressCallback
): Promise<string> {
  const systemPrompt = `You are a senior research analyst and writer. Your goal is to write a highly detailed, professional, and comprehensive Markdown report synthesizing all gathered research facts.

Your report MUST follow these guidelines:
1. Structure: Follow the research outline dimensions as H2 sections, with H3 sub-sections for specific questions.
2. Exhaustiveness: Synthesize ALL facts provided. Do NOT omit details or simplify. Include comparative tables where data supports it.
3. Inline Citations: Every factual claim MUST include an inline hyperlink to its source. Format: [Source Title](URL). Group related citations.
4. Data Presentation: Use tables for comparative data, statistics, and metrics. Use bullet points for enumerated findings.
5. Analysis: Don't just list facts — provide analytical synthesis, identify patterns, contradictions, and trends.
6. References: End with a numbered "References" section listing all unique sources with full URLs.
7. Language: Match the language of the original query (Chinese if the query is in Chinese, English otherwise).`;

  const factsText = facts.map((f, i) => `[${i + 1}] ${f.fact} — Source: [${f.title}](${f.url})`).join("\n");

  const userPrompt = `Research Topic: "${query}"

Research Outline:
${outline.dimensions.map(d => `### ${d.topic}\n${d.questions.map(q => `- ${q}`).join("\n")}`).join("\n\n")}

All Gathered Facts (with sources):
${factsText}

Total unique sources: ${urls.length}

Write the complete Markdown report now. Be thorough and analytical.`;

  return await callLLMWithTruncationRetry(systemPrompt, userPrompt, false, model, onProgress);
}

// ── Main Orchestrator ────────────────────────────────────────────────────────

export async function deepResearch({
  query,
  breadth,
  depth,
  onProgress,
  model
}: {
  query: string;
  breadth: number;
  depth: number;
  onProgress: ProgressCallback;
  model?: { provider: string; modelId: string };
}): Promise<{ facts: StructuredFact[]; visitedUrls: string[]; outline: ResearchOutline }> {

  const allFacts: StructuredFact[] = [];
  const visitedUrls: string[] = [];
  const allFollowUpQueries: string[] = [];

  // ── Phase 1: Scoping & Outline ──────────────────────────────────────────
  onProgress({ type: "scoping", message: "[Scoping] Generating research outline..." });
  let outline: ResearchOutline;
  try {
    outline = await generateResearchOutline(query, model);
  } catch (e: any) {
    onProgress({ type: "error", message: `Failed to generate outline: ${e.message}` });
    throw e;
  }

  onProgress({
    type: "scoping",
    message: `[Scoping] Research decomposed into ${outline.dimensions.length} dimensions: ${outline.dimensions.map(d => d.topic).join(", ")}`
  });

  for (const dim of outline.dimensions) {
    onProgress({
      type: "scoping",
      message: `  → ${dim.topic}: ${dim.questions.join("; ")}`
    });
  }

  // ── Phase 2-4: Iterative Research Loop ──────────────────────────────────
  for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
    const depthLabel = `Depth ${currentDepth}/${depth}`;
    onProgress({
      type: "progress",
      message: `Starting ${depthLabel}...`,
      depth: currentDepth,
      maxDepth: depth
    });

    // Phase 2: Generate queries for each dimension
    onProgress({ type: "planning", message: `[Planning] Generating search queries for ${depthLabel}...` });

    const existingFactSummaries = allFacts.map(f => f.fact);
    const queriesPerDimension = await Promise.all(
      outline.dimensions.map(dim =>
        generateQueriesForDimension(dim, existingFactSummaries, Math.max(1, Math.ceil(breadth / outline.dimensions.length)), model)
          .catch(e => {
            onProgress({ type: "status", message: `Query generation failed for "${dim.topic}": ${e.message}` });
            return [] as { query: string; rationale: string }[];
          })
      )
    );

    const allQueryPlans = queriesPerDimension.flat();

    // Add gap-driven follow-up queries from previous depth
    if (allFollowUpQueries.length > 0 && currentDepth > 1) {
      for (const fq of allFollowUpQueries.splice(0, breadth)) {
        allQueryPlans.push({ query: fq, rationale: "Gap-driven follow-up" });
      }
    }

    for (const plan of allQueryPlans) {
      onProgress({ type: "query", query: plan.query, message: `[Planning] Search: "${plan.query}" (${plan.rationale})` });
    }

    // Phase 2: Search & Scrape with throttled parallelism
    const scrapeConcurrency = 2;

    const searchTasks = allQueryPlans.map(plan => async () => {
      try {
        const searchResults = await searchWeb(plan.query, 3);
        return searchResults;
      } catch (e: any) {
        onProgress({ type: "status", message: `Search failed for "${plan.query}": ${e.message}` });
        return [];
      }
    });

    onProgress({ type: "status", message: `[Searching] Running ${allQueryPlans.length} search queries...` });
    const searchResultsBatch = await Promise.all(searchTasks.map(fn => fn()));
    const allSearchResults = searchResultsBatch.flat();

    // Deduplicate URLs and separate cloud-fetched vs needing local scrape
    const urlsWithMeta: { url: string; title: string; rawContent?: string }[] = [];
    for (const r of allSearchResults) {
      if (!visitedUrls.includes(r.url)) {
        visitedUrls.push(r.url);
        urlsWithMeta.push({ url: r.url, title: r.title || r.url, rawContent: r.rawContent });
      }
    }

    const cloudResults = urlsWithMeta.filter(r => !!r.rawContent);
    const localResults = urlsWithMeta.filter(r => !r.rawContent);

    if (cloudResults.length > 0) {
      onProgress({ type: "status", message: `[Tavily Cloud] ${cloudResults.length} results with pre-fetched content (bypassing Playwright)` });
    }
    if (localResults.length > 0) {
      onProgress({ type: "status", message: `[Scraping] ${localResults.length} results need local scraping (concurrency: ${scrapeConcurrency})...` });
    }

    // ── Phase 3a: Summarize cloud-fetched content in parallel ───────────
    const cloudTasks = cloudResults.map(({ url, title, rawContent }) => async () => {
      onProgress({ type: "scrape", url, message: `[Tavily Cloud] Processing: ${url}` });

      try {
        const content = rawContent!;
        const needsSummary = content.length > 12000;

        let processedContent: string;
        if (needsSummary) {
          onProgress({ type: "status", message: `[Summarizing] Condensing large content from ${title} (${content.length} chars)...` });
          processedContent = await summarizeContent(url, title, content, model);
        } else {
          processedContent = content;
        }

        onProgress({ type: "status", message: `[Extracting] Analyzing content from ${title}...` });
        const extracted = await extractFactsFromPage(query, url, title, processedContent, model);

        for (const f of extracted.facts) {
          onProgress({ type: "learning", learning: f.fact, url: f.url, message: `[Extracted] ${f.fact}` });
        }

        allFollowUpQueries.push(...extracted.followUpQueries);
        return extracted.facts;
      } catch (err: any) {
        onProgress({ type: "status", message: `Failed to process cloud content ${url}: ${err.message}` });
        return [] as StructuredFact[];
      }
    });

    // ── Phase 3b: Local scrape for results without pre-fetched content ──
    const localScrapeTasks = localResults.map(({ url, title }) => async () => {
      onProgress({ type: "scrape", url, message: `[Scraping] ${url}` });

      try {
        const content = await scrapeUrl(url);
        if (!content) return [] as StructuredFact[];

        onProgress({ type: "status", message: `[Extracting] Analyzing content from ${title}...` });
        const extracted = await extractFactsFromPage(query, url, title, content, model);

        for (const f of extracted.facts) {
          onProgress({ type: "learning", learning: f.fact, url: f.url, message: `[Extracted] ${f.fact}` });
        }

        allFollowUpQueries.push(...extracted.followUpQueries);
        return extracted.facts;
      } catch (err: any) {
        onProgress({ type: "status", message: `Failed to scrape/analyze ${url}: ${err.message}` });
        return [] as StructuredFact[];
      }
    });

    // Run cloud summaries fully parallel, local scrapes throttled
    const [cloudFactsBatch, localFactsBatch] = await Promise.all([
      cloudTasks.length > 0 ? Promise.all(cloudTasks.map(fn => fn())) : Promise.resolve([] as StructuredFact[][]),
      localScrapeTasks.length > 0 ? throttleActions(localScrapeTasks, scrapeConcurrency) : Promise.resolve([] as StructuredFact[][])
    ]);

    const factsBatch = [...cloudFactsBatch, ...localFactsBatch];
    const newFacts = deduplicateFacts(factsBatch.flat());
    allFacts.push(...newFacts);

    onProgress({
      type: "status",
      message: `[Depth ${currentDepth}] Gathered ${newFacts.length} new facts (total: ${allFacts.length})`
    });

    // Phase 4: Gap analysis (skip on last depth)
    if (currentDepth < depth) {
      onProgress({ type: "gap_checking", message: `[Gap Checking] Analyzing research completeness for ${depthLabel}...` });

      try {
        const gapResult = await checkResearchGaps(outline, allFacts, model);

        if (gapResult.gaps && gapResult.gaps.length > 0) {
          onProgress({
            type: "gap_checking",
            message: `[Gap Checking] Found ${gapResult.gaps.length} gaps: ${gapResult.gaps.slice(0, 3).join("; ")}${gapResult.gaps.length > 3 ? "..." : ""}`
          });

          // Queue follow-up queries for next depth
          if (gapResult.followUpQueries) {
            for (const fq of gapResult.followUpQueries) {
              allFollowUpQueries.push(fq.query);
              onProgress({ type: "gap_checking", message: `[Gap Checking] Follow-up: "${fq.query}" — ${fq.rationale}` });
            }
          }
        } else {
          onProgress({ type: "gap_checking", message: `[Gap Checking] No significant gaps found. Research is comprehensive.` });
        }
      } catch (e: any) {
        onProgress({ type: "status", message: `Gap analysis failed: ${e.message}. Continuing...` });
      }
    }
  }

  return { facts: allFacts, visitedUrls, outline };
}
