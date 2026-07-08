/**
 * Returns the application root directory.
 *
 * In packaged Electron, process.cwd() points to a random directory (e.g. "/" on Mac).
 * electron/main.js injects APP_ROOT env var pointing to the real app resource dir.
 * In dev (npm run dev), APP_ROOT is undefined so we fall back to process.cwd().
 */
export function getAppRoot(): string {
  return process.env.APP_ROOT || process.cwd();
}
