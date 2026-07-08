---
version: alpha
name: MiMo-design-analysis
description: A clean, modern SaaS developer portal with a "Warm Tech-Editorial" aesthetic. The site anchors on a warm off-white cream page background paired with high-contrast black typography, Georgia serif displays with italics for section heads, and a distinct electric-blue highlight color for tech-forward accents. The layout alternates between light warm surfaces and dark mode panels for developer code contexts, utilizing module-based CSS structures.
colors:
  primary: "#000000"
  primary-active: "#1a1a1a"
  primary-disabled: "#a3a3a3"
  highlight: "#249aff"
  ink: "#000000"
  body: "rgba(0, 0, 0, 0.55)"
  body-strong: "#000000"
  muted: "#666666"
  muted-soft: "#999999"
  hairline: "#f0ebe5"
  canvas: "#fcfaf8"
  surface-card: "#faf7f3"
  surface-section: "#f3eee8"
  surface-hover: "#f5efe6"
  surface-dark: "#0a0a0a"
  surface-dark-elevated: "#1a1a1a"
  surface-dark-border: "#2a2a2a"
  on-primary: "#ffffff"
  on-dark: "#ffffff"
  on-dark-soft: "#999999"
  warning: "#fda83a"

typography:
  display-xl:
    fontFamily: "Georgia, serif"
    fontSize: 120px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -2px
  display-lg:
    fontFamily: "Georgia, serif"
    fontSize: 48px
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: -1px
  display-md:
    fontFamily: "Georgia, serif"
    fontSize: 40px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.5px
  title-lg:
    fontFamily: "Inter, PingFang SC, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  title-md:
    fontFamily: "Inter, PingFang SC, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, PingFang SC, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, PingFang SC, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  code:
    fontFamily: "Geist Mono, Menlo, monospace"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  button:
    fontFamily: "inherit"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: 0
  nav-link:
    fontFamily: "inherit"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  sm: 6px
  md: 12px
  lg: 16px
  pill: 9999px
  full: 9999px

spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 48px
  section: 72px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 8px 32px
    height: 40px
  button-outline:
    backgroundColor: transparent
    border: "1px solid {colors.primary}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 8px 32px
    height: 40px
  button-primary-dark:
    backgroundColor: "{colors.on-dark}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 8px 32px
    height: 40px
  button-outline-dark:
    backgroundColor: transparent
    border: "1px solid {colors.surface-dark-border}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 8px 32px
    height: 40px
  top-nav:
    backgroundColor: transparent
    height: 54px
    padding: 4px 0
  hero-band:
    backgroundColor: "{colors.canvas}"
    padding: 72px 0
  model-card:
    backgroundColor: "{colors.on-primary}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.sm}"
    padding: 20px
  model-card-dark:
    backgroundColor: "{colors.surface-dark-elevated}"
    border: "1px solid {colors.surface-dark-border}"
    rounded: "{rounded.sm}"
    padding: 20px
  product-card:
    background: "linear-gradient(to bottom, #fbfbfb, #fff)"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.sm}"
    padding: 20px
  product-card-dark:
    background: "linear-gradient(to bottom, #1a1a1a, #111)"
    border: "1px solid {colors.surface-dark-border}"
    rounded: "{rounded.sm}"
    padding: 20px
  ecosystem-item:
    backgroundColor: "#f0f0f0"
    rounded: "{rounded.sm}"
    padding: 20px
  ecosystem-item-dark:
    backgroundColor: "{colors.surface-dark-elevated}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.sm}"
    padding: 20px
  update-card:
    background: "linear-gradient(to bottom, #fbfbfb, #fff)"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.sm}"
    padding: 20px
  update-card-dark:
    background: "linear-gradient(to bottom, #1a1a1a, #111)"
    border: "1px solid {colors.surface-dark-border}"
    rounded: "{rounded.sm}"
    padding: 20px
  tooltip:
    backgroundColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 16px 20px
    boxShadow: "0 4px 24px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.04)"
  footer:
    backgroundColor: "{colors.surface-dark}"
    padding: 48px 0
---

## Overview

Xiaomi MiMo (mimo.mi.com) is the official platform for Xiaomi's general intelligent large model services, focusing on providing developer-facing APIs, model catalogs, and developer resources for their "Human x Car x Home" (人车家全生态) ecosystem. 

The website utilizes a unique **Warm Tech-Editorial** design system. Similar to Claude's publication-like aesthetic, it anchors on a warm off-white cream page background (`{colors.canvas}`) paired with classic high-contrast black serif typography (Georgia italic) for headlines, while utilizing an electric, tech-forward blue (`{colors.highlight}`) for highlights and interactive elements. 

