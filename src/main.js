import 'dotenv/config';

import readline from 'node:readline/promises';
import process from 'node:process';

import {
  launchBrowser,
  newPage,
  openIrctc,
  clickLoginRegister,
  detectLoginRegister,
  selectEnglishLanguage,
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

  log('[Agent] Starting browser...');
  const browser = await launchBrowser({ headless: false });
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
