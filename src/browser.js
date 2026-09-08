import { chromium } from 'playwright';

export const IRCTC_URL = 'https://www.irctc.co.in/nget/train-search';

export async function launchBrowser({ headless = false } = {}) {
  return chromium.launch({
    headless,
  });
}

export async function newPage(browser) {
  const context = await browser.newContext({
    viewport: null,
  });

  const page = await context.newPage();
  return { context, page };
}

export async function openIrctc(page) {
  await page.goto(IRCTC_URL, {
    waitUntil: 'domcontentloaded',
  });
}

async function firstVisible(locatorCandidates, timeoutMs = 1500) {
  for (const locator of locatorCandidates) {
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      return locator.first();
    } catch {
      // Try the next semantic candidate.
    }
  }

  return null;
}

export async function detectLanguagePopup(page) {
  const popupCandidates = [
    page.getByText(/please select your preferred language/i),
    page.getByText(/select your preferred language/i),
  ];

  return firstVisible(popupCandidates, 15000);
}

export async function findEnglishControl(page) {
  const englishCandidates = [
    page.getByRole('button', { name: /^English$/i }),
    page.getByRole('link', { name: /^English$/i }),
    page.getByRole('radio', { name: /^English$/i }),
    page.getByRole('menuitem', { name: /^English$/i }),
    page.getByText(/^English$/i),
  ];

  return firstVisible(englishCandidates, 3000);
}

export async function selectEnglishLanguage(page) {
  const popup = await detectLanguagePopup(page);
  if (!popup) {
    return { detected: false, selected: false };
  }

  const englishControl = await findEnglishControl(page);
  if (!englishControl) {
    throw new Error('Could not find an English control for the language popup.');
  }

  await englishControl.scrollIntoViewIfNeeded();
  await englishControl.click();

  await popup.waitFor({ state: 'hidden', timeout: 15000 });

  return { detected: true, selected: true };
}