The system transitions seamlessly between two modes:
1. **Light Editorial Mode**: Built on warm cream backgrounds (`{colors.canvas}`) with warm beige cards (`{colors.surface-card}`), black borders, and dark body text.
2. **Dark Console Mode**: Activates inside specific sections (such as developer code blocks or dark mode variants) utilizing deep dark gray floors (`{colors.surface-dark}`), dark elevated panels (`{colors.surface-dark-elevated}`), and white text.

Visual interest is driven by a unique **clip-path split reveal transition** (`will-change: clip-path`) in the Hero section, which reveals light and dark interfaces side-by-side or sequentially, and an interactive Globe/Earth graphic that represents the global connectivity of Xiaomi's physical-cyber ecosystem.

**Key Characteristics:**
- Warm Cream Canvas Floor (`{colors.canvas}` — #fcfaf8) with dark warm-ink body text (`{colors.ink}` — #000000).
- Dual Atmosphere: Light Editorial and Dark Developer themes.
- Georgia serif typography in italic style (`--font-heading-style: italic`) for large display headlines, providing a literary, premium voice.
- Electric Tech-Blue Accent (`{colors.highlight}` — #249aff) for interactive links, active tabs, and highlighted details.
- High-contrast controls (pure black and pure white buttons).
- Modular Grid Layouts (Products, Models, Ecosystem, Voices, Updates) styled using CSS modules.
- Border radius is strictly uniform at `{rounded.sm}` (6px) for almost all layout blocks, cards, and buttons, maintaining a sharp, clean SaaS feeling, except for tooltips which utilize `{rounded.md}` (12px).

---

## Colors

### Brand & Accent
- **Primary Ink / Black** (`{colors.primary}` — #000000): The core branding color. Used for headings, primary button fills in light mode, primary text, and top nav text.
- **Tech-Blue Highlight** (`{colors.highlight}` — #249aff): The signature accent color. Used to signify active states, links, hover feedback, and highlight indicators. Represents technical innovation.
- **Warning / Orange** (`{colors.warning}` — #fda83a): Used for important deprecation notice banners or status callouts.

### Surface
- **Canvas** (`{colors.canvas}` — #fcfaf8): The main landing floor. A warm, cream off-white, designed to feel humanist and comfortable to read.
- **Surface Card** (`{colors.surface-card}` — #faf7f3): Card background for light mode elements. A step darker warm beige than the canvas.
- **Surface Section** (`{colors.surface-section}` — #f3eee8): Emphasized sections or dividers.
- **Surface Hover** (`{colors.surface-hover}` — #f5efe6): Background hover states for interactive items.
- **Hairline Border** (`{colors.hairline}` — #f0ebe5): A warm, soft border tone, avoiding harsh gray lines in light mode.
- **Surface Dark** (`{colors.surface-dark}` — #0a0a0a): Main page floor for dark sections and the footer.
- **Surface Dark Elevated** (`{colors.surface-dark-elevated}` — #1a1a1a): Elevated cards, code containers, and active tabs in dark sections.
- **Surface Dark Border** (`{colors.surface-dark-border}` — #2a2a2a): Border divider line in dark mode.

### Text
- **Ink / Primary Text** (`{colors.ink}` — #000000): Main headers and paragraphs in light mode.
- **Body / Secondary Text** (`{colors.body}` — rgba(0, 0, 0, 0.55)): Default desaturated color for descriptions, metadata, and muted paragraphs.
- **Muted Text** (`{colors.muted}` — #666666): Subheadings, inactive states, and tags in light mode.
- **Muted Soft Text** (`{colors.muted-soft}` — #999999): Captions, placeholders, and fine print in light mode.
- **On Primary** (`{colors.on-primary}` — #ffffff): White text on black primary buttons.
- **On Dark** (`{colors.on-dark}` — #ffffff): White text on dark canvas floors.
- **On Dark Soft** (`{colors.on-dark-soft}` — #999999): Secondary labels, body copy, and navigation links in dark sections.

---

## Typography

### Font Family
The system utilizes two distinct typographic voices:
1. **Georgia Serif (Italicized)**: Used for display headlines (Hero title, subtitle, section headers). The default layout sets `--font-main: Georgia, serif` and `--font-heading-style: italic`. This gives the platform a scholarly, editorial character.
2. **PingFang SC / Inter**: For running body text, labels, and buttons. When rendering Chinese text, the system overrides the display font to `--font-main: "PingFang SC", -apple-system, "MiSans", sans-serif` and sets `--font-heading-style: normal` to ensure legibility.
3. **Geist Mono / Menlo**: Monospace stack used for code snippets, token metrics, pricing values, and technical configurations.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 120px | 400 | 1.0 | -2.0px | Large Hero title (Georgia Italic) on wide desktop screens |
| `{typography.display-lg}` | 48px | 400 | 1.25 | -1.0px | Large Subtitles, Hero body statements |
| `{typography.display-md}` | 40px | 400 | 1.2 | -0.5px | Section headings (Voices section title, Updates section title) |
| `{typography.title-lg}` | 20px | 600 | 1.4 | 0 | Sub-section names, large stats labels |
| `{typography.title-md}` | 16px | 600 | 1.4 | 0 | Card titles (Model title, Product title) |
| `{typography.body-md}` | 14px | 400 | 1.7 | 0 | Running body copy, card description paragraphs |
| `{typography.body-sm}` | 13px | 400 | 1.6 | 0 | Secondary tags, notice banners, cookie consent text |
| `{typography.code}` | 16px | 400 | 1.5 | 0 | Pricing details, monospace code labels |
| `{typography.button}` | 14px | 500 | 1.0 | 0 | Button controls (primary and secondary text) |
| `{typography.nav-link}` | 14px | 500 | 1.5 | 0 | Header menu items, footer links |

---

## Layout

### Spacing System
- **Spacing scale:** `{spacing.xs}` (8px) · `{spacing.sm}` (12px) · `{spacing.md}` (16px) · `{spacing.lg}` (20px) · `{spacing.xl}` (24px) · `{spacing.xxl}` (48px).
- **Section Rhythm:** `{spacing.section}` (72px) top and bottom padding.
- **Card Padding:** `{spacing.lg}` (20px) internal padding for models, products, ecosystem, and updates cards.

### Grid & Container
- **Max Width:** Content caps at `{Home_homePageInner}` with `max-width: 1275px` (inner section max-width: 1260px).
- **Responsive Width:** Standard sections use `width: calc(100% - 56px)` with `margin: 0 auto`. This guarantees a minimum 28px margin buffer on both sides on desktop/tablet.
- **Column Grids:**
  - **Ecosystem integration grid:** 5 columns on desktop, stack to 1 column on mobile.
  - **Products showcase grid:** 4 columns on desktop, 2 columns on tablet, 1 column on mobile.
  - **Updates announcement grid:** 2 or 3 columns on desktop, stack to 1 column on mobile.
  - **Model cards list:** Flex row on desktop, flex column on mobile.

---

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | Solid `{colors.canvas}` or `{colors.surface-dark}` | Main page floor, top navigation bar, ecosystem grid background |
| Warm Border | 1px border using `{colors.hairline}` or `{colors.surface-dark-border}` | Model cards, product cards, updates cards, input fields |
| Floating / Elevated | 1px border + soft box shadow (`0 4px 24px rgba(0,0,0,.08)`) | Tooltips (Voices section), Cookie banner |

### Decorative Depth
- **Interactive Globe/Earth Video**: Placed in the Hero background, this canvas/video layer adds organic, three-dimensional motion, representing physical-cyber integration.
- **Linear Gradients**: Product cards (`{component.product-card}`) use a subtle vertical linear gradient from `#fbfbfb` to `#fff` (or `#1a1a1a` to `#111` in dark mode) to create a gentle sense of depth.

---

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.sm}` | 6px | Uniform border radius for CTA buttons, input boxes, model cards, product containers, and updates cards. |
| `{rounded.md}` | 12px | Tooltips, cookies banner, modal cards. |
| `{rounded.lg}` | 16px | Large layout sections. |
| `{rounded.pill}` | 9999px | Circle indicators, avatar containers, indicator badges. |

### Photography & Illustrations
- The site focuses heavily on **code and parameters** rather than marketing vectors.
- Layouts are dominated by screenshots of terminals, code editor windows, or API dashboard layouts, reinforcing the platform's developer-centric positioning.
- Model logos and brand logos are integrated directly as inline vector SVGs to preserve razor-sharp details.

---

## Components

### Top Navigation
- **`top-nav`**: A horizontal bar height of 54px with transparent or solid canvas backing. Contains the MiMo logo on the left, standard menu items (Research, Models, Updates, Contact Us) in the center, a language selector (中文/English), and a black primary button ("Use MiMo") on the right.

### Buttons
- **`button-primary`**: Pure black background (`{colors.primary}`), white text (`{colors.on-primary}`), border radius `{rounded.sm}` (6px), height 40px, padding `8px 32px`. Text is aligned center in `{typography.button}`.
- **`button-outline`**: Transparent background, black border `1px solid {colors.primary}`, black text, height 40px, border radius `{rounded.sm}` (6px), padding `8px 32px`.
- **`button-primary-dark`**: Used on dark floors. White background, black text.
- **`button-outline-dark`**: Used on dark floors. Transparent background, dark border `1px solid {colors.surface-dark-border}`, white text.

### Section Cards
- **`model-card`**: Base card showing model specifications. Background `{colors.on-primary}` (white), border `1px solid {colors.hairline}`, border radius `{rounded.sm}`. Internal padding `{spacing.lg}` (20px). Features:
  - Header: 200px tall illustration/vector display block.
  - Body: Model title in `{typography.title-md}`, description paragraph in `{typography.body-md}`, horizontal divider.
  - Pricing metrics: Tabs for Input/Output prices shown in monospace `Geist Mono` `{typography.code}`.
- **`product-card`**: Used to showcase developer products (like MiMo Code). Background vertical gradient from `#fbfbfb` to `#fff`, border radius `{rounded.sm}`, border `1px solid {colors.hairline}`, padding `{spacing.lg}`. Includes an outline action button.
- **`ecosystem-item`**: Horizontal card with gray backing `#f0f0f0` containing a icon and a bold label (such as "人" / "车" / "家"), with a background hover transition to represent ecosystem interconnectivity.
- **`update-card`**: Holds recent platform announcements. Card layout is identical to `{component.product-card}` with padding `{spacing.lg}` (20px).

### Tooltips & Overlays
- **`tooltip`**: Used inside the Voices section to hover over model properties or testimonials. Styled with background `{colors.on-primary}`, border radius `{rounded.md}` (12px), and a soft shadows pattern.

---

## Do's and Don'ts

### Do
- Maintain the warm off-white cream floor (`#fcfaf8`) as the main backdrop for landing pages to differentiate the brand from cold developer interfaces.
- Utilize Georgia serif in italic style for headers to give the product a literary, premium, and human-centric tone.
- Reserve `{colors.highlight}` (electric blue) for links, active selections, and highlights.
- Keep the border radius strict and uniform at `6px` across card components, CTAs, and inputs.
- Alternating page flows between light cream sections and dark mode cards.

### Don't
- Don't use standard neutral gray-white backgrounds. The warm cream floor is vital to the design aesthetic.
- Don't use Georgia italic headings for Chinese locales. Always fallback to sans-serif `PingFang SC` in normal style for Chinese text.
- Don't use heavy shadows on cards. Depth should come from borders (`{colors.hairline}`) and background color-blocking.
- Don't mix border radiuses. Avoid introducing round pill shapes for standard cards or inputs.

---

## Responsive Behavior

### Breakpoints
- **Mobile (< 768px)**: 
  - Hero Title collapses from `120px` to `24px` (wrapping text).
  - Navigation collapses to a mobile drawer menu.
  - Spacing section shrinks from `72px` to `16px`.
  - Column layouts (Products grid 4 columns, Ecosystem grid 5 columns, Updates grid 2/3 columns) all collapse to a single vertical column (`1fr`).
- **Tablet (768px - 1024px)**:
  - Products grid shifts to 2 columns.
  - Margins maintain a minimum width buffer of 28px on each side.
- **Desktop (1024px - 1440px)**:
  - Navigation menu stays fully expanded.
  - Grid structures expand to full column arrays (Products 4 cols, Ecosystem 5 cols, Updates 2/3 cols).
  - Content container caps at a maximum width of `1275px`.

---

## Iteration Guide

1. Standardize spacing variables to `{spacing.section}` (72px) and `{spacing.lg}` (20px) across new pages.
2. In light mode, ensure borders use `{colors.hairline}` (#f0ebe5) and shadows are kept to a minimum.
3. Keep headers in Georgia serif italic (or sans-serif PingFang SC for Chinese) and body copy in Inter/PingFang SC.
4. When writing code context blocks, wrap them in a `{component.model-card-dark}` containing `{colors.surface-dark}` (#0a0a0a) to isolate technical layouts from editorial pages.

---

## Known Gaps

- The custom fonts Geist Mono and MiSans are hosted on Xiaomi's servers and may not be accessible outside of their ecosystem. Substitutes are specified in the typography section.
- Clip-path split reveal animations require modern CSS configurations which might cause minor rendering differences on older browser versions.
- Interactive globe elements are loaded as dynamic video players, and static illustrations must be used as fallbacks on slow connection environments.
