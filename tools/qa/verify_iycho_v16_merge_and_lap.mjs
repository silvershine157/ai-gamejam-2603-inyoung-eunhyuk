import process from 'node:process';
import { chromium } from 'playwright-core';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE_URL = 'http://127.0.0.1:8000';

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function getState(page) {
  return page.evaluate(() => window.__iychoV16Debug.getState());
}

async function main() {
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
  });

  const failures = [];
  const result = {
    initial: null,
    afterLap: null,
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${BASE_URL}/versions/iycho_v16/index.html?map=oval`, { waitUntil: 'load' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(4200);

    result.initial = await getState(page);
    assertCondition(result.initial.activeMapId === 'oval', 'Oval map did not load', failures);
    assertCondition(result.initial.obstacleCount >= 3, 'Obstacle count is too low', failures);
    assertCondition(result.initial.rivals.length === 3, 'Rival count is incorrect', failures);
    assertCondition(
      result.initial.rivals.every((rival) => typeof rival.hp === 'number' && typeof rival.shotCooldown === 'number'),
      'Advanced rival fields are missing',
      failures
    );

    await page.evaluate(() => window.__iychoV16Debug.qaArmPlayerLapTracker());
    await page.waitForTimeout(50);
    for (const trackT of [0.38, 0.68, 0.88, 0.95, 0.99, 0.0]) {
      await page.evaluate((nextTrackT) => window.__iychoV16Debug.qaTeleportPlayer(nextTrackT), trackT);
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(120);

    result.afterLap = await getState(page);
    assertCondition(result.afterLap.lapCount === 1, 'First completed lap was not counted as lap 1', failures);
    assertCondition(result.afterLap.bestLap !== null, 'Best lap time was not recorded after first lap', failures);
  } finally {
    await browser.close();
  }

  const summary = {
    status: failures.length === 0 ? 'passed' : 'failed',
    failures,
    initial: result.initial
      ? {
          obstacleCount: result.initial.obstacleCount,
          rivalCount: result.initial.rivals.length,
          playerHP: result.initial.playerHP,
        }
      : null,
    afterLap: result.afterLap
      ? {
          lapCount: result.afterLap.lapCount,
          bestLap: result.afterLap.bestLap,
          lapTravel: result.afterLap.lapTravel,
        }
      : null,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
