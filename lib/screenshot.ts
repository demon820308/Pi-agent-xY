import { chromium, type Browser } from 'playwright';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

export async function captureScreenshot(
  url: string,
  options?: { width?: number; height?: number; fullPage?: boolean },
): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: {
      width: options?.width ?? 1440,
      height: options?.height ?? 900,
    },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait a bit for any animations/fonts to load
    await page.waitForTimeout(1500);

    const buffer = await page.screenshot({
      type: 'png',
      fullPage: options?.fullPage ?? false,
    });

    return `data:image/png;base64,${buffer.toString('base64')}`;
  } finally {
    await context.close();
  }
}

export async function captureMultiViewport(
  url: string,
): Promise<{ desktop: string; tablet: string; mobile: string }> {
  const browser = await getBrowser();

  const viewports = [
    { name: 'desktop' as const, width: 1440, height: 900 },
    { name: 'tablet' as const, width: 768, height: 1024 },
    { name: 'mobile' as const, width: 375, height: 812 },
  ];

  const results: Record<string, string> = {};

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);
      const buffer = await page.screenshot({ type: 'png', fullPage: false });
      results[vp.name] = `data:image/png;base64,${buffer.toString('base64')}`;
    } finally {
      await context.close();
    }
  }

  return { desktop: results.desktop, tablet: results.tablet, mobile: results.mobile };
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
