import { chromium } from 'playwright';

export const IRCTC_URL = 'https://www.irctc.co.in/nget/train-search';

export async function launchBrowser({ headless = false, channel } = {}) {
  return chromium.launch({
    headless,
    ...(channel ? { channel } : {}),
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

export async function detectLoginRegister(page) {
  const loginCandidates = [
    page.getByRole('link', { name: /login\s*\/?\s*register/i }),
    page.getByRole('link', { name: /click here to login in application/i }),
    page.getByRole('button', { name: /login\s*\/?\s*register/i }),
    page.getByText(/^LOGIN\s*\/\s*REGISTER$/i),
    page.locator('a:has(i.fa-user)'),
    page.locator('a').filter({ has: page.locator('i.fa-user') }),
    page.locator('button').filter({ has: page.locator('i.fa-user') }),
  ];

  return firstVisible(loginCandidates, 5000);
}

export async function detectLoginInterface(page) {
  const loginDialog = await firstVisible([
    page.getByRole('dialog', { name: /login/i }),
    page.getByText(/^LOGIN$/i),
  ], 15000);

  if (!loginDialog) {
    return null;
  }

  const usernameField = page.getByRole('textbox', { name: /user\s*name|username/i });
  const passwordField = page.getByRole('textbox', { name: /password/i });

  try {
    await usernameField.waitFor({ state: 'visible', timeout: 5000 });
    await passwordField.waitFor({ state: 'visible', timeout: 5000 });
    return loginDialog;
  } catch {
    return null;
  }
}

export async function clickLoginRegister(page, loginControl = null) {
  const control = loginControl ?? await detectLoginRegister(page);
  if (!control) {
    throw new Error('Could not find a visible Login/Register control.');
  }

  await control.scrollIntoViewIfNeeded();
  await control.click();

  const loginInterface = await detectLoginInterface(page);
  if (!loginInterface) {
    throw new Error('Login/Register was clicked, but the login interface did not appear.');
  }

  return loginInterface;
}

export async function fillLoginCredentials(page) {
  const username = process.env.IRCTC_USERNAME;
  const password = process.env.IRCTC_PASSWORD;

  if (!username) {
    throw new Error('IRCTC_USERNAME is not configured.');
  }

  if (!password) {
    throw new Error('IRCTC_PASSWORD is not configured.');
  }

  const usernameField = page.getByRole('textbox', { name: /user\s*name|username/i });
  await usernameField.waitFor({ state: 'visible', timeout: 15000 });

  await usernameField.fill(username);

  const passwordField = page.getByRole('textbox', { name: /password/i });
  await passwordField.waitFor({ state: 'visible', timeout: 15000 });

  await passwordField.fill(password);
}

export async function selectOtpInsteadOfCaptcha(page) {
  const checkbox = await firstVisible([
    page.getByRole('checkbox', { name: /booking using otp|visually impaired|otp.*captcha/i }),
    page.getByLabel(/visually impaired.*receive otp instead of captcha/i),
  ], 5000);

  if (!checkbox) {
    return false;
  }

  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }

  return true;
}

export async function submitSignIn(page) {
  const signIn = await firstVisible([
    page.getByRole('button', { name: /sign\s*in/i }),
    page.getByText(/^SIGN\s*IN$/i),
  ], 15000);

  if (!signIn) {
    throw new Error('Could not find a visible SIGN IN control.');
  }

  await signIn.click();
}

export async function detectOtpSecurityCheckpoint(page) {
  return firstVisible([
    page.getByText(/otp verification|enter otp|security verification|verification code/i),
    page.getByRole('textbox', { name: /otp|verification code/i }),
  ], 15000);
}

export async function waitForLoggedInState(page) {
  await page.waitForFunction(() => {
    const bodyText = document.body.innerText.toLowerCase();
    const loginDialog = Array.from(document.querySelectorAll('[role="dialog"]'))
      .some((dialog) => /login/i.test(dialog.textContent || '') &&
        getComputedStyle(dialog).visibility !== 'hidden');
    const authenticatedIndicator = /\b(logout|sign out|my account|profile)\b/i.test(bodyText);

    return !loginDialog && authenticatedIndicator;
  }, undefined, { timeout: 10 * 60 * 1000 });
}
