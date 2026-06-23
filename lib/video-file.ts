const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mkv",
  "avi",
  "mov",
  "flv",
  "wmv",
  "m4v",
  "mpeg",
  "mpg",
  "3gp",
]);

const VIDEO_MIME_PREFIXES = ["video/"];

/** Check if a File is a video based on extension or MIME type. */
export function isVideoFile(file: File): boolean {
  if (VIDEO_MIME_PREFIXES.some((p) => file.type.startsWith(p))) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? VIDEO_EXTENSIONS.has(ext) : false;
}
