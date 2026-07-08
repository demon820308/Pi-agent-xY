import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

// Template dir: check APP_ROOT (Electron injects this) first, then fall back to ~/ai-website-cloner-template
function getTemplateDir(): string {
  const appRoot = process.env.APP_ROOT;
  if (appRoot) {
    const candidate = join(appRoot, 'ai-website-cloner-template-master');
    if (existsSync(candidate)) return candidate;
  }
  return join(homedir(), 'ai-website-cloner-template-master');
}

const TEMPLATE_DIR = getTemplateDir();

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.next', 'out', 'build', 'dist',
  '.idea', '.vscode', '.vercel', 'temp', '.github',
  '.claude', '.cursor', '.continue', '.windsurf', '.amazonq',
  '.augment', '.codex', '.opencode', '.gemini',
]);

const EXCLUDE_FILES = new Set([
  '.env', '.env.local', 'package-lock.json',
  '.aider.conf.yml', '.clinerules', '.windsurfrules',
  'CLAUDE.md', 'GEMINI.md',
]);

function copyDirSync(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    if (EXCLUDE_FILES.has(entry)) continue;

    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url, targetPath, language } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let projectPath = targetPath;
    if (!projectPath) {
      let hostname: string;
      try {
        hostname = new URL(url).hostname;
      } catch {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
      }
      projectPath = join(homedir(), 'cloned-websites', hostname);
    }

    projectPath = resolve(projectPath);

    if (!existsSync(TEMPLATE_DIR)) {
      return NextResponse.json({ error: `Template directory not found: ${TEMPLATE_DIR}` }, { status: 500 });
    }

    if (existsSync(projectPath)) {
      return NextResponse.json({ error: `Target directory already exists: ${projectPath}` }, { status: 409 });
    }

    // 1. Copy template to target path
    mkdirSync(projectPath, { recursive: true });
    copyDirSync(TEMPLATE_DIR, projectPath);

    // 2. Set up .agents directory with skill and AGENTS.md
    const agentsSkillsDir = join(projectPath, '.agents', 'skills', 'clone-website');
    mkdirSync(agentsSkillsDir, { recursive: true });

    const skillSrc = join(TEMPLATE_DIR, '.claude', 'skills', 'clone-website', 'SKILL.md');
    if (existsSync(skillSrc)) {
      copyFileSync(skillSrc, join(agentsSkillsDir, 'SKILL.md'));
    }

    const agentsMdSrc = join(TEMPLATE_DIR, 'AGENTS.md');
    if (existsSync(agentsMdSrc)) {
      try {
        const { readFileSync, writeFileSync } = require('fs');
        let agentsContent = readFileSync(agentsMdSrc, 'utf8');
        if (language === 'zh') {
          agentsContent += `\n\n## Language Rule\n- 请务必全程使用中文（简体）进行会话与思考，并且 docs/research/ 目录下的所有分析文档、组件说明规格书（.spec.md）、设计决策报告也必须全部用中文撰写。\n`;
        }
        writeFileSync(join(projectPath, '.agents', 'AGENTS.md'), agentsContent, 'utf8');
        writeFileSync(join(projectPath, 'AGENTS.md'), agentsContent, 'utf8');
      } catch (err) {
        console.error('[clone-init] Failed to customize AGENTS.md:', err);
        copyFileSync(agentsMdSrc, join(projectPath, '.agents', 'AGENTS.md'));
      }
    }

    // 3. Initialize git repo
    try {
      execSync('git init', { cwd: projectPath, stdio: 'ignore' });
      execSync('git config user.name "Pi Agent"', { cwd: projectPath, stdio: 'ignore' });
      execSync('git config user.email "pi@agent.local"', { cwd: projectPath, stdio: 'ignore' });
      execSync('git add -A', { cwd: projectPath, stdio: 'ignore' });
      execSync('git commit -m "Initial commit: Next.js cloner scaffold"', { cwd: projectPath, stdio: 'ignore' });
    } catch (gitErr) {
      console.error('[clone-init] Git init failed (non-fatal):', gitErr);
    }

    return NextResponse.json({ projectPath, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Clone init failed';
    console.error('[clone-init]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
