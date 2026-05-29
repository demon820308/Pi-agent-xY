/* eslint-disable @typescript-eslint/no-require-imports */
const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = 'Pi Agent xY Team';
pres.title = 'Pi Agent xY - AI Coding Assistant';

// Color palette - Teal Trust theme
const COLORS = {
  primary: '028090',    // Teal
  secondary: '00A896',  // Seafoam
  accent: '02C39A',     // Mint
  dark: '1A1A2E',       // Dark navy
  light: 'F8F9FA',      // Off-white
  white: 'FFFFFF',
  text: '2D3436',       // Dark gray
  muted: '636E72'       // Muted gray
};

// ==================== Slide 1: Title ====================
let slide1 = pres.addSlide();
slide1.background = { color: COLORS.dark };

// Decorative shape
slide1.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 0.15, h: 5.625,
  fill: { color: COLORS.accent }
});

// Title
slide1.addText("Pi Agent xY", {
  x: 0.8, y: 1.2, w: 8, h: 1.5,
  fontSize: 54, fontFace: "Arial Black",
  color: COLORS.white, bold: true
});

// Subtitle
slide1.addText("Your AI-Powered Coding Assistant", {
  x: 0.8, y: 2.7, w: 8, h: 0.8,
  fontSize: 28, fontFace: "Arial",
  color: COLORS.accent
});

// Tagline
slide1.addText("Built with Next.js 16 • React 19 • TypeScript", {
  x: 0.8, y: 3.6, w: 8, h: 0.5,
  fontSize: 14, fontFace: "Arial",
  color: COLORS.muted
});

// Version badge
slide1.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 0.8, y: 4.5, w: 1.5, h: 0.4,
  fill: { color: COLORS.primary }, rectRadius: 0.1
});
slide1.addText("v0.6.11", {
  x: 0.8, y: 4.5, w: 1.5, h: 0.4,
  fontSize: 12, fontFace: "Arial",
  color: COLORS.white, align: "center", valign: "middle"
});

// ==================== Slide 2: What is Pi Agent xY ====================
let slide2 = pres.addSlide();
slide2.background = { color: COLORS.light };

// Section header
slide2.addText("What is Pi Agent xY?", {
  x: 0.5, y: 0.3, w: 9, h: 0.8,
  fontSize: 36, fontFace: "Arial Black",
  color: COLORS.primary, bold: true
});

// Description
slide2.addText([
  { text: "Pi Agent xY is a modern web-based interface for the pi coding agent. ", options: { breakLine: true } },
  { text: "It provides a beautiful, responsive UI for interacting with AI models", options: { breakLine: true } },
  { text: "to help you write, debug, and understand code faster.", options: {} }
], {
  x: 0.5, y: 1.3, w: 9, h: 1.5,
  fontSize: 18, fontFace: "Arial",
  color: COLORS.text, lineSpacingMultiple: 1.5
});

// Key features cards
const features = [
  { title: "Multi-Model", desc: "Support for 20+ AI providers including OpenAI, Anthropic, Google, DeepSeek" },
  { title: "Real-time Streaming", desc: "Watch AI responses as they're generated with SSE streaming" },
  { title: "File Explorer", desc: "Browse and view files directly in the browser" },
  { title: "Session Management", desc: "Organize conversations with folders and search" }
];

features.forEach((f, i) => {
  const x = 0.5 + (i % 2) * 4.5;
  const y = 3.2 + Math.floor(i / 2) * 1.2;
  
  slide2.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 4.2, h: 1.0,
    fill: { color: COLORS.white },
    shadow: { type: "outer", blur: 4, offset: 2, angle: 135, color: "000000", opacity: 0.1 }
  });
  
  slide2.addText(f.title, {
    x: x + 0.2, y: y + 0.1, w: 3.8, h: 0.4,
    fontSize: 16, fontFace: "Arial",
    color: COLORS.primary, bold: true
  });
  
  slide2.addText(f.desc, {
    x: x + 0.2, y: y + 0.5, w: 3.8, h: 0.4,
    fontSize: 12, fontFace: "Arial",
    color: COLORS.muted
  });
});

