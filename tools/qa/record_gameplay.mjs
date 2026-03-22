import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const DEFAULT_EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';
const DEFAULT_VERSION = 'v12';
const DEFAULT_SCENARIO_FILE = path.join('tools', 'qa', 'scenarios', 'v12-mapselect-smoke.json');

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    version: DEFAULT_VERSION,
    scenarioFile: DEFAULT_SCENARIO_FILE,
    outDir: path.join('qa-output'),
    executablePath: DEFAULT_EDGE_PATH,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    headless: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--url') {
      options.url = next;
      i += 1;
    } else if (arg === '--base-url') {
      options.baseUrl = next;
      i += 1;
    } else if (arg === '--version') {
      options.version = next;
      i += 1;
    } else if (arg === '--scenario') {
      options.scenarioFile = next;
      i += 1;
    } else if (arg === '--out-dir') {
      options.outDir = next;
      i += 1;
    } else if (arg === '--executable-path') {
      options.executablePath = next;
      i += 1;
    } else if (arg === '--width') {
      options.width = Number(next);
      i += 1;
    } else if (arg === '--height') {
      options.height = Number(next);
      i += 1;
    } else if (arg === '--headed') {
      options.headless = false;
    } else if (arg === '--headless') {
      options.headless = true;
    } else if (arg === '--help') {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node tools/qa/record_gameplay.mjs [options]

Options:
  --version <name>         Version folder under /versions (default: v12)
  --url <full-url>         Full target URL, overrides --base-url/--version
  --base-url <url>         Server base URL (default: http://127.0.0.1:8000)
  --scenario <file>        Scenario JSON path
  --out-dir <dir>          Output directory root
  --executable-path <path> Browser executable path
  --width <px>             Viewport width
  --height <px>            Viewport height
  --headed                 Run with visible browser window
  --headless               Run headless (default)
  --help                   Show this help
`);
}

function timestampString() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

async function ensureFileExists(filePath, message) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(message);
  }
}

async function loadScenario(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const scenario = JSON.parse(raw);
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    throw new Error(`Scenario has no steps: ${filePath}`);
  }
  return scenario;
}

async function assertUrlReachable(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Failed to reach ${url}. Start a local server first. Original error: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Target URL returned ${response.status}: ${url}`);
  }
}

async function runStep(page, step, stepLog) {
  const startedAt = Date.now();
  const entry = {
    label: step.label ?? step.type,
    type: step.type,
    startedAt,
  };

  if (step.type === 'wait') {
    await page.waitForTimeout(step.ms ?? 500);
  } else if (step.type === 'wait_for_selector') {
    await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 15000 });
  } else if (step.type === 'click') {
    if (step.selector) {
      await page.click(step.selector);
    } else {
      await page.mouse.click(step.x ?? 0, step.y ?? 0, {
        button: step.button ?? 'left',
        clickCount: step.clickCount ?? 1,
      });
    }
    if (step.expectNavigation) {
      await page.waitForLoadState('load');
      await page.waitForTimeout(step.navigationWaitMs ?? 600);
    }
    if (step.ms) {
      await page.waitForTimeout(step.ms);
    }
  } else if (step.type === 'tap') {
    await page.keyboard.press(step.key);
    if (step.ms) {
      await page.waitForTimeout(step.ms);
    }
  } else if (step.type === 'hold') {
    const keys = step.keys ?? [];
    for (const key of keys) {
      await page.keyboard.down(key);
    }
    await page.waitForTimeout(step.ms ?? 500);
    for (const key of [...keys].reverse()) {
      await page.keyboard.up(key);
    }
  } else {
    throw new Error(`Unsupported step type: ${step.type}`);
  }

  entry.endedAt = Date.now();
  entry.durationMs = entry.endedAt - startedAt;
  stepLog.push(entry);
}

function shouldIgnoreConsoleMessage(message) {
  return (
    message.type() === 'error' &&
    message.text().includes('404') &&
    message.location().url?.endsWith('/favicon.ico')
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const targetUrl = options.url ?? `${options.baseUrl.replace(/\/$/, '')}/versions/${options.version}/index.html`;
  const scenarioPath = path.resolve(options.scenarioFile);
  const outputRoot = path.resolve(options.outDir);
  const runId = `${options.version}-${timestampString()}`;
  const runDir = path.join(outputRoot, runId);
  const videoDir = path.join(runDir, 'video');
  const screenshotPath = path.join(runDir, 'final-frame.png');
  const reportPath = path.join(runDir, 'report.json');

  await ensureFileExists(
    options.executablePath,
    `Browser executable not found: ${options.executablePath}`
  );
  await ensureFileExists(
    scenarioPath,
    `Scenario file not found: ${scenarioPath}`
  );
  await assertUrlReachable(targetUrl);

  const scenario = await loadScenario(scenarioPath);
  await fs.mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: options.executablePath,
    headless: options.headless,
  });

  const context = await browser.newContext({
    viewport: {
      width: options.width,
      height: options.height,
    },
    recordVideo: {
      dir: videoDir,
      size: {
        width: options.width,
        height: options.height,
      },
    },
  });

  const page = await context.newPage();
  const video = page.video();
  const consoleMessages = [];
  const pageErrors = [];
  const stepLog = [];

  page.on('console', (message) => {
    if (shouldIgnoreConsoleMessage(message)) {
      return;
    }
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });

  page.on('pageerror', (error) => {
    pageErrors.push({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  });

  let finalVideoPath = null;
  let status = 'passed';

  try {
    await page.goto(targetUrl, { waitUntil: 'load' });
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.mouse.click(Math.floor(options.width / 2), Math.floor(options.height / 2));
    await page.evaluate(() => document.body.focus());

    for (const step of scenario.steps) {
      await runStep(page, step, stepLog);
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: screenshotPath });
  } catch (error) {
    status = 'failed';
    pageErrors.push({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  } finally {
    await context.close();
    if (video) {
      const recordedPath = await video.path();
      finalVideoPath = path.join(runDir, 'session.webm');
      await fs.rename(recordedPath, finalVideoPath);
    }
    await browser.close();
  }

  if (pageErrors.length > 0) {
    status = 'failed';
  }

  const report = {
    status,
    runId,
    targetUrl,
    scenario: {
      name: scenario.name ?? path.basename(scenarioPath),
      description: scenario.description ?? '',
      source: scenarioPath,
    },
    browser: {
      executablePath: options.executablePath,
      headless: options.headless,
      viewport: {
        width: options.width,
        height: options.height,
      },
    },
    artifacts: {
      videoPath: finalVideoPath,
      screenshotPath,
    },
    steps: stepLog,
    consoleMessages,
    pageErrors,
  };

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`QA run: ${status}`);
  console.log(`URL: ${targetUrl}`);
  console.log(`Video: ${finalVideoPath}`);
  console.log(`Screenshot: ${screenshotPath}`);
  console.log(`Report: ${reportPath}`);

  if (status !== 'passed') {
    process.exitCode = 1;
  }
}

await main();
