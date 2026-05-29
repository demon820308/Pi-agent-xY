import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { dirname, join, delimiter } from "path";
import { execPath } from "process";

const execFileAsync = promisify(execFile);

interface ResolvedNpx {
  nodePath: string;
  npxCliPath: string;
}

/**
 * Locate system Node.js binary and its corresponding npx-cli.js path.
 *
 * Inside packaged Electron, process.execPath is the packaged desktop app itself,
 * not the Node.js binary. We scan PATH and standard install directories to
 * locate the system Node.js and npm CLI tooling.
 */
function resolveNpx(): ResolvedNpx | null {
  // 1. Try to find Node relative to the running execPath (works in standard dev or server Node.js)
  const nodeDir = dirname(execPath);
  const candidates = [
    // Windows MSI installer layout: node.exe and node_modules share a dir
    join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js"),
    // Unix layout: .../bin/node + .../lib/node_modules/npm/bin/npx-cli.js
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ];

  const isElectron = process.versions.electron !== undefined || 
                     execPath.toLowerCase().includes("electron") || 
                     execPath.toLowerCase().includes("desktop");

  if (!isElectron) {
    for (const p of candidates) {
      try {
        if (existsSync(p)) {
          return { nodePath: execPath, npxCliPath: p };
        }
      } catch {
        // ignore
      }
    }
  }

  // 2. Scan system PATH to locate system Node.js installation
  const pathEnv = process.env.PATH || "";
  const paths = pathEnv.split(delimiter);
  const nodeBinNames = process.platform === "win32" ? ["node.exe", "node"] : ["node"];

  for (const dir of paths) {
    if (!dir) continue;
    for (const binName of nodeBinNames) {
      const nodePath = join(dir, binName);
      try {
        if (existsSync(nodePath)) {
          const relativeCandidates = [
            // Windows layout: node_modules next to node.exe
            join(dir, "node_modules", "npm", "bin", "npx-cli.js"),
            // Unix/macOS layout: bin/node and lib/node_modules/npm
            join(dir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
          ];
          for (const p of relativeCandidates) {
            if (existsSync(p)) {
              return { nodePath, npxCliPath: p };
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 3. Fallback to standard installation paths if not on PATH
  if (process.platform === "win32") {
    const stdWinPath = "C:\\Program Files\\nodejs\\node.exe";
    const stdNpxCli = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js";
    try {
      if (existsSync(stdWinPath) && existsSync(stdNpxCli)) {
        return { nodePath: stdWinPath, npxCliPath: stdNpxCli };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export interface RunNpxOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunNpxResult {
  stdout: string;
  stderr: string;
}

/**
 * Cross-platform wrapper for invoking `npx <args>` safely.
 *
 * Prefers executing npx-cli.js directly using the system Node binary to avoid
 * spawning shell command shells and potential argument injection vulnerabilities.
 * Falls back to spawning npx.cmd (on Windows) or npx directly with shell: true
 * if system Node cannot be dynamically located.
 */
export async function runNpx(args: string[], opts: RunNpxOptions = {}): Promise<RunNpxResult> {
  const resolved = resolveNpx();
  if (resolved) {
    console.log(`[runNpx] using resolved node: "${resolved.nodePath}" with npx-cli: "${resolved.npxCliPath}"`);
    return execFileAsync(resolved.nodePath, [resolved.npxCliPath, ...args], {
      timeout: opts.timeout,
      cwd: opts.cwd,
      env: opts.env,
    });
  }

  // Fallback to spawning npx directly on PATH using shell on Windows to support batch executables (.cmd)
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  console.log(`[runNpx] falling back to spawning "${command}" directly`);
  return execFileAsync(command, args, {
    timeout: opts.timeout,
    cwd: opts.cwd,
    env: opts.env,
    shell: process.platform === "win32" ? true : undefined,
  });
}

