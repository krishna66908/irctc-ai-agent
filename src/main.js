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
  fillLoginCredentials,
  selectEnglishLanguage,
  selectOtpInsteadOfCaptcha,
  submitSignIn,
  waitForLoggedInState,
} from './browser.js';

function log(message) {
  console.log(message);
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

  log('[Agent] Starting browser...');
  const browser = await launchBrowser({ headless: false, channel });
  const { context, page } = await newPage(browser);

  try {
    log('[Agent] Opening IRCTC...');
    await openIrctc(page);

    log('[Agent] Observing page for language popup...');
    const result = await selectEnglishLanguage(page);

    if (result.detected) {
      log('[Agent] Language popup detected.');
      log('[Agent] Selecting English...');
      log('[Agent] English selected and popup dismissed.');
    } else {
      log('[Agent] Language popup not detected; leaving the current page as-is.');
    }

    log('[Agent] Observing page for Login/Register...');
    const loginControl = await detectLoginRegister(page);
    if (!loginControl) {
      throw new Error('Could not find a visible Login/Register control.');
    }
    log('[Agent] Login/Register detected.');
    log('[Agent] Opening login interface...');
    await clickLoginRegister(page, loginControl);
    log('[Agent] Login interface detected.');

    log('[Agent] Reading login credentials from the environment...');
    await fillLoginCredentials(page);
    log('[Agent] Username and password fields filled.');

    log('[Agent] Observing for the OTP-instead-of-CAPTCHA option...');
    const otpOptionSelected = await selectOtpInsteadOfCaptcha(page);
    if (otpOptionSelected) {
      log('[Agent] OTP-instead-of-CAPTCHA option selected.');
    } else {
      log('[Agent] OTP-instead-of-CAPTCHA option not detected; continuing.');
    }

    log('[Agent] Observing for SIGN IN...');
    await submitSignIn(page);
    log('[Agent] SIGN IN submitted.');
    await detectOtpSecurityCheckpoint(page);
    log('[Agent] Waiting for manual OTP/security verification...');
    console.log('[Human] Please complete the OTP/security verification manually in the browser.');
    await waitForLoggedInState(page);
    log('[Agent] Logged-in state detected.');

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
