import { readdirSync, readFileSync, existsSync, cpSync } from "fs";
import { join } from "path";
import { getAppRoot } from "./app-root";
import { parseFrontmatter, getAgentDir } from "@earendil-works/pi-coding-agent";

export interface DesignSystem {
  id: string;
  name: string;
  category: string;
}

const BUNDLED_DESIGN_MD_DIR = join(getAppRoot(), "design-md");

let _designMdDir: string | null = null;
function getDesignMdDir(): string {
  if (_designMdDir) return _designMdDir;
  try {
    _designMdDir = join(getAgentDir(), "design-md");
  } catch {
    _designMdDir = BUNDLED_DESIGN_MD_DIR;
  }
  return _designMdDir;
}

const CATEGORY_MAP: Record<string, string> = {
  "agentic": "Themed & Unique · 主题与特殊设计",
  "airbnb": "E-commerce & Retail · 电商零售",
  "airtable": "Design & Creative Tools · 设计工具",
  "ant": "Professional & Corporate · 专业与企业",
  "apple": "Media & Consumer Tech · 消费科技",
  "application": "Professional & Corporate · 专业与企业",
  "arc": "Productivity & SaaS · 效率工具",
  "artistic": "Creative & Artistic · 创意与艺术",
  "atelier-zero": "Editorial & Studio · 社论与工作室",
  "bento": "Layout & Structure · 布局与结构",
  "binance": "Fintech & Crypto · 金融科技",
  "bmw": "Automotive · 汽车",
  "bmw-m": "Automotive · 汽车",
  "bold": "Bold & Expressive · 强烈与表现力",
  "brutalism": "Bold & Expressive · 强烈与表现力",
  "bugatti": "Automotive · 汽车",
  "cafe": "Creative & Artistic · 创意与艺术",
  "cal": "Productivity & SaaS · 效率工具",
  "canva": "Design & Creative Tools · 设计工具",
  "cisco": "Backend & DevOps · 后端与运维",
  "claude": "AI & LLM Platforms · AI 与大模型",
  "clay": "Design & Creative Tools · 设计工具",
  "claymorphism": "Morphism & Effects · 拟物与视觉效果",
  "clean": "Modern & Minimal · 现代与极简",
  "clickhouse": "Backend & DevOps · 后端与运维",
  "cohere": "AI & LLM Platforms · AI 与大模型",
  "coinbase": "Fintech & Crypto · 金融科技",
  "colorful": "Bold & Expressive · 强烈与表现力",
  "composio": "Backend & DevOps · 后端与运维",
  "contemporary": "Modern & Minimal · 现代与极简",
  "corporate": "Professional & Corporate · 专业与企业",
  "cosmic": "Creative & Artistic · 创意与艺术",
  "creative": "Creative & Artistic · 创意与艺术",
  "cursor": "Developer Tools & IDEs · 开发工具",
  "dashboard": "Professional & Corporate · 专业与企业",
  "default": "Starter & General · 起步与通用",
  "dell-1996": "Retro & Nostalgic · 复古与怀旧",
  "discord": "Productivity & SaaS · 效率工具",
  "dithered": "Retro & Nostalgic · 复古与怀旧",
  "doodle": "Creative & Artistic · 创意与艺术",
  "dramatic": "Bold & Expressive · 强烈与表现力",
  "duolingo": "Productivity & SaaS · 效率工具",
  "editorial": "Creative & Artistic · 创意与艺术",
  "elegant": "Professional & Corporate · 专业与企业",
  "elevenlabs": "AI & LLM Platforms · AI 与大模型",
  "energetic": "Bold & Expressive · 强烈与表现力",
  "enterprise": "Professional & Corporate · 专业与企业",
  "expo": "Developer Tools & IDEs · 开发工具",
  "expressive": "Bold & Expressive · 强烈与表现力",
  "fantasy": "Creative & Artistic · 创意与艺术",
  "ferrari": "Automotive · 汽车",
  "figma": "Design & Creative Tools · 设计工具",
  "flat": "Modern & Minimal · 现代与极简",
  "framer": "Design & Creative Tools · 设计工具",
  "friendly": "Creative & Artistic · 创意与艺术",
  "futuristic": "Themed & Unique · 主题与特殊设计",
  "github": "Developer Tools & IDEs · 开发工具",
  "glassmorphism": "Morphism & Effects · 拟物与视觉效果",
  "gradient": "Morphism & Effects · 拟物与视觉效果",
  "hashicorp": "Backend & DevOps · 后端与运维",
  "hp": "Media & Consumer Tech · 消费科技",
  "hud": "Themed & Unique · 主题与特殊设计",
  "huggingface": "AI & LLM Platforms · AI 与大模型",
  "ibm": "Media & Consumer Tech · 消费科技",
  "intercom": "Productivity & SaaS · 效率工具",
  "kami": "Editorial & Print · 报刊与排版",
  "kraken": "Fintech & Crypto · 金融科技",
  "lamborghini": "Automotive · 汽车",
  "levels": "Layout & Structure · 布局与结构",
  "linear-app": "Productivity & SaaS · 效率工具",
  "lingo": "Creative & Artistic · 创意与艺术",
  "loom": "Themed & Unique · 主题与特殊设计",
  "lovable": "Developer Tools & IDEs · 开发工具",
  "luxury": "Professional & Corporate · 专业与企业",
  "mastercard": "Fintech & Crypto · 金融科技",
  "material": "Professional & Corporate · 专业与企业",
  "meta": "E-commerce & Retail · 电商零售",
  "minimal": "Modern & Minimal · 现代与极简",
  "minimax": "AI & LLM Platforms · AI 与大模型",
  "mintlify": "Productivity & SaaS · 效率工具",
  "miro": "Design & Creative Tools · 设计工具",
  "mission-control": "Developer Tools & IDEs · 开发工具",
  "mistral-ai": "AI & LLM Platforms · AI 与大模型",
  "modern": "Modern & Minimal · 现代与极简",
  "mongodb": "Backend & DevOps · 后端与运维",
  "mono": "Modern & Minimal · 现代与极简",
  "neobrutalism": "Bold & Expressive · 强烈与表现力",
  "neon": "Morphism & Effects · 拟物与视觉效果",
  "neumorphism": "Morphism & Effects · 拟物与视觉效果",
  "nike": "E-commerce & Retail · 电商零售",
  "nintendo-2001": "Retro & Nostalgic · 复古与怀旧",
  "notion": "Productivity & SaaS · 效率工具",
  "nvidia": "Media & Consumer Tech · 消费科技",
  "ollama": "AI & LLM Platforms · AI 与大模型",
  "openai": "AI & LLM Platforms · AI 与大模型",
  "opencode-ai": "AI & LLM Platforms · AI 与大模型",
  "pacman": "Themed & Unique · 主题与特殊设计",
  "paper": "Retro & Nostalgic · 复古与怀旧",
  "perplexity": "AI & LLM Platforms · AI 与大模型",
  "perspective": "Layout & Structure · 布局与结构",
  "pinterest": "Media & Consumer Tech · 消费科技",
  "playstation": "Media & Consumer Tech · 消费科技",
  "posthog": "Backend & DevOps · 后端与运维",
  "premium": "Professional & Corporate · 专业与企业",
  "professional": "Professional & Corporate · 专业与企业",
  "publication": "Creative & Artistic · 创意与艺术",
  "raycast": "Developer Tools & IDEs · 开发工具",
  "refined": "Modern & Minimal · 现代与极简",
  "renault": "Automotive · 汽车",
  "replicate": "AI & LLM Platforms · AI 与大模型",
  "resend": "Productivity & SaaS · 效率工具",
  "retro": "Retro & Nostalgic · 复古与怀旧",
  "revolut": "Fintech & Crypto · 金融科技",
  "runwayml": "AI & LLM Platforms · AI 与大模型",
  "sanity": "Backend & DevOps · 后端与运维",
  "sentry": "Backend & DevOps · 后端与运维",
  "shadcn": "Modern & Minimal · 现代与极简",
  "shopify": "E-commerce & Retail · 电商零售",
  "simple": "Modern & Minimal · 现代与极简",
  "skeumorphism": "Morphism & Effects · 拟物与视觉效果",
  "slack": "Productivity & SaaS · 效率工具",
  "sleek": "Modern & Minimal · 现代与极简",
  "spacex": "Media & Consumer Tech · 消费科技",
  "spacious": "Layout & Structure · 布局与结构",
  "spotify": "Media & Consumer Tech · 消费科技",
  "starbucks": "E-commerce & Retail · 电商零售",
  "storytelling": "Creative & Artistic · 创意与艺术",
  "stripe": "Fintech & Crypto · 金融科技",
  "supabase": "Backend & DevOps · 后端与运维",
  "superhuman": "Developer Tools & IDEs · 开发工具",
  "tesla": "Automotive · 汽车",
  "tetris": "Themed & Unique · 主题与特殊设计",
  "theverge": "Media & Consumer Tech · 消费科技",
  "together-ai": "AI & LLM Platforms · AI 与大模型",
  "totality-festival": "Themed & Unique · 主题与特殊设计",
  "trading-terminal": "Themed & Unique · 主题与特殊设计",
  "uber": "Media & Consumer Tech · 消费科技",
  "urdu": "Editorial & Personal · 社论与个人",
  "vercel": "Developer Tools & IDEs · 开发工具",
  "vibrant": "Bold & Expressive · 强烈与表现力",
  "vintage": "Retro & Nostalgic · 复古与怀旧",
  "vodafone": "Media & Consumer Tech · 消费科技",
  "voltagent": "AI & LLM Platforms · AI 与大模型",
  "warm-editorial": "Starter & General · 起步与通用",
  "warp": "Developer Tools & IDEs · 开发工具",
  "webex": "Productivity & SaaS · 效率工具",
  "webflow": "Design & Creative Tools · 设计工具",
  "wechat": "Social & Messaging · 社交与即时通讯",
  "wired": "Media & Consumer Tech · 消费科技",
  "wise": "Fintech & Crypto · 金融科技",
  "x-ai": "AI & LLM Platforms · AI 与大模型",
  "xiaohongshu": "Media & Consumer Tech · 消费科技",
  "zapier": "Productivity & SaaS · 效率工具",
};

