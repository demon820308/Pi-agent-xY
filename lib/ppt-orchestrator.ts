import { spawn } from "child_process";
import { EventEmitter } from "events";
import { isAbsolute, join, resolve } from "path";
import { existsSync, writeFileSync, mkdirSync, readdirSync, readFileSync, appendFileSync, unlinkSync } from "fs";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { resolveSessionPath } from "./session-reader";
import { callLLM } from "./llm-caller";

const PPT_ORCHESTRATOR_VERSION = 7;

export interface PptProgress {
  sessionId: string;
  step: "idle" | "extracting" | "init" | "confirming" | "waiting_design" | "finalizing" | "exporting" | "completed" | "error";
  percent: number;
  logs: string[];
  pptxPath?: string;
  error?: string;
  projectPath?: string;
  confirmUrl?: string;
  cwd?: string;
}

class PptOrchestrator extends EventEmitter {
  private sessions = new Map<string, PptProgress>();
  private readonly appRoot = process.cwd();
  private readonly scriptsRoot = join(this.appRoot, "ppt-master-main", "skills", "ppt-master", "scripts");

  constructor() {
    super();
    this.loadSessionsFromCache();
  }

  private getCachePath(): string {
    try {
      return join(getAgentDir(), "ppt-sessions-cache.json");
    } catch {
      return join(process.env.USERPROFILE || process.env.HOMEPATH || "", ".pi", "agent", "ppt-sessions-cache.json");
    }
  }

  private loadSessionsFromCache() {
    const cachePath = this.getCachePath();
    if (existsSync(cachePath)) {
      try {
        const data = JSON.parse(readFileSync(cachePath, "utf-8"));
        if (data && typeof data === "object") {
          for (const [id, session] of Object.entries(data)) {
            this.sessions.set(id, session as PptProgress);
          }
        }
      } catch (e) {
        console.error("Failed to load PPT sessions cache:", e);
      }
    }
  }

  private saveSessionsToCache() {
    const cachePath = this.getCachePath();
    try {
      const data = Object.fromEntries(this.sessions.entries());
      writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save PPT sessions cache:", e);
    }
  }

  public override emit(event: string | symbol, ...args: any[]): boolean {
    const res = super.emit(event, ...args);
    if (typeof event === "string" && (event.startsWith("update:") || event.startsWith("log:"))) {
      this.saveSessionsToCache();
    }
    return res;
  }

  public getSession(id: string): PptProgress | undefined {
    return this.sessions.get(id);
  }

