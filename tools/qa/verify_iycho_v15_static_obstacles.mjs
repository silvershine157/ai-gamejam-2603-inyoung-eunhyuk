import process from 'node:process';
import { chromium } from 'playwright-core';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE_URL = 'http://127.0.0.1:8000';

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function loadDebugState(page) {
  return page.evaluate(() => window.__phase3Debug.getState());
}

async function run() {
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
  });

  const failures = [];
  const result = {
    oval: null,
    grandprix: null,
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    await page.goto(`${BASE_URL}/versions/iycho_v15/index.html?map=oval`, { waitUntil: 'load' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(4300);
    await page.mouse.click(640, 360);
    await page.keyboard.down('KeyX');
    await page.waitForTimeout(650);
    await page.keyboard.up('KeyX');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2200);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(500);

    result.oval = await loadDebugState(page);
    assertCondition(result.oval.activeMapId === 'oval', 'Oval map did not load', failures);
    assertCondition(result.oval.obstacleCount >= 3, 'Oval obstacle count is too low', failures);
    assertCondition(result.oval.obstacleHits >= 1, 'Oval obstacle collision was not recorded', failures);
    assertCondition(
      result.oval.obstacles.every((obstacle) => obstacle.colliderCount > 0),
      'Some oval obstacles have no colliders',
      failures
    );
    assertCondition(
      new Set(result.oval.obstacles.map((obstacle) => obstacle.id)).size === result.oval.obstacles.length,
      'Oval obstacle ids are not unique',
      failures
    );

    await page.goto(`${BASE_URL}/versions/iycho_v15/index.html?map=grandprix`, { waitUntil: 'load' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1000);
    result.grandprix = await loadDebugState(page);
    assertCondition(result.grandprix.activeMapId === 'grandprix', 'Grand Prix map did not load', failures);
    assertCondition(
      result.grandprix.trackValidation.centerlineIntersections === 0,
      'Grand Prix track self-intersection validation failed',
      failures
    );
    assertCondition(result.grandprix.obstacleCount >= 3, 'Grand Prix obstacle count is too low', failures);
    assertCondition(
      result.grandprix.obstacles.every((obstacle) => obstacle.colliderCount > 0),
      'Some grand prix obstacles have no colliders',
      failures
    );
  } finally {
    await browser.close();
  }

  const summary = {
    status: failures.length === 0 ? 'passed' : 'failed',
    failures,
    oval: result.oval
      ? {
          obstacleCount: result.oval.obstacleCount,
          obstacleHits: result.oval.obstacleHits,
          lastObstacleId: result.oval.lastObstacleId,
          lastCollision: result.oval.lastCollision,
        }
      : null,
    grandprix: result.grandprix
      ? {
          obstacleCount: result.grandprix.obstacleCount,
          centerlineIntersections: result.grandprix.trackValidation.centerlineIntersections,
        }
      : null,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await run();