// ==================== Slide 3: Supported Models ====================
let slide3 = pres.addSlide();
slide3.background = { color: COLORS.light };

slide3.addText("Supported AI Models", {
  x: 0.5, y: 0.3, w: 9, h: 0.8,
  fontSize: 36, fontFace: "Arial Black",
  color: COLORS.primary, bold: true
});

// Model providers table
const providers = [
  ["Provider", "Models", "Status"],
  ["OpenAI", "GPT-4o, GPT-4.1, o3, o4-mini", "✅"],
  ["Anthropic", "Claude 4 Sonnet, Claude 4 Opus", "✅"],
  ["Google", "Gemini 2.5 Pro, Gemini 2.5 Flash", "✅"],
  ["DeepSeek", "DeepSeek R1, DeepSeek V3", "✅"],
  ["MiniMax", "MiniMax M2.7", "✅"],
  ["XAI", "Grok 3", "✅"],
  ["OpenRouter", "100+ models via proxy", "✅"]
];

slide3.addTable(providers, {
  x: 0.5, y: 1.3, w: 9, h: 3.5,
  border: { pt: 1, color: "E0E0E0" },
  colW: [2.5, 5, 1.5],
  fontSize: 14,
  fontFace: "Arial",
  color: COLORS.text,
  autoPage: false
});

// Note
slide3.addText("* Supports custom model configuration via models.json", {
  x: 0.5, y: 5.0, w: 9, h: 0.4,
  fontSize: 12, fontFace: "Arial",
  color: COLORS.muted, italic: true
});

// ==================== Slide 4: Architecture ====================
let slide4 = pres.addSlide();
slide4.background = { color: COLORS.light };

slide4.addText("Technical Architecture", {
  x: 0.5, y: 0.3, w: 9, h: 0.8,
  fontSize: 36, fontFace: "Arial Black",
  color: COLORS.primary, bold: true
});

// Tech stack
const techStack = [
  { name: "Next.js 16", role: "Framework" },
  { name: "React 19", role: "UI Library" },
  { name: "TypeScript", role: "Type Safety" },
  { name: "Tailwind CSS 4", role: "Styling" }
];

techStack.forEach((t, i) => {
  const x = 0.5 + i * 2.3;
  
  slide4.addShape(pres.shapes.RECTANGLE, {
    x, y: 1.5, w: 2.1, h: 1.2,
    fill: { color: COLORS.primary }
  });
  
  slide4.addText(t.name, {
    x, y: 1.6, w: 2.1, h: 0.6,
    fontSize: 16, fontFace: "Arial",
    color: COLORS.white, bold: true, align: "center", valign: "middle"
  });
  
  slide4.addText(t.role, {
    x, y: 2.2, w: 2.1, h: 0.4,
    fontSize: 12, fontFace: "Arial",
    color: COLORS.white, align: "center", valign: "middle"
  });
});

// Architecture diagram description
slide4.addText([
  { text: "Client-Server Architecture", options: { bold: true, breakLine: true } },
  { text: "", options: { breakLine: true } },
  { text: "• Browser communicates via REST API & SSE", options: { bullet: true, breakLine: true } },
  { text: "• Agent sessions run in-process on server", options: { bullet: true, breakLine: true } },
  { text: "• Real-time streaming via Server-Sent Events", options: { bullet: true, breakLine: true } },
  { text: "• File system access for code exploration", options: { bullet: true, breakLine: true } }
], {
  x: 0.5, y: 3.2, w: 9, h: 2.2,
  fontSize: 16, fontFace: "Arial",
  color: COLORS.text, lineSpacingMultiple: 1.3
});

// ==================== Slide 5: Features Deep Dive ====================
let slide5 = pres.addSlide();
slide5.background = { color: COLORS.light };

slide5.addText("Key Features", {
  x: 0.5, y: 0.3, w: 9, h: 0.8,
  fontSize: 36, fontFace: "Arial Black",
  color: COLORS.primary, bold: true
});

