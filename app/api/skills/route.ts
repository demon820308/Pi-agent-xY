import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import {
  createResourceLoader,
  getDisabledVirtualSkills,
  setVirtualSkillDisabled,
  setBuiltInSkillDisabled,
  isBuiltInSkillPath
} from "@/lib/skills-util";

export const dynamic = "force-dynamic";

// GET /api/skills?cwd=<path>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  try {
    const agentDir = getAgentDir();
    const loader = createResourceLoader(cwd, agentDir);
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();

    const mappedSkills = skills.map((skill) => {
      if (isBuiltInSkillPath(skill.filePath)) {
        return {
          ...skill,
          sourceInfo: {
            ...skill.sourceInfo,
            source: "built-in"
          }
        };
      }
      return skill;
    });

    const disabledList = getDisabledVirtualSkills(agentDir);

    // Append virtual skills for Tavily and Firecrawl
    const virtualSkills = [
      {
        name: "Tavily Search",
        description: "Enables autonomous deep web search query execution. Paste your Tavily API Key here to enable.",
        filePath: "virtual:tavily",
        baseDir: "virtual",
        disableModelInvocation: disabledList.includes("tavily"),
        sourceInfo: { source: "virtual", scope: "global" }
      },
      {
        name: "Firecrawl Scraper",
        description: "Enables HTML markdown crawling and scraping of websites. Paste your Firecrawl API Key here to enable.",
        filePath: "virtual:firecrawl",
        baseDir: "virtual",
        disableModelInvocation: disabledList.includes("firecrawl"),
        sourceInfo: { source: "virtual", scope: "global" }
      }
    ];

    return NextResponse.json({ skills: [...mappedSkills, ...virtualSkills], diagnostics });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/skills — toggle disable-model-invocation on a skill
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { filePath: string; disableModelInvocation: boolean };
    const { filePath, disableModelInvocation } = body;
    if (!filePath) return NextResponse.json({ error: "filePath required" }, { status: 400 });

    const agentDir = getAgentDir();

    // Handle virtual skills
    if (filePath.startsWith("virtual:")) {
      const id = filePath.replace("virtual:", "");
      setVirtualSkillDisabled(agentDir, id, disableModelInvocation);
      return NextResponse.json({ success: true });
    }

    if (!existsSync(filePath)) return NextResponse.json({ error: "file not found" }, { status: 404 });

    // Handle built-in skills (avoid writing to disk)
    if (isBuiltInSkillPath(filePath)) {
      const content = readFileSync(filePath, "utf8");
      const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
      const skillName = (frontmatter.name as string) || filePath;
      setBuiltInSkillDisabled(agentDir, skillName, disableModelInvocation);
      return NextResponse.json({ success: true });
    }

    // Handle regular skills (write directly to the SKILL.md file)
    const content = readFileSync(filePath, "utf8");
    const key = "disable-model-invocation";

    // Use parseFrontmatter to check current value, then do a surgical line edit
    // to preserve the original YAML formatting of all other fields.
    const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
    const alreadySet = Boolean(frontmatter[key]);

    let updated = content;
    if (disableModelInvocation && !alreadySet) {
      // Add key after the opening --- line
      updated = content.replace(/^---\r?\n/, `---\n${key}: true\n`);
      // If no frontmatter exists, create one
      if (updated === content) updated = `---\n${key}: true\n---\n${content}`;
    } else if (!disableModelInvocation && alreadySet) {
      // Remove the key line entirely
      updated = content.replace(new RegExp(`^${key}\\s*:.*\\r?\\n`, "m"), "");
    }

    writeFileSync(filePath, updated, "utf8");
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