let cachedSystems: DesignSystem[] | null = null;

function formatName(id: string): string {
  return id
    .split(/[-_.]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function scanDesignSystems(): DesignSystem[] {
  if (cachedSystems) return cachedSystems;

  const agentDir = getDesignMdDir();

  if (!existsSync(agentDir)) {
    if (existsSync(BUNDLED_DESIGN_MD_DIR)) {
      try {
        console.log(`[design-loader] Copying design templates from ${BUNDLED_DESIGN_MD_DIR} to ${agentDir}...`);
        cpSync(BUNDLED_DESIGN_MD_DIR, agentDir, { recursive: true });
        console.log(`[design-loader] Successfully copied design templates.`);
      } catch (e) {
        console.error("[design-loader] Failed to copy design templates:", e);
      }
    }
  }

  const scanDir = existsSync(agentDir) ? agentDir : BUNDLED_DESIGN_MD_DIR;
  if (!existsSync(scanDir)) return [];

  const entries = readdirSync(scanDir, { withFileTypes: true });
  const systems: DesignSystem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const designMdPath = join(scanDir, entry.name, "DESIGN.md");
    if (!existsSync(designMdPath)) continue;

    systems.push({
      id: entry.name,
      name: formatName(entry.name),
      category: CATEGORY_MAP[entry.name] || "Other · 其他",
    });
  }

  cachedSystems = systems.sort((a, b) => a.name.localeCompare(b.name));
  return cachedSystems;
}

export function loadDesignMd(id: string): string | null {
  const agentDir = getDesignMdDir();
  const designMdPath = join(agentDir, id, "DESIGN.md");
  if (existsSync(designMdPath)) return readFileSync(designMdPath, "utf-8");
  const bundledPath = join(BUNDLED_DESIGN_MD_DIR, id, "DESIGN.md");
  if (existsSync(bundledPath)) return readFileSync(bundledPath, "utf-8");
  return null;
}

function extractTokensFromYaml(md: string): KeyTokens {
  let frontmatter: any = {};
  try {
    const parsed = parseFrontmatter<any>(md);
    frontmatter = parsed.frontmatter || {};
  } catch (e) {
    console.error("Failed to parse frontmatter:", e);
    return {};
  }

  const colors: Record<string, string> = {};
  const yamlColors = frontmatter.colors || {};
  const colorKeys = [
    "primary",
    "primary-deep",
    "ink",
    "on-primary",
    "canvas",
    "canvas-soft",
    "canvas-night",
    "canvas-light",
    "hairline",
    "hairline-on-dark",
    "hairline-on-light"
  ];
  for (const key of colorKeys) {
    const val = yamlColors[key];
    if (val && typeof val === "string") {
      colors[key] = val;
    }
  }
  if (!colors.canvas) {
    const val = yamlColors["canvas-night"] || yamlColors["canvas-light"];
    if (val && typeof val === "string") {
      colors.canvas = val;
    }
  }

  const typographyObj = frontmatter.typography || {};
  const typoKeys = Object.keys(typographyObj);
  const displayKey = typoKeys.find(k => k.includes("display-xxl") || k.includes("hero-display") || k.includes("display-xl") || k.includes("display-lg") || k.includes("display-md")) || typoKeys[0];
  const displayConfig = displayKey ? typographyObj[displayKey] : null;

  const displayFont = displayConfig?.fontFamily || typographyObj.fontFamily || "";
  const displayWeight = String(displayConfig?.fontWeight || typographyObj.fontWeight || "");
  const displaySpacing = String(displayConfig?.letterSpacing || typographyObj.letterSpacing || "");

  const bodyKey = typoKeys.find(k => k.includes("body-md") || k.includes("body-lg") || k.trim() === "body") || typoKeys.find(k => k.includes("body"));
  const bodyConfig = bodyKey ? typographyObj[bodyKey] : displayConfig;

  const bodyFont = bodyConfig?.fontFamily || displayFont || "";
  const bodyWeight = String(bodyConfig?.fontWeight || displayWeight || "");

  const roundedObj = frontmatter.rounded || {};
  let pill = String(roundedObj.pill || roundedObj.full || "");
  if (!pill || pill === "undefined") {
    const m = md.match(/rounded:\s*\r?\n[\s\S]*?(?:pill|full):\s*"?(\d+px)"?/);
    if (m) pill = m[1];
  }
  const lg = String(roundedObj.lg || "");
  const sm = String(roundedObj.sm || "");

  const typography: KeyTokens["typography"] = {};
  if (displayFont) typography.displayFont = String(displayFont).replace(/['"]/g, "").split(",")[0].trim();
  if (displayWeight && displayWeight !== "undefined") typography.displayWeight = displayWeight;
  if (displaySpacing && displaySpacing !== "undefined") typography.displaySpacing = displaySpacing;
  if (bodyFont) typography.bodyFont = String(bodyFont).replace(/['"]/g, "").split(",")[0].trim();
  if (bodyWeight && bodyWeight !== "undefined") typography.bodyWeight = bodyWeight;

  const rounded: Record<string, string> = {};
  if (pill && pill !== "undefined") rounded.pill = pill;
  if (lg && lg !== "undefined") rounded.lg = lg;
  if (sm && sm !== "undefined") rounded.sm = sm;

  return {
    colors: Object.keys(colors).length > 0 ? colors : undefined,
    typography: Object.keys(typography).length > 0 ? typography : undefined,
    rounded: Object.keys(rounded).length > 0 ? rounded : undefined,
  };
}

function extractTokensFromMarkdown(md: string): KeyTokens {
  const colors: Record<string, string> = {};

  const colorPatterns = [
    { re: /primary[^#]*#([0-9a-fA-F]{6})/i, key: "primary" },
    { re: /accent[^#]*#([0-9a-fA-F]{6})/i, key: "accent" },
    { re: /(?:background|canvas|bg[^-])[^#]*#([0-9a-fA-F]{6})/i, key: "canvas" },
    { re: /(?:text|ink)[^#]*#([0-9a-fA-F]{6})/i, key: "ink" },
    { re: /border[^#]*#([0-9a-fA-F]{6})/i, key: "hairline" },
  ];
  for (const { re, key } of colorPatterns) {
    const m = md.match(re);
    if (m) colors[key] = `#${m[1]}`;
  }

  let displayFont: string | undefined;
  let displayWeight: string | undefined;
  let displaySpacing: string | undefined;
  let bodyWeight: string | undefined;

  const fontMatch = md.match(/Primary:\s*([A-Z][A-Za-z\s-]+?)(?:\s*,|\s*\n)/i) ||
                    md.match(/font-family:\s*['"]?([A-Z][A-Za-z\s-]+?)[\s,'"]/i) ||
                    md.match(/Font[:\s]+([A-Z][A-Za-z\s-]+?)(?:\s*[,;.\n]|\s*$)/i);
  if (fontMatch) displayFont = fontMatch[1].trim();

  const weightMatch = md.match(/(?:weight|fontWeight)[:\s]*(\d+)/i);
  if (weightMatch) displayWeight = weightMatch[1];

  const spacingMatch = md.match(/letter-spacing[:\s]*(-?[\d.]+)(?:px|em)/i);
  if (spacingMatch) displaySpacing = `${spacingMatch[1]}px`;

  const bodyWeightMatch = md.match(/Body[:\s]*weight[:\s]*(\d+)/i);
  if (bodyWeightMatch) bodyWeight = bodyWeightMatch[1];

  const rounded: Record<string, string> = {};
  const pillMatch = md.match(/(?:pill|9999px|500px)/i);
  if (pillMatch) rounded.pill = "9999px";
  const lgMatch = md.match(/(?:card|feature)[^.]*(?:border-radius|rounded)[:\s]*(\d+)px/i);
  if (lgMatch) rounded.lg = `${lgMatch[1]}px`;
  const smMatch = md.match(/input[^.]*(?:border-radius|rounded)[:\s]*(\d+)px/i);
  if (smMatch) rounded.sm = `${smMatch[1]}px`;

  const typography: KeyTokens["typography"] = {};
  if (displayFont) typography.displayFont = displayFont;
  if (displayWeight) typography.displayWeight = displayWeight;
  if (displaySpacing) typography.displaySpacing = displaySpacing;
  if (bodyWeight) typography.bodyWeight = bodyWeight;

  return {
    colors: Object.keys(colors).length > 0 ? colors : undefined,
    typography: Object.keys(typography).length > 0 ? typography : undefined,
    rounded: Object.keys(rounded).length > 0 ? rounded : undefined,
  };
}

export interface KeyTokens {
  colors?: Record<string, string>;
  typography?: {
    displayFont?: string;
    displayWeight?: string;
    displaySpacing?: string;
    bodyFont?: string;
    bodyWeight?: string;
  };
  rounded?: Record<string, string>;
}

export function extractKeyTokens(designMd: string): string {
  const isYaml = designMd.startsWith("---");
  const tokens = isYaml ? extractTokensFromYaml(designMd) : extractTokensFromMarkdown(designMd);

  const lines: string[] = [];

  if (tokens.colors) {
    const c = tokens.colors;
    const parts: string[] = [];
    if (c.primary) parts.push(`primary: ${c.primary}`);
    if (c.accent && c.accent !== c.primary) parts.push(`accent: ${c.accent}`);
    if (c.ink) parts.push(`ink/text: ${c.ink}`);
    if (c.canvas) parts.push(`canvas/bg: ${c.canvas}`);
    if (c["on-primary"]) parts.push(`on-primary: ${c["on-primary"]}`);
    if (c.hairline) parts.push(`hairline/border: ${c.hairline}`);
    if (parts.length > 0) lines.push(`COLORS: ${parts.join(" | ")}`);
  }

  if (tokens.typography) {
    const t = tokens.typography;
    const parts: string[] = [];
    if (t.displayFont) parts.push(`font: ${t.displayFont}`);
    if (t.displayWeight) parts.push(`display weight: ${t.displayWeight}`);
    if (t.displaySpacing) parts.push(`letter-spacing: ${t.displaySpacing}`);
    if (t.bodyWeight && t.bodyWeight !== t.displayWeight) parts.push(`body weight: ${t.bodyWeight}`);
    if (parts.length > 0) lines.push(`TYPOGRAPHY: ${parts.join(" | ")}`);
  }

  if (tokens.rounded) {
    const r = tokens.rounded;
    const parts: string[] = [];
    if (r.pill) parts.push(`buttons: ${r.pill}`);
    if (r.lg) parts.push(`cards: ${r.lg}`);
    if (r.sm) parts.push(`inputs: ${r.sm}`);
    if (parts.length > 0) lines.push(`SHAPES: ${parts.join(" | ")}`);
  }

  if (lines.length === 0) return "";

  return `## MANDATORY DESIGN TOKENS — USE EXACT VALUES, NO SUBSTITUTIONS\n${lines.join("\n")}\nCRITICAL: These are the ONLY correct values. Do NOT use Tailwind, Bootstrap, or any other framework defaults.`;
}

export function extractRawTokens(designMd: string): KeyTokens {
  const isYaml = designMd.startsWith("---");
  return isYaml ? extractTokensFromYaml(designMd) : extractTokensFromMarkdown(designMd);
}
