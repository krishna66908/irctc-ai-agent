import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

export const IRCTC_URL = 'https://www.irctc.co.in/nget/train-search';

async function fixedDelay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function typeHumanLike(locator, value) {
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

export async function loadJourneyPreferences() {
  const configUrl = new URL('../config/preferences.example.json', import.meta.url);
  return JSON.parse(await readFile(configUrl, 'utf8'));
}

export async function detectStationInput(page, stationLabel) {
  const labelPattern = new RegExp(`^${stationLabel}$`, 'i');
  const stationCandidates = [
    ...(stationLabel === 'From'
      ? [page.locator('[aria-label="Enter From station. Input is Mandatory."]:visible')]
      : []),
    page.getByRole('combobox', { name: labelPattern }),
    page.getByRole('textbox', { name: labelPattern }),
    page.getByLabel(labelPattern),
    page.locator(`input[placeholder*="${stationLabel}" i]:visible`),
    page.locator(`input[aria-label*="${stationLabel}" i]:visible`),
  ];

  return firstVisible(stationCandidates, 15000);
}

function stationPattern(station) {
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `${escapeRegex(station.name)}\\s*-\\s*${escapeRegex(station.code)}\\s*\\(${escapeRegex(station.name)}\\)`,
    'i',
  );
}

async function logAutocompleteDiagnostics(page, station, pattern, candidates) {
  const relevantText = new RegExp(`${station.code}|${station.name}|journey|station`, 'i');
  const visibleDetails = (elements, relevantTextSource) => {
    const relevantText = new RegExp(relevantTextSource, 'i');

    return elements
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        rect.width > 0 && rect.height > 0;
    })
    .map((element) => ({
      tag: element.tagName,
      text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
      id: element.id || null,
      className: String(element.className || ''),
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
      ariaSelected: element.getAttribute('aria-selected'),
      disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
      href: element.getAttribute('href'),
      clickable: element.matches('a,button,li,[role="option"],[role="button"]'),
      ancestors: (() => {
        const result = [];
        let current = element.parentElement;
        while (current && result.length < 6) {
          result.push({
            tag: current.tagName,
            id: current.id || null,
            className: String(current.className || ''),
            role: current.getAttribute('role'),
            clickable: current.matches('a,button,li,[role="option"],[role="button"]'),
          });
          current = current.parentElement;
        }
        return result;
      })(),
      box: (() => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      })(),
    }))
    .filter((detail) => relevantText.test(detail.text))
    .slice(0, 80);
  };

  const containers = await page.locator(
    '[role="listbox"], [role="option"], ul, .ui-autocomplete, .autocomplete, .dropdown-menu',
  ).evaluateAll(visibleDetails, relevantText.source, { timeout: 1000 });
  const relevantElements = await page.locator('body *').evaluateAll(
    visibleDetails,
    relevantText.source,
    { timeout: 1000 },
  );
  const visibleOptions = await snapshotVisibleOptions(
    page,
    '[role="option"].ui-autocomplete-list-item',
  );

  console.log(`[Diagnostic] Station pattern: ${pattern}`);
  console.log(`[Diagnostic] Visible autocomplete containers: ${JSON.stringify(containers)}`);
  console.log(`[Diagnostic] Visible station-related elements: ${JSON.stringify(relevantElements)}`);
  console.log(`[Diagnostic] Visible station options (${visibleOptions.length}): ${JSON.stringify(visibleOptions)}`);

  for (const [description, locator] of candidates) {
    const count = await locator.count();
    let visibleCount = 0;
    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible().catch(() => false)) {
        visibleCount += 1;
      }
    }
    console.log(`[Diagnostic] ${description}: count=${count}, visible=${visibleCount}`);
  }
}

async function snapshotVisibleOptions(page, selector) {
  return page.evaluate((optionSelector) => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        rect.width > 0 && rect.height > 0;
    };

    return Array.from(document.querySelectorAll(optionSelector))
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          textContent: element.textContent,
          outerHTML: element.outerHTML,
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          isVisible: true,
          isEnabled: !element.hasAttribute('disabled') &&
            element.getAttribute('aria-disabled') !== 'true',
        };
      });
  }, selector);
}

