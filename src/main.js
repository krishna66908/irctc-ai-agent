import 'dotenv/config';

import readline from 'node:readline/promises';
import process from 'node:process';

import {
  launchBrowser,
  newPage,
  openIrctc,
  clickLoginRegister,
  detectLoginRegister,
  detectOtpSecurityCheckpoint,
  detectTestLoginOutcome,
  fillLoginCredentials,
  fillAndSelectStation,
  loadJourneyPreferences,
  selectEnglishLanguage,
  selectOtpInsteadOfCaptcha,
  submitSignIn,
  waitForLoggedInState,
} from './browser.js';

function log(message) {
  console.log(message);
}

function elapsedMs(startTime) {
  return Math.round(performance.now() - startTime);
}

function logPerformance(summary) {
  console.log('[Performance]');
  for (const [label, duration] of Object.entries(summary)) {
    console.log(`${label}: ${duration}ms`);
  }
}

async function waitForEnterToExit() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await rl.question('\nPress Enter to close the browser after you have verified the page. ');
  rl.close();
}

async function main() {
  const keepOpen = process.argv.includes('--keep-open');
  const channel = process.argv.includes('--system-chrome') ? 'chrome' : undefined;
  const testLogin = process.argv.includes('--test-login');
  const skipLogin = process.argv.includes('--skip-login');

  log('[Agent] Starting browser...');
  const browser = await launchBrowser({ headless: false, channel });
  const { context, page } = await newPage(browser);

  try {
    log('[Agent] Opening IRCTC...');
    const totalStart = performance.now();
    await openIrctc(page);

    log('[Agent] Observing page for language popup...');
    const languageStart = performance.now();
    const result = await selectEnglishLanguage(page);
    const languageMs = elapsedMs(languageStart);

    if (result.detected) {
      log('[Agent] Language popup detected.');
      log('[Agent] Selecting English...');
      log('[Agent] English selected and popup dismissed.');
    } else {
      log('[Agent] Language popup not detected; leaving the current page as-is.');
    }

    if (!skipLogin) {
      log('[Agent] Observing page for Login/Register...');
    const loginDetectionStart = performance.now();
    const loginControl = await detectLoginRegister(page);
    if (!loginControl) {
      throw new Error('Could not find a visible Login/Register control.');
    }
    log(`[Agent] Login/Register detected in ${elapsedMs(loginDetectionStart)}ms.`);
    log('[Agent] Opening login interface...');
    const loginInterfaceStart = performance.now();
    await clickLoginRegister(page, loginControl);
    log(`[Agent] Login interface detected in ${elapsedMs(loginInterfaceStart)}ms.`);

    if (testLogin) {
      log('[Agent] Running TEST LOGIN mode.');
    } else {
      log('[Agent] Reading login credentials from the environment...');
    }
    const credentials = await fillLoginCredentials(page, { testMode: testLogin });
    log(`[Agent] Username typed in ${credentials.usernameMs}ms.`);
    log(`[Agent] Password typed in ${credentials.passwordMs}ms.`);

    log('[Agent] Observing for the OTP-instead-of-CAPTCHA option...');
    const otpOptionStart = performance.now();
    const otpOptionSelected = await selectOtpInsteadOfCaptcha(page);
    if (otpOptionSelected) {
      log(`[Agent] OTP option selected in ${elapsedMs(otpOptionStart)}ms.`);
    } else {
      log(`[Agent] OTP option not detected after ${elapsedMs(otpOptionStart)}ms; continuing.`);
    }

    log('[Agent] Observing for SIGN IN...');
    const signInStart = performance.now();
    log('[Agent] Clicking SIGN IN...');
    await submitSignIn(page);
    const signInMs = elapsedMs(signInStart);
    log(`[Agent] SIGN IN detected and clicked in ${signInMs}ms.`);

    if (testLogin) {
      const outcome = await detectTestLoginOutcome(page);
      if (outcome === 'security') {
        log('[Agent] Security verification detected.');
        log('[Agent] Stopping test safely.');
      } else if (outcome === 'failure') {
        log('[Agent] Test login failed as expected.');
      } else {
        log('[Agent] Test login result was not detected within the observation window.');
        log('[Agent] Stopping test safely.');
      }

      logPerformance({
        'Language selection': languageMs,
        'Login/Register': elapsedMs(loginDetectionStart),
        'Login interface': elapsedMs(loginInterfaceStart),
        'Username typing': credentials.usernameMs,
        'Password typing': credentials.passwordMs,
        'OTP option': elapsedMs(otpOptionStart),
        'SIGN IN': signInMs,
        Total: elapsedMs(totalStart),
      });
      log('[Agent] TEST LOGIN COMPLETE.');
      log('[Agent] Stopping before OTP/train search/booking.');
      return;
    }

    await detectOtpSecurityCheckpoint(page);
    log('[Agent] Waiting for manual OTP/security verification...');
    console.log('[Human] Please complete the OTP/security verification manually in the browser.');
    await waitForLoggedInState(page);
      log('[Agent] Logged-in state detected.');
    } else {
      log('[Agent] --skip-login enabled; waiting for an authenticated page...');
      await waitForLoggedInState(page);
      log('[Agent] Logged-in state detected.');
    }

    const preferences = await loadJourneyPreferences();
    const fromStation = {
      code: preferences.journey.from,
      name: 'NEW DELHI',
    };
    log('[Agent] Observing journey search form...');
    log('[Agent] Observing origin From field...');
    log(`[Agent] Entering origin: ${fromStation.code}`);
    try {
      await fillAndSelectStation(page, 'From', fromStation, { diagnostic: true });
    } catch (error) {
      log('[Agent] From autocomplete selection failed.');
      log(`[Diagnostic] From selection error: ${error instanceof Error ? error.message : String(error)}`);
      log('[Agent] Browser left open for manual inspection.');
      await new Promise(() => {});
    }
    log('[Agent] Origin station selected and verified.');
    return;

    if (keepOpen) {
      log('[Agent] Browser is staying open for visual verification.');
      await waitForEnterToExit();
    }
  } catch (error) {
    log(`[Agent] Failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