const keyFeatures = [
  { icon: "🎯", title: "Multi-Model Support", desc: "Switch between AI providers seamlessly" },
  { icon: "⚡", title: "Real-time Streaming", desc: "Watch responses generate in real-time" },
  { icon: "📁", title: "File Explorer", desc: "Browse project files without leaving the UI" },
  { icon: "🔧", title: "Tool Presets", desc: "Configure which tools the AI can use" },
  { icon: "🧠", title: "Thinking Levels", desc: "Control AI reasoning depth" },
  { icon: "🌳", title: "Session Branching", desc: "Fork conversations to explore different paths" }
];

keyFeatures.forEach((f, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = 0.5 + col * 3.1;
  const y = 1.5 + row * 2.0;
  
  slide5.addText(f.icon, {
    x, y, w: 0.6, h: 0.6,
    fontSize: 28
  });
  
  slide5.addText(f.title, {
    x: x + 0.7, y, w: 2.3, h: 0.4,
    fontSize: 16, fontFace: "Arial",
    color: COLORS.text, bold: true
  });
  
  slide5.addText(f.desc, {
    x: x + 0.7, y: y + 0.4, w: 2.3, h: 0.5,
    fontSize: 12, fontFace: "Arial",
    color: COLORS.muted
  });
});

// ==================== Slide 6: Getting Started ====================
let slide6 = pres.addSlide();
slide6.background = { color: COLORS.dark };

slide6.addText("Getting Started", {
  x: 0.5, y: 0.3, w: 9, h: 0.8,
  fontSize: 36, fontFace: "Arial Black",
  color: COLORS.white, bold: true
});

const steps = [
  { step: "1", title: "Install", cmd: "npm install -g @zwbigi/pi-agent-xy" },
  { step: "2", title: "Configure", cmd: "Edit ~/.pi/agent/models.json" },
  { step: "3", title: "Run", cmd: "pi-agent-xy start" },
  { step: "4", title: "Open", cmd: "http://localhost:30142" }
];

steps.forEach((s, i) => {
  const y = 1.3 + i * 1.0;
  
  // Step number
  slide6.addShape(pres.shapes.OVAL, {
    x: 0.5, y, w: 0.5, h: 0.5,
    fill: { color: COLORS.accent }
  });
  
  slide6.addText(s.step, {
    x: 0.5, y, w: 0.5, h: 0.5,
    fontSize: 18, fontFace: "Arial",
    color: COLORS.dark, bold: true, align: "center", valign: "middle"
  });
  
  // Title
  slide6.addText(s.title, {
    x: 1.2, y, w: 2, h: 0.5,
    fontSize: 18, fontFace: "Arial",
    color: COLORS.white, bold: true, valign: "middle"
  });
  
  // Command
  slide6.addShape(pres.shapes.RECTANGLE, {
    x: 3.5, y: y + 0.05, w: 6, h: 0.4,
    fill: { color: '2D2D44' }
  });
  
  slide6.addText(s.cmd, {
    x: 3.7, y, w: 5.6, h: 0.5,
    fontSize: 14, fontFace: "Consolas",
    color: COLORS.accent, valign: "middle"
  });
});

// ==================== Slide 7: Contact ====================
let slide7 = pres.addSlide();
slide7.background = { color: COLORS.primary };

slide7.addText("Thank You!", {
  x: 0.5, y: 1.5, w: 9, h: 1.2,
  fontSize: 48, fontFace: "Arial Black",
  color: COLORS.white, bold: true, align: "center"
});

slide7.addText("Start building with Pi Agent xY today", {
  x: 0.5, y: 2.8, w: 9, h: 0.6,
  fontSize: 20, fontFace: "Arial",
  color: COLORS.white, align: "center"
});

// Contact info
slide7.addText([
  { text: "GitHub: github.com/demon820308/pi-web", options: { breakLine: true } },
  { text: "npm: @zwbigi/pi-agent-xy", options: {} }
], {
  x: 0.5, y: 3.8, w: 9, h: 1,
  fontSize: 16, fontFace: "Arial",
  color: COLORS.white, align: "center", lineSpacingMultiple: 1.5
});

// Save
pres.writeFile({ fileName: "D:/Pi-Web/pi-web-src/Pi-Agent-xY.pptx" })
  .then(() => console.log("✅ PPT created: D:/Pi-Web/pi-web-src/Pi-Agent-xY.pptx"))
  .catch(err => console.error("Error:", err));
