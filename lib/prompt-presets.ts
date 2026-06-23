export interface PromptPreset {
  id: string;
  caseId?: number;
  name: string;
  category: string;
  description?: string;
  template: string;
  imagePath?: string | null;
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: "ecommerce-perfume",
    name: "奢侈品香水广告",
    category: "电商主图",
    description: "高端香水产品摄影，大理石台面 + 金色光效",
    template: `A luxurious cinematic product photograph of a classic rectangular perfume bottle inspired by {argument name="品牌标签" default="N°5 CHANEL PARFUM"}, placed upright on a glossy black marble surface with white veining. The bottle is centered slightly to the right, made of clear faceted glass with a large transparent crystal stopper, filled with rich amber-gold perfume that glows from within. Tiny condensation droplets cover the glass, adding texture and realism. Dramatic warm lighting from the upper left creates golden highlights, deep reflections on the marble, and a soft luminous bloom in the background. Wisps of elegant smoke curl around the bottle on both sides, enhancing a moody high-end advertisement feel. Dark background, shallow depth of field, ultra-detailed studio product photography, luxury beauty campaign aesthetic, crisp focus on the bottle, realistic reflections, warm black-and-gold color palette. Add a small white {argument name="角标 Logo" default="Brand"} in the top-right corner. Square composition, premium commercial ad, photorealistic, high contrast, refined and sophisticated.`,
  },
  {
    id: "ecommerce-skincare",
    name: "护肤品柔光棚拍",
    category: "电商主图",
    description: "护肤品瓶身 + 泡沫花瓣 + 柔和渐变背景",
    template: `A soft {argument name="瓶身颜色" default="cream-colored"} bottle with a {argument name="泵头颜色" default="pastel yellow"} pump stands on a matte podium, surrounded by silky foam and {argument name="装饰花卉" default="chamomile blossoms"}. The background is a pale yellow gradient with subtle bubble details. The label emphasizes organic chamomile and calming care. Fresh chamomile flowers accentuate the gentle appeal. Studio product photography, soft diffused lighting, clean composition, commercial ad aesthetic.`,
  },
  {
    id: "ecommerce-9grid",
    name: "电商九宫格故事板",
    category: "电商主图",
    description: "产品多角度展示的九宫格排版",
    template: `A professional e-commerce product showcase sheet with a 3x3 grid layout. Each cell shows the {argument name="产品名称" default="product"} from a different angle or in a different context: top-left is a front-facing hero shot, top-center shows the side profile, top-right displays the back with labels, middle-left shows the product in use, center is a macro detail shot of {argument name="重点细节" default="texture and craftsmanship"}, middle-right shows size comparison, bottom-left shows packaging, bottom-center shows the product with accessories, bottom-right shows a lifestyle context. Clean white background, consistent soft studio lighting, realistic product photography, high resolution, commercial catalog aesthetic, uniform cell spacing.`,
  },
  {
    id: "poster-city",
    name: "城市宣传海报",
    category: "海报",
    description: "城市地标 + 丝绸/水墨双重曝光风格",
    template: `A striking {argument name="季节" default="Spring 2026"} city poster for {argument name="城市名" default="Shanghai"} with an elegant celebratory mood and bold contemporary design. On a clean off-white textured background with large areas of negative space, a miniature scene of iconic landmarks unfolds: {argument name="地标建筑" default="the Bund skyline, Yu Garden, Oriental Pearl Tower"}. The composition uses a flowing silk ribbon that transforms into a panoramic cityscape, with soft morning fog and golden light. Rich detail, layered depth, sophisticated city-poster aesthetics, fresh and refined. Elegant typography reads "{argument name="标题文字" default="SPRING 2026"}" with a vertical slogan "{argument name="宣传语" default="A City of Memory and Innovation"}", premium graphic design, {argument name="画面比例" default="9:16"}.`,
  },
  {
    id: "poster-travel",
    name: "复古旅行海报",
    category: "海报",
    description: "1960 年代复古旅行海报风格",
    template: `Vintage travel poster illustration of {argument name="目的地" default="the Amalfi Coast, Italy"}, panoramic coastal cliff road scene, classic 1960s white car driving along a curved seaside road, deep blue Mediterranean sea with small sailboats, colorful pastel hillside village, bright blue sky with soft clouds, {argument name="前景装饰" default="lemon tree branches with vibrant yellow lemons"} framing the foreground, warm summer sunlight, bold vibrant colors, retro 1950s travel poster style, cinematic composition, high detail, screen print texture, graphic illustration. Hand-drawn style with loose strokes and defined contours, high-contrast color palette, contemporary and decorative aesthetic.`,
  },
  {
    id: "ad-creative-soda",
    name: "饮料广告海报",
    category: "广告创意",
    description: "热带风格饮料瓶广告 + 水花飞溅",
    template: `Create a vibrant tropical commercial poster for a {argument name="饮料类型" default="citrus soda"} bottle, in a bright summer advertising style. Show a single large bottle centered slightly to the right, tilted a little left, covered in cold condensation droplets, filled with glowing {argument name="液体颜色" default="golden-orange"} liquid. The label should feature {argument name="标签元素" default="sliced oranges and citrus artwork"} with the brand text "{argument name="品牌名" default="FreshPop"}". Use a sunny beach background with vivid blue sky, turquoise ocean, soft clouds, and blurred tropical palm leaves. Add dramatic water splashes around the base of the bottle, scattered clear ice cubes, and fresh fruit pieces in the foreground. Place large promotional text: a huge headline "{argument name="主标题" default="FRESH & NATURAL"}" with a subtitle underneath. Lighting should be glossy and high-energy with strong sun flare, saturated colors, crisp packaging detail, realistic droplets, and polished supermarket-ad realism.`,
  },
  {
    id: "ui-dashboard",
    name: "UI 仪表盘截图",
    category: "UI 设计",
    description: "现代 SaaS 仪表盘界面设计",
    template: `A modern SaaS dashboard UI design screenshot for {argument name="应用名称" default="Analytics Pro"}. The layout features a dark sidebar navigation on the left with {argument name="导航项数" default="6"} menu items and a user avatar at the bottom. The main content area has a top header bar with search and notification icons. Below are 4 metric cards showing KPIs with sparkline charts. The center section contains a large area chart showing {argument name="数据指标" default="monthly active users"} trends over 12 months, with a gradient fill. Below that is a data table with sortable columns. The right sidebar shows recent activity feed. Color scheme uses {argument name="主色调" default="deep navy blue (#1a1a2e)"} with {argument name="强调色" default="electric blue (#4361ee)"} accents. Clean typography, subtle shadows, rounded corners, modern glassmorphism elements, pixel-perfect UI design, 4K resolution, Figma-quality layout.`,
  },
  {
    id: "ui-mobile",
    name: "移动端 App 界面",
    category: "UI 设计",
    description: "iOS 风格移动端 App 多屏展示",
    template: `A premium mobile app UI showcase for {argument name="App 名称" default="FitTrack"} – a {argument name="App 类型" default="fitness tracking"} application. Display 3 iPhone mockups in a floating perspective arrangement. The left phone shows the onboarding screen with a gradient background in {argument name="品牌色" default="coral and purple"} and a motivational headline. The center phone (largest, front) shows the main dashboard with circular progress rings, daily stats cards, and a bottom tab bar. The right phone shows a detail screen with a weekly chart and achievement badges. Clean white background with subtle geometric shapes, soft shadows beneath each device, modern sans-serif typography, iOS Human Interface Guidelines compliant, Dribbble-quality presentation, high fidelity mockup.`,
  },
  {
    id: "portrait-editorial",
    name: "时尚人像摄影",
    category: "人像",
    description: "杂志级时尚人像 + 电影感光影",
    template: `An editorial fashion portrait photograph of a {argument name="人物描述" default="young woman with sharp cheekbones and natural makeup"}, wearing a {argument name="服装描述" default="tailored black blazer over a white silk blouse"}. Shot in a {argument name="拍摄环境" default="minimalist white studio"} with {argument name="光照类型" default="soft directional window light from the left creating gentle shadows on the right side of the face"}. The pose is {argument name="姿态" default="three-quarter view, chin slightly lifted, looking off-camera with a confident relaxed expression"}. Shallow depth of field with a {argument name="背景描述" default="clean neutral background"} softly blurred. Color grading is {argument name="色调风格" default="muted warm tones with slight desaturation"}, film grain texture, medium format camera aesthetic, high-end fashion magazine editorial style, Vogue-quality photography, detailed skin texture, natural and refined.`,
  },
  {
    id: "character-3d",
    name: "3D 角色设计",
    category: "角色",
    description: "皮克斯风格 3D 角色渲染",
    template: `A Pixar-style 3D rendered character of a {argument name="角色描述" default="friendly robot with round blue eyes and a small antenna on its head"}. The character has {argument name="外观特征" default="a chubby rounded body made of smooth white metal with orange accent panels, short stubby arms, and wheeled feet"}. The expression is {argument name="表情" default="cheerful and curious with a slight head tilt"}. Set in a {argument name="场景环境" default="cozy workshop with warm ambient lighting, scattered tools and gears on wooden shelves"} in the background. Soft global illumination, subsurface scattering on plastic materials, Pixar-quality render, clean composition, studio lighting with a key light from upper left and soft fill from the right, 3D character design, toy-like proportions, appealing and huggable design, 4K resolution.`,
  },
];

export function getPresetCategories(): string[] {
  const cats = new Set<string>();
  for (const p of PROMPT_PRESETS) cats.add(p.category);
  return [...cats];
}
