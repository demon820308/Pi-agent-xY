import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAppRoot } from "@/lib/app-root";

export const dynamic = "force-dynamic";

interface ParsedPreset {
  id: string;
  caseId: number;
  name: string;
  category: string;
  template: string;
  imagePath: string | null;
}

const CATEGORY_MAP: Record<string, string> = {
  "ecommerce": "电商主图",
  "poster": "海报插画",
  "portrait": "人像摄影",
  "ui": "UI 设计",
  "ad-creative": "广告创意",
  "character": "角色设计",
  "comparison": "对比案例",
  "ad": "广告创意",
};

function resolveCategory(filename: string): string {
  const base = filename.replace(/_zh-CN\.md$/, "").replace(/\.md$/, "");
  return CATEGORY_MAP[base] ?? base;
}

function findImageForCase(imagesDir: string, caseId: number): string | null {
  try {
    const entries = fs.readdirSync(imagesDir, { withFileTypes: true });
    const suffix = `case${caseId}`;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.endsWith(suffix) || entry.name === suffix) {
        const dirPath = path.join(imagesDir, entry.name);
        const files = fs.readdirSync(dirPath);
        const output = files.find(f => /^output\d*\.jpe?g$/i.test(f));
        if (output) {
          return path.join(dirPath, output);
        }
        const anyImg = files.find(f => /\.(jpe?g|png|webp)$/i.test(f));
        if (anyImg) {
          return path.join(dirPath, anyImg);
        }
      }
    }
  } catch {
    // images dir may not exist
  }
  return null;
}

function parseCasesFromFile(filePath: string, category: string, imagesDir: string): ParsedPreset[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const presets: ParsedPreset[] = [];

  const caseRegex = /###\s+Case\s+(\d+):\s+\[(.*?)\]/g;
  let match;

  while ((match = caseRegex.exec(content)) !== null) {
    const caseId = parseInt(match[1], 10);
    const caseName = match[2];
    const afterHeader = content.slice(match.index + match[0].length);

    const codeBlockMatch = afterHeader.match(/```\s*\n([\s\S]*?)```/);
    const template = codeBlockMatch ? codeBlockMatch[1].trim() : "";

    if (!template) continue;

    const imagePath = findImageForCase(imagesDir, caseId);

    presets.push({
      id: `case${caseId}`,
      caseId,
      name: caseName,
      category,
      template,
      imagePath,
    });
  }

  return presets;
}

export async function GET(req: Request) {
  try {
    const repoRoot = path.join(getAppRoot(), "awesome-gpt-image-2-API-and-Prompts-main");
    const casesDir = path.join(repoRoot, "cases");
    const imagesDir = path.join(repoRoot, "images");

    if (!fs.existsSync(repoRoot)) {
      return NextResponse.json({ exists: false, presets: [] });
    }

    if (!fs.existsSync(casesDir)) {
      return NextResponse.json({ exists: true, presets: [] });
    }

    const allFiles = fs.readdirSync(casesDir);
    const zhCNFiles = allFiles.filter(f => f.endsWith("_zh-CN.md"));
    const targetFiles = zhCNFiles.length > 0
      ? zhCNFiles
      : allFiles.filter(f => f.endsWith(".md") && !f.startsWith("README"));

    const allPresets: ParsedPreset[] = [];
    for (const file of targetFiles) {
      const category = resolveCategory(file);
      const filePath = path.join(casesDir, file);
      const parsed = parseCasesFromFile(filePath, category, imagesDir);
      allPresets.push(...parsed);
    }

    allPresets.sort((a, b) => a.caseId - b.caseId);

    return NextResponse.json({ exists: true, presets: allPresets });
  } catch (err) {
    console.error("[prompt-presets] Error scanning:", err);
    return NextResponse.json({ exists: false, presets: [] });
  }
}