  public async startSession(
    sessionId: string,
    cwd: string,
    sourceFile: string,
    projectPath: string,
    projectName: string
  ): Promise<void> {
    const session: PptProgress = {
      sessionId,
      step: "idle",
      percent: 0,
      logs: [],
      cwd,
    };
    this.sessions.set(sessionId, session);
    this.saveSessionsToCache();
    this.emit(`update:${sessionId}`, session);

    try {
      const sourcePath = this.resolveSourcePath(cwd, sourceFile);

      await this.runStep(session, "init", 30, "python", [
        join(this.scriptsRoot, "project_manager.py"),
        "init",
        projectName
      ], cwd);

      await this.runStep(session, "extracting", 40, "python", [
        join(this.scriptsRoot, "project_manager.py"),
        "import-sources",
        projectPath,
        sourcePath,
        "--copy"
      ], cwd);

      // Write recommendations before running Confirm UI
      const confirmDir = join(projectPath, "confirm_ui");
      if (!existsSync(confirmDir)) {
        mkdirSync(confirmDir, { recursive: true });
      }
      const recPath = join(confirmDir, "recommendations.json");
      const defaultRecommendations = {
        lang: "zh",
        recommend: {
          canvas: "ppt169",
          mode: "pyramid",
          visual_style: "swiss-minimal",
          icons: "tabler-outline",
          image_usage: "web",
          formula_policy: "mixed",
          generation_mode: "continuous"
        },
        page_count: { value: "8-12" },
        audience: { value: "通用商业汇报" },
        color: {
          selected: 0,
          candidates: [
            {
              name: "商务经典蓝",
              note: "稳重大气的商务蓝色系",
              palette: {
                background: "#FFFFFF",
                secondary_bg: "#F4F6F8",
                primary: "#1A3A6B",
                accent: "#E8A317",
                secondary_accent: "#4A7BB5",
                body_text: "#1D2430"
              }
            }
          ]
        },
        typography: {
          selected: 0,
          candidates: [
            {
              name: "现代无衬线",
              note: "易读、现代的系统无衬线字体组合",
              heading: { cjk: "微软雅黑", latin: "Arial", css: "'Microsoft YaHei',Arial,sans-serif", sample_cjk: "现代标题", sample_latin: "Modern Heading" },
              body: { cjk: "微软雅黑", latin: "Arial", css: "'Microsoft YaHei',Arial,sans-serif", sample_cjk: "正文易读性高", sample_latin: "Body readability is high" },
              body_size: 18
            }
          ]
        },
        image_strategy: {
          selected: 0,
          candidates: [
            {
              name: "方案 A",
              rendering: "vector-illustration",
              palette: "cool-corporate",
              visual: "扁平矢量、实色块、少阴影",
              color: "背景 60-70% + 主色 25-30% + 强调色少量点题",
              mood: "稳定、可信、克制"
            }
          ]
        },
        refine_spec: { value: false }
      };

      // Try to dynamically generate custom style recommendations using LLM
      let outlineContent = "";
      try {
        const sourcesDir = join(projectPath, "sources");
        if (existsSync(sourcesDir)) {
          const files = readdirSync(sourcesDir);
          const mdFile = files.find(f => f.toLowerCase().endsWith(".md") || f.toLowerCase().endsWith(".markdown"));
          if (mdFile) {
            const mdPath = join(sourcesDir, mdFile);
            outlineContent = readFileSync(mdPath, "utf-8").slice(0, 40000);
            const mdLog = `[System] Successfully read outline content from ${mdFile} (${outlineContent.length} chars) for dynamic styling analysis.`;
            session.logs.push(mdLog);
            this.emit(`log:${sessionId}`, mdLog);
          }
        }
      } catch (readErr) {
        console.error("Failed to read outline file:", readErr);
      }

      let generated = false;
      if (outlineContent.trim()) {
        const systemPrompt = `You are an expert presentation designer. Your task is to analyze the provided presentation outline (Markdown format) and recommend styling options (color palette, typography, visual style, design objective) tailored to the specific topic, tone, and audience of the outline.

Respond with a single valid JSON object following this exact structure:
{
  "lang": "zh",
  "recommend": {
    "canvas": "ppt169",
    "mode": "pyramid" | "narrative" | "instructional" | "showcase" | "briefing",
    "visual_style": "swiss-minimal" | "soft-rounded" | "glassmorphism" | "dark-tech" | "blueprint" | "editorial" | "photo-editorial" | "data-journalism" | "brutalist" | "memphis" | "zine" | "vintage-poster" | "paper-cut" | "sketch-notes" | "ink-notes" | "chalkboard" | "ink-wash" | "pixel-art",
    "icons": "chunk-filled" | "tabler-filled" | "tabler-outline" | "phosphor-duotone" | "emoji" | "none",
    "image_usage": "ai" | "web" | "provided" | "placeholder" | "none",
    "formula_policy": "mixed",
    "generation_mode": "continuous"
  },
  "page_count": { "value": "8-12" }, // Estimated page count based on outline structure, e.g. "5-8" or "8-12" or "12-16"
  "audience": { "value": "A short phrase describing the target audience (e.g. 投资者, 技术专家, 大众消费者)" },
  "color": {
    "selected": 0,
    "candidates": [
      {
        "name": "Creative name for the palette (in Chinese)",
        "note": "Description of why this palette fits the topic (in Chinese)",
        "palette": {
          "background": "HEX color (e.g. #FFFFFF)",
          "secondary_bg": "HEX color for secondary elements/cards (e.g. #F4F6F8)",
          "primary": "HEX color for primary headers/elements",
          "accent": "HEX color for highlighting key points",
          "secondary_accent": "HEX color for secondary accents/highlights",
          "body_text": "HEX color for body text (must have good contrast with background)"
        }
      },
      ... generate exactly 3 diverse color candidates tailored to the topic (e.g. one primary theme, one dark tech theme if appropriate, and one warm/editorial/creative theme)
    ]
  },
  "typography": {
    "selected": 0,
    "candidates": [
      {
        "name": "Creative name for typography combo (in Chinese)",
        "note": "Description of why this typography fits (in Chinese)",
        "heading": {
          "cjk": "Chinese Font Name (e.g. 微软雅黑, 思源宋体, 黑体, 楷体)",
          "latin": "Latin Font Name (e.g. Arial, Georgia, Helvetica, Impact, Times New Roman)",
          "css": "CSS font-family value, e.g. '\\'Microsoft YaHei\\',Arial,sans-serif' or '\\'Source Han Serif CN\\',Georgia,serif'",
          "sample_cjk": "Sample text in Chinese, e.g. 现代标题",
          "sample_latin": "Sample text in Latin, e.g. Modern Heading"
        },
        "body": {
          "cjk": "Chinese Font Name",
          "latin": "Latin Font Name",
          "css": "CSS font-family value",
          "sample_cjk": "Sample body text in Chinese",
          "sample_latin": "Sample body text in Latin"
        },
        "body_size": 18
      },
      ... generate exactly 3 typography candidates
    ]
  },
  "image_strategy": {
    "selected": 0,
    "candidates": [
      {
        "name": "Creative name for strategy (in Chinese, e.g. 方案 A：科技感摄影/方案 B：扁平矢量)",
        "rendering": "vector-illustration" | "photography" | "line-art" | "3d-render" | "sketch" | "pixel-art" | "minimal-shapes",
        "palette": "Description of image palette, e.g. cool-corporate, warm-editorial, vibrant, muted",
        "visual": "Short description of visual details, e.g. 扁平矢量、实色块、少阴影",
        "color": "Color distribution rule, e.g. 背景 60-70% + 主色 25-30% + 强调色少量点题",
        "mood": "Short mood keywords, e.g. 稳定、可信、克制"
      },
      ... generate exactly 3 image strategy candidates
    ]
  },
  "refine_spec": { "value": false }
}

Your output must be a single valid JSON object matching this schema. Do not output any markdown code blocks or any conversational text. Return only the raw JSON.`;

        try {
          const llmStartLog = `[System] Calling LLM to analyze document outline and generate customized style recommendations...`;
          session.logs.push(llmStartLog);
          this.emit(`log:${sessionId}`, llmStartLog);
          this.emit(`update:${sessionId}`, session);

          const responseText = await callLLM(systemPrompt, outlineContent, true);
          
          // Robust JSON parsing
          let cleanText = responseText.trim();
          if (cleanText.startsWith("```")) {
            const lines = cleanText.split("\n");
            let startIndex = 1;
            if (lines[0].toLowerCase().includes("json")) {
              startIndex = 1;
            }
            let endIndex = lines.length - 1;
            while (endIndex > startIndex && !lines[endIndex].trim().startsWith("```")) {
              endIndex--;
            }
            cleanText = lines.slice(startIndex, endIndex).join("\n");
          }
          const firstBrace = cleanText.indexOf("{");
          const lastBrace = cleanText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
          }

          const customRec = JSON.parse(cleanText);
          
          // Basic validation of fields to avoid crashing frontend
          if (customRec && typeof customRec === "object" && customRec.recommend && customRec.color && customRec.typography) {
            writeFileSync(recPath, JSON.stringify(customRec, null, 2), "utf-8");
            generated = true;
            const successLog = `[System] Dynamic style recommendations generated successfully based on outline topic.`;
            session.logs.push(successLog);
            this.emit(`log:${sessionId}`, successLog);
          } else {
            throw new Error("Parsed JSON did not match expected structure");
          }
        } catch (llmErr) {
          console.error("LLM dynamic recommendation generation failed:", llmErr);
          const errorLog = `[System] Warning: Dynamic style recommendation generation failed: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}. Falling back to default styling options.`;
          session.logs.push(errorLog);
          this.emit(`log:${sessionId}`, errorLog);
        }
      }

      if (!generated) {
        writeFileSync(recPath, JSON.stringify(defaultRecommendations, null, 2), "utf-8");
      }

      // Step 3: Confirm UI — now served natively by Next.js
      session.step = "confirming";
      session.percent = 50;
      session.projectPath = projectPath;
      session.confirmUrl = "/confirm_ui/index.html?sessionId=" + sessionId;
      const confirmingLog = `[System] Confirm UI ready at ${session.confirmUrl}. Please confirm the design spec.`;
      session.logs.push(confirmingLog);
      this.emit(`log:${sessionId}`, confirmingLog);
      this.emit(`update:${sessionId}`, session);

      // Start periodic check for result.json in the background
      const resultPath = join(projectPath, "confirm_ui", "result.json");
      const intervalId = setInterval(() => {
        const currentSession = this.sessions.get(sessionId);
        if (!currentSession || currentSession.step === "error" || currentSession.step === "completed") {
          clearInterval(intervalId);
          return;
        }

        if (existsSync(resultPath)) {
          clearInterval(intervalId);
          try {
            this.generateBasicSvgDeck(currentSession, projectPath, sourcePath);
          } catch (err: any) {
            currentSession.step = "error";
            currentSession.error = `Failed to generate basic SVG deck: ${err.message || String(err)}`;
            this.emit(`update:${sessionId}`, currentSession);
          }
        }
      }, 1000);
    } catch (err: any) {
      session.step = "error";
      session.error = err.message || String(err);
      this.emit(`update:${sessionId}`, session);
    }
  }

  public async compileSession(sessionId: string, cwd: string, projectPath: string, agentSessionId?: string | null): Promise<void> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        step: "idle",
        percent: 60,
        logs: [],
        projectPath,
      };
      this.sessions.set(sessionId, session);
    }

    try {
      // Clean up orphaned SVGs that do not exist in notes/total.md
      this.cleanupOrphanedSvgs(projectPath);

      // Check if svg_output exists and contains at least one SVG file
      const svgDir = join(projectPath, "svg_output");
      const hasSvgs = existsSync(svgDir) && readdirSync(svgDir).some(f => f.toLowerCase().endsWith(".svg"));
      if (!hasSvgs) {
        throw new Error("No SVG files found in svg_output. Please generate slide layout designs before compiling.");
      }

      // Step 4: Split notes and finalize SVGs.
      await this.runStep(session, "finalizing", 76, "python", [
        join(this.scriptsRoot, "total_md_split.py"),
        projectPath
      ], cwd);

      await this.runStep(session, "finalizing", 84, "python", [
        join(this.scriptsRoot, "finalize_svg.py"),
        projectPath
      ], cwd);

      // Step 5: Export PPTX
      await this.runStep(session, "exporting", 94, "python", [
        join(this.scriptsRoot, "svg_to_pptx.py"),
        projectPath
      ], cwd);

      const exportsDir = join(projectPath, "exports");
      let pptxFilePath = exportsDir;
      if (existsSync(exportsDir)) {
        const files = readdirSync(exportsDir);
        const pptxFile = files.find(f => f.toLowerCase().endsWith(".pptx"));
        if (pptxFile) {
          pptxFilePath = join(exportsDir, pptxFile);
        }
      }
      session.step = "completed";
      session.percent = 100;
      session.pptxPath = pptxFilePath;
      this.emit(`update:${sessionId}`, session);

      if (agentSessionId) {
        await this.injectCompletionMessage(agentSessionId, pptxFilePath);
      }
    } catch (err: any) {
      session.step = "error";
      session.error = err.message || String(err);
      this.emit(`update:${sessionId}`, session);
    }
  }

  private async injectCompletionMessage(agentSessionId: string, pptxPath: string): Promise<void> {
    try {
      const filePath = await resolveSessionPath(agentSessionId);
      if (!filePath) return;

      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n");
      let lastEntryId: string | null = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.id) {
            lastEntryId = entry.id;
            break;
          }
        } catch {
          // ignore
        }
      }

      const fileName = pptxPath.split(/[/\\]/).pop() || "generated.pptx";
      const newId = Math.random().toString(36).substring(2, 10);

      const messageEntry = {
        type: "message",
        id: newId,
        parentId: lastEntryId,
        timestamp: new Date().toISOString(),
        message: {
          role: "assistant",
          model: "system",
          provider: "system",
          content: [
            {
              type: "text",
              text: `🎉 **PPT 自动生成完成！**\n\n- **文件名**：[${fileName}](file:///${pptxPath.replace(/\\/g, "/")})`
            }
          ]
        }
      };

      const appendStr = "\n" + JSON.stringify(messageEntry) + "\n";
      appendFileSync(filePath, appendStr, "utf-8");
    } catch (err) {
      console.error("Failed to inject completion message to session file:", err);
    }
  }

  private resolveSourcePath(cwd: string, sourceFile: string): string {
    if (sourceFile.startsWith("http://") || sourceFile.startsWith("https://")) {
      return sourceFile;
    }
    return isAbsolute(sourceFile) ? sourceFile : resolve(cwd, sourceFile);
  }

  private getLocalDateStamp(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
  }

  private generateBasicSvgDeck(session: PptProgress, projectPath: string, sourcePath: string): void {
    session.step = "waiting_design";
    session.percent = 68;
    const startLog = "[System] Generating editable SVG draft pages from outline and design spec...";
    session.logs.push(startLog);
    this.emit(`log:${session.sessionId}`, startLog);
    this.emit(`update:${session.sessionId}`, session);

    const markdown = readFileSync(sourcePath, "utf-8");
    const slides = this.parseMarkdownSlides(markdown).slice(0, 14);
    if (slides.length === 0) {
      slides.push({
        title: "PPT 自动生成",
        bullets: ["未能从源文件中提取到明确大纲。"],
      });
    }

    // Load custom choices from result.json if available
    const resultPath = join(projectPath, "confirm_ui", "result.json");
    const designSpec = {
      canvas: "ppt169",
      mode: "pyramid",
      visual_style: "swiss-minimal",
      icons: "tabler-outline",
      colors: {
        background: "#FFFFFF",
        secondary_bg: "#F4F6F8",
        primary: "#1A3A6B",
        accent: "#E8A317",
        text: "#1D2430"
      },
      typography: {
        font_family: "Microsoft YaHei, Arial, sans-serif",
        title_size: "46",
        body: "24"
      }
    };

    if (existsSync(resultPath)) {
      try {
        const result = JSON.parse(readFileSync(resultPath, "utf-8"));
        if (result && typeof result === "object") {
          if (result.canvas) designSpec.canvas = result.canvas;
          if (result.mode) designSpec.mode = result.mode;
          if (result.visual_style) designSpec.visual_style = result.visual_style;
          if (result.icons) designSpec.icons = result.icons;
          if (result.color && result.color.palette) {
            const pal = result.color.palette;
            designSpec.colors.background = pal.background || designSpec.colors.background;
            designSpec.colors.secondary_bg = pal.secondary_bg || designSpec.colors.secondary_bg;
            designSpec.colors.primary = pal.primary || designSpec.colors.primary;
            designSpec.colors.accent = pal.accent || designSpec.colors.accent;
            designSpec.colors.text = pal.body_text || pal.text || designSpec.colors.text;
          }
          if (result.typography) {
            const fontCss = result.typography.body?.css || result.typography.heading?.css || "";
            if (fontCss) {
              designSpec.typography.font_family = fontCss.replace(/'/g, "");
            }
            if (result.typography.body_size) {
              designSpec.typography.body = String(result.typography.body_size);
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse result.json:", e);
      }
    }

    const svgDir = join(projectPath, "svg_output");
    const notesDir = join(projectPath, "notes");
    mkdirSync(svgDir, { recursive: true });
    mkdirSync(notesDir, { recursive: true });

    const deckTitle = slides[0]?.title || "PPT 自动生成";
    writeFileSync(join(projectPath, "design_spec.md"), this.buildDesignSpec(deckTitle, slides, designSpec), "utf-8");
    writeFileSync(join(projectPath, "spec_lock.md"), this.buildSpecLock(slides, designSpec), "utf-8");

    const noteSections: string[] = [];
    slides.forEach((slide, index) => {
      const fileBase = `${String(index + 1).padStart(2, "0")}_${this.slugify(slide.title || `slide_${index + 1}`)}`;
      writeFileSync(join(svgDir, `${fileBase}.svg`), this.renderSlideSvg(slide, index, slides.length, designSpec), "utf-8");
      noteSections.push(`# ${index + 1}. ${slide.title}\n\n${slide.bullets.map((item) => `- ${item}`).join("\n") || "- 本页用于承接汇报叙事。"}`);
    });
    writeFileSync(join(notesDir, "total.md"), noteSections.join("\n\n---\n\n"), "utf-8");

    const doneLog = `[System] Generated ${slides.length} SVG draft page(s) in ${svgDir} with locked style parameters.`;
    session.logs.push(doneLog);
    this.emit(`log:${session.sessionId}`, doneLog);
    this.emit(`update:${session.sessionId}`, session);
  }

  private parseMarkdownSlides(markdown: string): Array<{ title: string; bullets: string[] }> {
    const lines = markdown.split(/\r?\n/);
    const slides: Array<{ title: string; bullets: string[] }> = [];
    let current: { title: string; bullets: string[] } | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
        if (current) slides.push(current);
        current = { title: heading[2].replace(/[#*_`]/g, "").trim(), bullets: [] };
        continue;
      }

      const bullet = /^[-*+]\s+(.+)$/.exec(line) || /^\d+[.)]\s+(.+)$/.exec(line);
      if (bullet) {
        if (!current) current = { title: "核心要点", bullets: [] };
        current.bullets.push(this.cleanMarkdownText(bullet[1]));
        continue;
      }

      if (current && current.bullets.length < 5 && line.length > 12 && !line.startsWith("|")) {
        current.bullets.push(this.cleanMarkdownText(line));
      }
    }

    if (current) slides.push(current);
    return slides
      .map((slide) => ({
        title: slide.title || "未命名页面",
        bullets: slide.bullets.filter(Boolean).slice(0, 5),
      }))
      .filter((slide) => slide.title || slide.bullets.length > 0);
  }

  private cleanMarkdownText(text: string): string {
    return text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private buildDesignSpec(deckTitle: string, slides: Array<{ title: string; bullets: string[] }>, spec: any): string {
    return [
      "# Design Specification",
      "",
      "## I. Project",
      `Title: ${deckTitle}`,
      `Canvas: ${spec.canvas} (1280x720)`,
      `Mode: ${spec.mode}`,
      `Visual Style: ${spec.visual_style}`,
      "",
      "## II. Colors",
      `Background: ${spec.colors.background}`,
      `Primary: ${spec.colors.primary}`,
      `Accent: ${spec.colors.accent}`,
      `Text: ${spec.colors.text}`,
      "",
      "## III. Typography",
      `Font family: ${spec.typography.font_family}`,
      `Body size: ${spec.typography.body}`,
      "",
      "## IX. Page Roster",
      ...slides.map((slide, index) => {
        const bullets = slide.bullets.map((item) => `  - ${item}`).join("\n");
        return `P${String(index + 1).padStart(2, "0")}: ${slide.title}\n${bullets}`;
      }),
      "",
    ].join("\n");
  }

  private buildSpecLock(slides: Array<{ title: string; bullets: string[] }>, spec: any): string {
    return [
      "# Spec Lock",
      "",
      "canvas:",
      `  format: ${spec.canvas}`,
      "  width: 1280",
      "  height: 720",
      `mode: ${spec.mode}`,
      `visual_style: ${spec.visual_style}`,
      "colors:",
      `  background: '${spec.colors.background}'`,
      `  secondary_bg: '${spec.colors.secondary_bg}'`,
      `  primary: '${spec.colors.primary}'`,
      `  accent: '${spec.colors.accent}'`,
      `  text: '${spec.colors.text}'`,
      "typography:",
      `  font_family: ${spec.typography.font_family}`,
      "  title_size: 46",
      `  body: ${spec.typography.body}`,
      "icons:",
      `  library: ${spec.icons}`,
      "page_rhythm:",
      ...slides.map((_, index) => `  P${String(index + 1).padStart(2, "0")}: ${index === 0 ? "anchor" : "dense"}`),
      "page_layouts: {}",
      "page_charts: {}",
      "images: []",
      "",
    ].join("\n");
  }

  private renderSlideSvg(slide: { title: string; bullets: string[] }, index: number, total: number, spec: any): string {
    const titleLines = this.wrapText(slide.title, 22).slice(0, 2);
    const bullets = slide.bullets.length > 0 ? slide.bullets : ["本页内容来自自动解析的大纲，可在 PPT 中继续编辑。"];
    const bulletBlocks = bullets.slice(0, 5).map((bullet, bulletIndex) => {
      const y = 238 + bulletIndex * 74;
      const lines = this.wrapText(bullet, 32).slice(0, 2);
      const tspans = lines.map((line, lineIndex) => {
        const dy = lineIndex === 0 ? 0 : 30;
        return `<tspan x="174" dy="${dy}">${this.escapeXml(line)}</tspan>`;
      }).join("");
      return [
        `<g id="point-${bulletIndex + 1}">`,
        `<circle cx="120" cy="${y - 8}" r="15" fill="${spec.colors.accent}"/>`,
        `<text x="120" y="${y - 2}" text-anchor="middle" font-family="${spec.typography.font_family}" font-size="16" font-weight="bold" fill="${spec.colors.background}">${bulletIndex + 1}</text>`,
        `<text x="174" y="${y}" font-family="${spec.typography.font_family}" font-size="24" fill="${spec.colors.text}">${tspans}</text>`,
        `</g>`,
      ].join("\n");
    }).join("\n");

    const titleTspans = titleLines.map((line, lineIndex) => {
      const dy = lineIndex === 0 ? 0 : 54;
      return `<tspan x="84" dy="${dy}">${this.escapeXml(line)}</tspan>`;
    }).join("");

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">`,
      `<g id="background">`,
      `<rect x="0" y="0" width="1280" height="720" fill="${spec.colors.background}"/>`,
      `<rect x="0" y="0" width="34" height="720" fill="${spec.colors.primary}"/>`,
      `<rect x="34" y="0" width="6" height="720" fill="${spec.colors.accent}"/>`,
      `<circle cx="1120" cy="112" r="86" fill="${spec.colors.secondary_bg}"/>`,
      `<circle cx="1194" cy="188" r="46" fill="${spec.colors.accent}" fill-opacity="0.18"/>`,
      `</g>`,
      `<g id="header">`,
      `<text x="84" y="110" font-family="${spec.typography.font_family}" font-size="${index === 0 ? 52 : 44}" font-weight="bold" fill="${spec.colors.primary}">${titleTspans}</text>`,
      `<line x1="84" y1="176" x2="420" y2="176" stroke="${spec.colors.accent}" stroke-width="6"/>`,
      `</g>`,
      `<g id="content">`,
      bulletBlocks,
      `</g>`,
      `<g id="footer">`,
      `<text x="84" y="668" font-family="Arial, Microsoft YaHei, sans-serif" font-size="16" fill="#7A8699">PPT Master draft</text>`,
      `<text x="1196" y="668" text-anchor="end" font-family="Arial, Microsoft YaHei, sans-serif" font-size="16" fill="#7A8699">${index + 1} / ${total}</text>`,
      `</g>`,
      `</svg>`,
      "",
    ].join("\n");
  }

  private wrapText(text: string, maxChars: number): string[] {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxChars) return [normalized];
    const lines: string[] = [];
    let buffer = "";
    for (const char of normalized) {
      buffer += char;
      if (buffer.length >= maxChars) {
        lines.push(buffer);
        buffer = "";
      }
    }
    if (buffer) lines.push(buffer);
    return lines;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private slugify(value: string): string {
    const ascii = value
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 40)
      .toLowerCase();
    return ascii || "slide";
  }

  private normalizeTitle(title: string): string {
    if (!title) return "";
    let text = title.trim();
    // Replace any non-alnum / non-CJK run with underscore
    text = text.replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, "_");
    text = text.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    return text.toLowerCase();
  }

  private extractLeadingNumber(text: string): number | null {
    if (!text) return null;
    const clean = text.trim();
    
    // Try 1: Start with digits
    const m1 = /^(\d{1,3})/.exec(clean);
    if (m1) return parseInt(m1[1], 10);
    
    const textLower = clean.toLowerCase();
    
    // Try 2: Slide/Page/P
    const m2 = /^(?:slide|page|p)\s*[-_:]?\s*(\d{1,3})/.exec(textLower);
    if (m2) return parseInt(m2[1], 10);
    
    // Try 3: 第X页/张
    const m3 = /^第\s*(\d{1,3})\s*[页张]/.exec(textLower);
    if (m3) return parseInt(m3[1], 10);
    
    return null;
  }

  private matchTitle(
    rawTitle: string,
    exactSet: Set<string>,
    normMap: Map<string, string[]>,
    numMap: Map<number, string[]>,
    svgStems: string[]
  ): string | null {
    if (exactSet.has(rawTitle)) return rawTitle;
    
    const norm = this.normalizeTitle(rawTitle);
    if (norm && normMap.has(norm)) {
      const candidates = normMap.get(norm)!;
      if (candidates.length === 1) return candidates[0];
    }
    
    const num = this.extractLeadingNumber(rawTitle);
    if (num !== null && numMap.has(num)) {
      const candidates = numMap.get(num)!;
      if (candidates.length === 1) return candidates[0];
    }
    
    if (norm) {
      const candidates = svgStems.filter(s => this.normalizeTitle(s).includes(norm));
      if (candidates.length === 1) return candidates[0];
    }
    
    return null;
  }

  private cleanupOrphanedSvgs(projectPath: string): void {
    try {
      const svgDir = join(projectPath, "svg_output");
      const totalMdPath = join(projectPath, "notes", "total.md");
      if (!existsSync(svgDir) || !existsSync(totalMdPath)) return;

      const svgFiles = readdirSync(svgDir).filter(f => f.toLowerCase().endsWith(".svg"));
      if (svgFiles.length === 0) return;

      const svgStems = svgFiles.map(f => f.slice(0, -4));
      const exactSet = new Set(svgStems);
      const normMap = new Map<string, string[]>();
      const numMap = new Map<number, string[]>();

      for (const stem of svgStems) {
        const norm = this.normalizeTitle(stem);
        if (norm) {
          if (!normMap.has(norm)) normMap.set(norm, []);
          normMap.get(norm)!.push(stem);
        }
        const num = this.extractLeadingNumber(stem);
        if (num !== null) {
          if (!numMap.has(num)) numMap.set(num, []);
          numMap.get(num)!.push(stem);
        }
      }

      // Parse total.md headings
      const mdContent = readFileSync(totalMdPath, "utf-8");
      const matchedStems = new Set<string>();
      const lines = mdContent.split(/\r?\n/);
      
      for (const line of lines) {
        const m = /^(#{1,6})\s*(.+?)\s*$/.exec(line);
        if (m) {
          const rawTitle = m[2].trim();
          const matched = this.matchTitle(rawTitle, exactSet, normMap, numMap, svgStems);
          if (matched) {
            matchedStems.add(matched);
          }
        }
      }

      // Delete orphaned SVG files
      for (const stem of svgStems) {
        if (!matchedStems.has(stem)) {
          const orphanedSvgPath = join(svgDir, `${stem}.svg`);
          console.log(`[Orchestrator] Deleting orphaned SVG: ${orphanedSvgPath}`);
          try {
            unlinkSync(orphanedSvgPath);
          } catch (e) {
            console.error(`Failed to delete orphaned SVG file ${orphanedSvgPath}:`, e);
          }
        }
      }
    } catch (err) {
      console.error("Error during cleanup of orphaned SVGs:", err);
    }
  }

  private runStep(
    session: PptProgress,
    stepName: PptProgress["step"],
    percent: number,
    command: string,
    args: string[],
    cwd: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      session.step = stepName;
      session.percent = percent;
      const logMsg = `[System] Starting step: ${stepName}...`;
      session.logs.push(logMsg);
      this.emit(`log:${session.sessionId}`, logMsg);
      this.emit(`update:${session.sessionId}`, session);

      const process = spawn(command, args, { cwd });
      session.logs.push(`[Command] ${command} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`);

      process.stdout.on("data", (data) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            session.logs.push(line);
            this.emit(`log:${session.sessionId}`, line);
          }
        }
      });

      process.stderr.on("data", (data) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            session.logs.push(`[Error] ${line}`);
            this.emit(`log:${session.sessionId}`, `[Error] ${line}`);
          }
        }
      });

      process.on("error", (err) => {
        session.logs.push(`[Error] ${err.message}`);
        this.emit(`log:${session.sessionId}`, `[Error] ${err.message}`);
        reject(err);
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          const recentErrors = session.logs
            .filter((line) => line.startsWith("[Error]"))
            .slice(-5)
            .join("\n");
          reject(new Error(`Process exited with non-zero code: ${code}${recentErrors ? `\n${recentErrors}` : ""}`));
        }
      });
    });
  }

  public shutdownConfirmUI(_sessionId: string): void {
    // No-op — Confirm UI is now served natively by Next.js, no process to kill.
  }

  public async ensureConfirmUiRunning(_session: PptProgress, _cwd: string): Promise<void> {
    // No-op — Confirm UI is now served natively by Next.js, nothing to restart.
  }
}

declare global {
  // Keep PPT sessions alive across Next.js route module reloads in dev.
  // Without this, /api/ppt/generate and /api/ppt/progress/[sessionId] can see
  // different orchestrator instances and the SSE endpoint returns 404.
  // eslint-disable-next-line no-var
  var __pptOrchestrator: PptOrchestrator | undefined;
  // eslint-disable-next-line no-var
  var __pptOrchestratorVersion: number | undefined;
}

export const pptOrchestrator =
  globalThis.__pptOrchestrator && globalThis.__pptOrchestratorVersion === PPT_ORCHESTRATOR_VERSION
    ? globalThis.__pptOrchestrator
    : new PptOrchestrator();
globalThis.__pptOrchestrator = pptOrchestrator;
globalThis.__pptOrchestratorVersion = PPT_ORCHESTRATOR_VERSION;
