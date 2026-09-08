import { chromium } from 'playwright';

export const IRCTC_URL = 'https://www.irctc.co.in/nget/train-search';

async function fixedDelay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function typeHumanLike(locator, value) {
  await locator.click();

  for (let index = 0; index < value.length; index += 1) {
    await locator.pressSequentially(value[index]);
    if (index < value.length - 1) {
      await fixedDelay(155);
    }
  }
}

export async function launchBrowser({ headless = false, channel } = {}) {
  return chromium.launch({
    headless,
    ...(channel ? { channel } : {}),
  });
}

export async function newPage(browser) {
  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 900,
    },
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
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const locator of locatorCandidates) {
      if (await locator.isVisible().catch(() => false)) {
        return locator.first();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 75));
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
  await fixedDelay(1000);
  await englishControl.click();

  await popup.waitFor({ state: 'hidden', timeout: 15000 });

  return { detected: true, selected: true };
}

export async function detectLoginRegister(page) {
  const loginCandidates = [
    page.locator('a:visible').filter({
      hasText: /LOGIN\s*\/\s*REGISTER/i,
    }),
    page.locator('a:visible[aria-label*="Login"]'),
    page.locator('a:visible.search_btn.loginText'),
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

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [usernameVisible, passwordVisible] = await Promise.all([
      usernameField.isVisible().catch(() => false),
      passwordField.isVisible().catch(() => false),
    ]);

    if (usernameVisible && passwordVisible) {
      return loginDialog;
    }

    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  return null;
}

export async function clickLoginRegister(page, loginControl = null) {
  const control = loginControl ?? await detectLoginRegister(page);
  if (!control) {
    throw new Error('Could not find a visible Login/Register control.');
  }

  await control.scrollIntoViewIfNeeded();
  await fixedDelay(2000);
  await control.click();

  const loginInterface = await detectLoginInterface(page);
  if (!loginInterface) {
    throw new Error('Login/Register was clicked, but the login interface did not appear.');
  }

  return loginInterface;
}

export async function fillLoginCredentials(page, { testMode = false } = {}) {
  const username = testMode
    ? 'TEST_INVALID_USER_123456'
    : process.env.IRCTC_USERNAME;
  const password = testMode
    ? 'TEST_INVALID_PASSWORD_123456'
    : process.env.IRCTC_PASSWORD;

  if (!username) {
    throw new Error('IRCTC_USERNAME is not configured.');
  }

  if (!password) {
    throw new Error('IRCTC_PASSWORD is not configured.');
  }

  const usernameField = page.getByRole('textbox', { name: /user\s*name|username/i });
  await usernameField.waitFor({ state: 'visible', timeout: 15000 });

  const usernameStart = performance.now();
  await typeHumanLike(usernameField, username);
  const usernameMs = Math.round(performance.now() - usernameStart);
  await fixedDelay(900);

  const passwordField = page.getByRole('textbox', { name: /password/i });
  await passwordField.waitFor({ state: 'visible', timeout: 15000 });

  const passwordStart = performance.now();
  await typeHumanLike(passwordField, password);
  const passwordMs = Math.round(performance.now() - passwordStart);

  return { usernameMs, passwordMs };
}

export async function detectTestLoginOutcome(page, timeoutMs = 15000) {
  const securityCandidates = [
    page.getByText(/captcha|otp verification|enter otp|security verification|verification code/i),
    page.getByRole('textbox', { name: /otp|verification code/i }),
  ];
  const failureCandidates = [
    page.getByText(/invalid user(?:name| name)?|invalid credentials|login failed|incorrect password/i),
    page.getByRole('alert').filter({ hasText: /invalid|failed|incorrect|error/i }),
  ];
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const locator of securityCandidates) {
      if (await locator.isVisible().catch(() => false)) {
        return 'security';
      }
    }

    for (const locator of failureCandidates) {
      if (await locator.isVisible().catch(() => false)) {
        return 'failure';
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  return null;
}

export async function selectOtpInsteadOfCaptcha(page) {
  const checkboxCandidates = [
    page.getByRole('checkbox', { name: /booking using otp|visually impaired|otp.*captcha/i }),
    page.getByLabel(/visually impaired.*receive otp instead of captcha/i),
    page.locator('#otpLogin'),
  ];
  const checkbox = await firstVisible(checkboxCandidates, 5000);

  if (!checkbox) {
    return false;
  }

  const interactionCandidates = [
    page.locator('label[for="otpLogin"]:visible'),
    page.locator('#otpLogin').locator('xpath=ancestor::label[1]'),
    page.getByText(/visually impaired.*receive otp instead of captcha/i),
    page.locator('#otpLogin'),
  ];
  const deadline = Date.now() + 3000;

  while (Date.now() < deadline) {
    if (await page.locator('#otpLogin').isChecked().catch(() => false)) {
      return true;
    }

    for (const interaction of interactionCandidates) {
      if (!(await interaction.isVisible().catch(() => false))) {
        continue;
      }

      try {
        await interaction.click({ timeout: 1000 });
        if (await page.locator('#otpLogin').isChecked().catch(() => false)) {
          return true;
        }
      } catch {
        // Angular may replace the checkbox while the interaction is in progress.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  throw new Error('OTP-instead-of-CAPTCHA checkbox was found but could not be selected.');
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
