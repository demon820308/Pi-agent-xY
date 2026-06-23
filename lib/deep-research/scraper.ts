import { getApiKeyForProvider } from "./credentials";
import { chromium } from "playwright";

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
  rawContent?: string;
}

// ── Search Orchestrator ──────────────────────────────────────────────────────

export async function searchWeb(query: string, limit = 5): Promise<SearchResult[]> {
  // 1. Try Tavily first
  const tavilyKey = await getApiKeyForProvider("tavily");
  if (tavilyKey) {
    try {
      console.log(`[scraper] Using Tavily Search for query: "${query}"`);
      const results = await searchTavily(query, tavilyKey, limit);
      if (results.length > 0) return results;
    } catch (e) {
      console.error("[scraper] Tavily search error, trying next provider:", e);
    }
  }

  // 2. Try Firecrawl Search
  const firecrawlKey = await getApiKeyForProvider("firecrawl");
  if (firecrawlKey) {
    try {
      console.log(`[scraper] Using Firecrawl Search for query: "${query}"`);
      const results = await searchFirecrawl(query, firecrawlKey, limit);
      if (results.length > 0) return results;
    } catch (e) {
      console.error("[scraper] Firecrawl search error, trying next provider:", e);
    }
  }

  // 3. Fallback: DuckDuckGo HTML scrape search
  try {
    console.log(`[scraper] Using DuckDuckGo Fallback Search for query: "${query}"`);
    return await searchDuckDuckGo(query, limit);
  } catch (e) {
    console.error("[scraper] DuckDuckGo search fallback failed:", e);
    return [];
  }
}

// ── Scrape Orchestrator ──────────────────────────────────────────────────────

export async function scrapeUrl(url: string): Promise<string> {
  // 1. Try Firecrawl API first if key is present
  const firecrawlKey = await getApiKeyForProvider("firecrawl");
  if (firecrawlKey) {
    try {
      console.log(`[scraper] Using Firecrawl Scraper for url: "${url}"`);
      const content = await scrapeFirecrawl(url, firecrawlKey);
      if (content) return content;
    } catch (e) {
      console.error("[scraper] Firecrawl scrape error, falling back to local scraper:", e);
    }
  }

  // 2. Fallback to Local Playwright Scraper
  try {
    console.log(`[scraper] Using Playwright Local Scraper for url: "${url}"`);
    return await scrapeWithPlaywright(url);
  } catch (e) {
    console.error("[scraper] Playwright local scrape failed, trying fetch fallback:", e);
    try {
      return await scrapeWithFetch(url);
    } catch (err) {
      console.error("[scraper] Fetch scrape fallback failed:", err);
      return "";
    }
  }
}

// ── Search Providers Implementation ──────────────────────────────────────────

async function searchTavily(query: string, apiKey: string, limit: number): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: limit,
      include_raw_content: true
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`Tavily API returned ${res.status}`);
  const data = await res.json() as { results?: { url: string; title: string; content?: string; raw_content?: string }[] };
  return (data.results || []).map(r => {
    const hasRaw = !!(r.raw_content && r.raw_content.trim().length > 200);
    if (hasRaw) {
      console.log(`[scraper] [Tavily Cloud] Retrieved raw content for ${r.url} (${r.raw_content!.length} chars, bypassing Playwright)`);
    }
    return {
      url: r.url,
      title: r.title,
      snippet: r.content,
      rawContent: hasRaw ? r.raw_content : undefined
    };
  });
}

async function searchFirecrawl(query: string, apiKey: string, limit: number): Promise<SearchResult[]> {
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      limit
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Firecrawl Search API returned ${res.status}`);
  const data = await res.json() as { data?: { url: string; title?: string; description?: string }[] };
  return (data.data || []).map(r => ({
    url: r.url,
    title: r.title || r.url,
    snippet: r.description
  }));
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`DDG HTML search returned ${res.status}`);
  const html = await res.text();
  const results: SearchResult[] = [];
  
  const resultBlocks = html.split('class="result results_links');
  for (const block of resultBlocks.slice(1)) {
    const aMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    
    if (aMatch) {
      let rawUrl = aMatch[1];
      const title = aMatch[2].replace(/<[^>]*>/g, "").trim();
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, "").trim() : "";
      
      if (rawUrl.includes("uddg=")) {
        try {
          const u = new URL("https:" + rawUrl);
          rawUrl = decodeURIComponent(u.searchParams.get("uddg") || rawUrl);
        } catch {
          // fallback
        }
      } else if (rawUrl.startsWith("//")) {
        rawUrl = "https:" + rawUrl;
      }
      
      results.push({ url: rawUrl, title, snippet });
      if (results.length >= limit) break;
    }
  }
  return results;
}

// ── Scraper Providers Implementation ─────────────────────────────────────────

async function scrapeFirecrawl(url: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"]
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`Firecrawl Scrape API returned ${res.status}`);
  const data = await res.json() as { success: boolean; data?: { markdown?: string } };
  return data.data?.markdown || "";
}

async function scrapeWithPlaywright(url: string): Promise<string> {
  // Launch Playwright Headless Chromium
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    
    // Set 15s page load timeout
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    
    // Extract text after pruning noise
    const textContent = await page.evaluate(() => {
      // Remove boilerplate elements
      const selector = "script, style, head, nav, footer, iframe, header, .ads, #ads, .menu, .navigation";
      document.querySelectorAll(selector).forEach(el => el.remove());
      return document.body.innerText || document.body.textContent || "";
    });
    
    return textContent.replace(/\s+/g, " ").trim();
  } finally {
    await browser.close();
  }
}

async function scrapeWithFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Scrape fetch returned HTTP ${res.status}`);
  const html = await res.text();
  
  // Basic regex to strip tags and script blocks
  let clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]*>/g, " ");
    
  // Unescape HTML entities
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
    
  return clean.replace(/\s+/g, " ").trim();
}