async function detectStationSuggestion(page, station, { diagnostic = false } = {}) {
  const pattern = stationPattern(station);
  const suggestionCandidates = [
    [
      'visible station list item',
      page.locator('[role="option"].ui-autocomplete-list-item:visible').filter({ hasText: pattern }),
    ],
    ['role option', page.getByRole('option').filter({ hasText: pattern })],
    ['visible role option', page.locator('[role="option"]:visible').filter({ hasText: pattern })],
    ['visible list item', page.locator('li:visible').filter({ hasText: pattern })],
    ['text match', page.getByText(pattern)],
  ];

  if (diagnostic) {
    try {
      await logAutocompleteDiagnostics(page, station, pattern, suggestionCandidates);
    } catch (error) {
      console.log(`[Diagnostic] Autocomplete snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    for (const [, locator] of suggestionCandidates) {
      const count = await locator.count();
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (!(await candidate.isVisible().catch(() => false))) {
          continue;
        }

        const text = (await candidate.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (pattern.test(text) && !/journeys|→|->/i.test(text)) {
          return candidate;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  return null;
}

async function verifyStationInput(field, station) {
  const deadline = Date.now() + 5000;
  const expectedCode = station.code.toUpperCase();
  const expectedName = station.name.toUpperCase();

  while (Date.now() < deadline) {
    const value = (await field.inputValue().catch(() => '')).toUpperCase();
    if (value.includes(expectedCode) && value.includes(expectedName)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  return false;
}

async function logFromFieldDiagnostics(page, field) {
  const details = await field.evaluate((element) => {
    const active = document.activeElement;
    return {
      tag: element.tagName,
      id: element.id || null,
      name: element.getAttribute('name'),
      placeholder: element.getAttribute('placeholder'),
      value: element.value,
      expanded: element.getAttribute('aria-expanded'),
      activeDescendant: element.getAttribute('aria-activedescendant'),
      visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length),
      enabled: !element.disabled && element.getAttribute('aria-disabled') !== 'true',
      activeElement: {
        tag: active?.tagName || null,
        id: active?.id || null,
        className: active?.className ? String(active.className) : null,
      },
    };
  }, undefined, { timeout: 1000 }).catch(() => null);

  console.log(`[Diagnostic] From input state: ${JSON.stringify(details)}`);
}

async function logKeyboardSelectionDiagnostics(page, field) {
  const visibleOptions = await snapshotVisibleOptions(page, '[role="option"]');

  const fieldState = await field.evaluate((element) => ({
    value: element.value,
    expanded: element.getAttribute('aria-expanded'),
    activeDescendant: element.getAttribute('aria-activedescendant'),
    activeElement: document.activeElement?.outerHTML || null,
  }));

  console.log(`[Diagnostic] Before Enter field state: ${JSON.stringify(fieldState)}`);
  console.log(`[Diagnostic] Before Enter visible options: ${JSON.stringify(visibleOptions)}`);
}

function isTargetStationText(text, station) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.includes(`${station.name} - ${station.code}`) &&
    normalized.includes(`(${station.name})`) &&
    !/journeys|➨|→|->|stations/i.test(normalized);
}

async function readHighlightedOption(page, field) {
  return field.evaluate((input) => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        rect.width > 0 && rect.height > 0;
    };

    const activeDescendant = input.getAttribute('aria-activedescendant');
    const options = Array.from(document.querySelectorAll('[role="option"]'))
      .filter(isVisible)
      .map((element) => ({
        id: element.id || null,
        text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
        className: String(element.className || ''),
        ariaSelected: element.getAttribute('aria-selected'),
      }));
    const highlighted = options.find((option) =>
      (activeDescendant && option.id === activeDescendant) ||
      option.ariaSelected === 'true' ||
      /ui-state-active|\bactive\b|\bselected\b/i.test(option.className));

    return {
      inputValue: input.value,
      activeDescendant,
      highlighted: highlighted || null,
      options,
    };
  }, undefined, { timeout: 1000 });
}

async function waitForHighlightedOptionChange(page, field, previousKey, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;

  while (Date.now() < deadline) {
    latest = await readHighlightedOption(page, field);
    const highlighted = latest.highlighted;
    const key = highlighted && `${highlighted.id}|${highlighted.text}|${highlighted.className}`;
    if (highlighted && key !== previousKey) {
      return { state: latest, key };
    }

    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  return { state: latest, key: null };
}

export async function fillAndSelectStation(page, stationLabel, station, { diagnostic = false } = {}) {
  const field = await detectStationInput(page, stationLabel);
  if (!field) {
    throw new Error(`Could not find the visible ${stationLabel} station input.`);
  }

  await field.scrollIntoViewIfNeeded();
  await typeHumanLike(field, station.code);

  const suggestion = await detectStationSuggestion(page, station, { diagnostic });
  if (!suggestion) {
    throw new Error(
      `Could not find the ${station.name} - ${station.code} station suggestion for ${stationLabel}.`,
    );
  }

  const fromField = await detectStationInput(page, stationLabel);
  if (!fromField) {
    throw new Error(`Could not re-detect the visible ${stationLabel} station input.`);
  }

  console.log(`[Diagnostic] From value after typing: ${await fromField.inputValue()}`);
  try {
    await logFromFieldDiagnostics(page, fromField);
  } catch (error) {
    console.log(`[Diagnostic] From input snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  await fromField.focus();
  console.log(`[Diagnostic] From input focused: ${await fromField.evaluate((element) => document.activeElement === element)}`);

  const maxNavigationAttempts = 25;
  let highlightedState = await readHighlightedOption(page, fromField);
  let highlighted = highlightedState.highlighted;
  let highlightedKey = highlighted && `${highlighted.id}|${highlighted.text}|${highlighted.className}`;

  for (let attempt = 0; attempt <= maxNavigationAttempts; attempt += 1) {
    console.log(`[Diagnostic] Highlighted option before key ${attempt}: ${JSON.stringify(highlighted)}`);
    if (highlighted && isTargetStationText(highlighted.text, station)) {
      break;
    }

    if (attempt === maxNavigationAttempts) {
      throw new Error(`Could not highlight ${station.name} - ${station.code} within ${maxNavigationAttempts} ArrowDown attempts.`);
    }

    await fromField.press('ArrowDown');
    const next = await waitForHighlightedOptionChange(page, fromField, highlightedKey);
    highlightedState = next.state;
    highlighted = highlightedState?.highlighted || null;
    highlightedKey = next.key;
  }

  await fromField.press('Enter');

  const verifiedField = await detectStationInput(page, stationLabel);
  const finalValue = verifiedField ? await verifiedField.inputValue().catch(() => '') : '';
  console.log(`[Diagnostic] From value after Enter: ${finalValue}`);
  const selected = Boolean(verifiedField && await verifyStationInput(verifiedField, station));
  if (!selected) {
    throw new Error(`The selected ${stationLabel} station could not be verified.`);
  }
}
