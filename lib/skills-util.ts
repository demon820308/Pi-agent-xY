import { join } from "path";
import { getAppRoot } from "./app-root";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const execAsync = promisify(exec);

export function getBuiltInSkillsDir(agentDir: string): string {
  return join(agentDir, "agent-skills");
}

export function getBuiltInSkillsPath(agentDir: string): string {
  return join(getBuiltInSkillsDir(agentDir), "skills");
}

export function getDisabledBuiltInSkills(agentDir: string): string[] {
  const path = join(agentDir, "settings.json");
  if (!existsSync(path)) return [];
  try {
    const settings = JSON.parse(readFileSync(path, "utf8")) || {};
    return settings.disabledBuiltInSkills || [];
  } catch {
    return [];
  }
}

export function setBuiltInSkillDisabled(agentDir: string, id: string, disabled: boolean) {
  const path = join(agentDir, "settings.json");
  let settings: any = {};
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, "utf8")) || {};
    } catch {
      // ignore
    }
  }
  const disabledList: string[] = settings.disabledBuiltInSkills || [];
  let nextList = [...disabledList];
  if (disabled) {
    if (!nextList.includes(id)) nextList.push(id);
  } else {
    nextList = nextList.filter(x => x !== id);
  }
  settings.disabledBuiltInSkills = nextList;
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf8");
}

export function getDisabledVirtualSkills(agentDir: string): string[] {
  const path = join(agentDir, "settings.json");
  if (!existsSync(path)) return [];
  try {
    const settings = JSON.parse(readFileSync(path, "utf8")) || {};
    return settings.disabledVirtualSkills || [];
  } catch {
    return [];
  }
}

export function setVirtualSkillDisabled(agentDir: string, id: string, disabled: boolean) {
  const path = join(agentDir, "settings.json");
  let settings: any = {};
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, "utf8")) || {};
    } catch {
      // ignore
    }
  }
  const disabledList: string[] = settings.disabledVirtualSkills || [];
  let nextList = [...disabledList];
  if (disabled) {
    if (!nextList.includes(id)) nextList.push(id);
  } else {
    nextList = nextList.filter(x => x !== id);
  }
  settings.disabledVirtualSkills = nextList;
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf8");
}

export function isBuiltInSkillPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.includes("agent-skills") ||
    normalized.includes("skills-main") ||
    normalized.includes(".agents/skills")
  );
}

export function createResourceLoader(cwd: string, agentDir: string): DefaultResourceLoader {
  const builtInSkillsPath = getBuiltInSkillsPath(agentDir);
  const additionalSkillPaths: string[] = [];
  if (existsSync(builtInSkillsPath)) {
    additionalSkillPaths.push(builtInSkillsPath);
  }

  return new DefaultResourceLoader({
    cwd,
    agentDir,
    additionalSkillPaths,
    skillsOverride: (base) => {
      const disabledBuiltInList = getDisabledBuiltInSkills(agentDir);
      const mapped = base.skills.map((skill) => {
        if (isBuiltInSkillPath(skill.filePath)) {
          const isCurrentlyDisabled = disabledBuiltInList.includes(skill.name);
          return {
            ...skill,
            disableModelInvocation: isCurrentlyDisabled,
            sourceInfo: {
              ...skill.sourceInfo,
              source: "built-in"
            }
          };
        }
        return skill;
      });
      return { ...base, skills: mapped };
    }
  });
}

export function copyDirSync(src: string, dest: string) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export async function syncBuiltInSkills(
  agentDir: string,
  cwd?: string
): Promise<{ success: boolean; message: string }> {
  const targetDir = getBuiltInSkillsDir(agentDir);
  const gitDir = join(targetDir, ".git");

  try {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    let isNewClone = false;
    if (!existsSync(gitDir)) {
      isNewClone = true;
      console.log(`[skills] Cloning agent-skills repo to ${targetDir}`);
      // Initialize git and pull (handles existing directory gracefully)
      await execAsync(`git init`, { cwd: targetDir });
      await execAsync(`git remote add origin https://github.com/addyosmani/agent-skills.git`, { cwd: targetDir });
      await execAsync(`git fetch origin`, { cwd: targetDir });
      await execAsync(`git checkout -f main`, { cwd: targetDir });
    } else {
      // Pull updates
      console.log(`[skills] Pulling updates for agent-skills in ${targetDir}`);
      await execAsync(`git reset --hard HEAD`, { cwd: targetDir });
      await execAsync(`git pull origin main`, { cwd: targetDir });
    }

    // Now propagate/copy the updated skills to templates and workspace
    const updatedSkillsPath = getBuiltInSkillsPath(agentDir);
    if (existsSync(updatedSkillsPath)) {
      // 1. Copy to templates: process.cwd()/skills-main/skills
      const templatesSkillsDir = join(getAppRoot(), "skills-main", "skills");
      if (existsSync(templatesSkillsDir)) {
        console.log(`[skills] Copying updated skills to templates: ${templatesSkillsDir}`);
        const skillsSubdirs = readdirSync(updatedSkillsPath);
        for (const subdir of skillsSubdirs) {
          const srcSubdir = join(updatedSkillsPath, subdir);
          if (statSync(srcSubdir).isDirectory()) {
            let destSubdir = "";
            for (const bucket of ["engineering", "productivity", "misc"]) {
              const testBucketPath = join(templatesSkillsDir, bucket, subdir);
              if (existsSync(join(templatesSkillsDir, bucket))) {
                if (existsSync(testBucketPath) || bucket === "engineering") {
                  destSubdir = testBucketPath;
                  if (existsSync(testBucketPath)) break;
                }
              }
            }
            if (destSubdir) {
              copyDirSync(srcSubdir, destSubdir);
            }
          }
        }
      }

      // 2. Copy to active workspace: cwd/.agents/skills
      if (cwd) {
        const workspaceSkillsDir = join(cwd, ".agents", "skills");
        console.log(`[skills] Copying updated skills to active workspace: ${workspaceSkillsDir}`);
        const skillsSubdirs = readdirSync(updatedSkillsPath);
        for (const subdir of skillsSubdirs) {
          const srcSubdir = join(updatedSkillsPath, subdir);
          if (statSync(srcSubdir).isDirectory()) {
            const destSubdir = join(workspaceSkillsDir, subdir);
            copyDirSync(srcSubdir, destSubdir);
          }
        }
      }
    }

    return { 
      success: true, 
      message: isNewClone 
        ? "Successfully cloned built-in skills from GitHub." 
        : "Successfully updated built-in skills from GitHub." 
    };
  } catch (error: any) {
    console.error("[skills] Git operation failed:", error);
    return { success: false, message: error.message || String(error) };
  }
}
