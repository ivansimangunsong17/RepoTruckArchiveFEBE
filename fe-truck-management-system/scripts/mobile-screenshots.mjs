import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const baseUrl = (process.env.PW_BASE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const loginEmail = process.env.QA_EMAIL || 'operational@demo.com';
const loginPassword = process.env.QA_PASSWORD || 'password';
const adminEmail = process.env.QA_ADMIN_EMAIL || 'admin@demo.com';
const adminPassword = process.env.QA_ADMIN_PASSWORD || loginPassword;
const salesEmail = process.env.QA_SALES_EMAIL || 'sales@demo.com';
const salesPassword = process.env.QA_SALES_PASSWORD || loginPassword;
const financeEmail = process.env.QA_FINANCE_EMAIL || 'finance@demo.com';
const financePassword = process.env.QA_FINANCE_PASSWORD || loginPassword;
const viewerEmail = process.env.QA_VIEWER_EMAIL || 'pengamat@demo.com';
const viewerPassword = process.env.QA_VIEWER_PASSWORD || loginPassword;
const outputRoot = path.resolve(process.env.PW_SCREENSHOT_DIR || 'playwright-artifacts/mobile');
const headed = process.env.PW_HEADED === '1';
const navigationOptions = { waitUntil: 'domcontentloaded', timeout: 60000 };
const pageSettleMs = Number(process.env.PW_PAGE_SETTLE_MS || 700);
const modalSettleMs = Number(process.env.PW_MODAL_SETTLE_MS || 300);

const viewports = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
];

const operationalTargets = [
  { name: 'order-running', path: '/order-running', expectedText: 'Order Berjalan' },
  { name: 'operations', path: '/operations', expectedText: 'Container Job' },
  { name: 'operations-repo-storage', path: '/operations/repo-storage', expectedText: 'Container Titip' },
  { name: 'operations-incomplete-documents', path: '/operations/incomplete-documents', expectedText: 'Dokumen Belum Lengkap' },
];

const overviewTargets = [
  { name: 'weekly-orders', path: '/weekly-orders', expectedText: 'Order Mingguan' },
  { name: 'order-history', path: '/order-history', expectedText: 'Riwayat Order' },
  { name: 'profile-operational', path: '/profile', expectedText: 'Profil Saya' },
];

const masterTargets = [
  { name: 'master-trucks', path: '/trucks', expectedText: ['Daftar Truck', 'Master Truck'], email: adminEmail, password: adminPassword },
  { name: 'master-drivers', path: '/drivers', expectedText: ['Data Sopir', 'Daftar Sopir'], email: adminEmail, password: adminPassword },
  { name: 'master-clients', path: '/clients', expectedText: ['Master Client', 'Daftar Customer'], email: adminEmail, password: adminPassword },
  { name: 'master-chassis', path: '/kir-chassis', expectedText: ['Master Data Chassis', 'Daftar Data Chassis'], email: adminEmail, password: adminPassword },
  { name: 'master-depots', path: '/depots', expectedText: ['Master Depo', 'Daftar Depo'], email: adminEmail, password: adminPassword },
  { name: 'master-terminals', path: '/terminals', expectedText: ['Master Terminal', 'Daftar Terminal'], email: adminEmail, password: adminPassword },
  { name: 'master-destinations', path: '/destinations', expectedText: ['Master Lokasi Tujuan', 'Daftar Lokasi Tujuan'], email: adminEmail, password: adminPassword },
];

const adminWorkflowTargets = [
  { name: 'admin-users', path: '/users', expectedText: ['User Management', 'Daftar User'], email: adminEmail, password: adminPassword },
  { name: 'admin-settings', path: '/settings', expectedText: 'Kebutuhan Sistem', email: adminEmail, password: adminPassword },
  { name: 'admin-activity-log', path: '/activity-log', expectedText: 'Activity Log', email: adminEmail, password: adminPassword },
  { name: 'admin-historical-entry', path: '/historical-entry', expectedText: 'Input Data Lama', email: adminEmail, password: adminPassword },
  { name: 'admin-finance-corrections', path: '/finance/corrections', expectedText: 'Koreksi Finance', email: adminEmail, password: adminPassword },
];

const salesTargets = [
  { name: 'sales-orders', path: '/sales-orders', expectedText: 'Daftar Sales Order', email: salesEmail, password: salesPassword },
  { name: 'sales-customer-documents', path: '/sales/customer-documents', expectedText: ['Dokumen Customer', 'Dokumen Referensi Customer'], email: salesEmail, password: salesPassword },
];

const financeTargets = [
  { name: 'finance-order-verification', path: '/finance/order-verification', expectedText: ['Verifikasi Order', 'Order Verification'], email: financeEmail, password: financePassword },
  { name: 'finance-rpuj-approval', path: '/finance/rpuj-approval', expectedText: ['Approval RPUJ', 'Approval RPUJ / SPK'], email: financeEmail, password: financePassword },
  { name: 'finance-invoices', path: '/finance/invoices', expectedText: ['Input Nomor Invoice', 'Invoice'], email: financeEmail, password: financePassword },
  { name: 'finance-completed-trips', path: '/finance/completed-trips', expectedText: 'Perjalanan Selesai', email: financeEmail, password: financePassword },
  { name: 'finance-billing-readiness', path: '/finance/billing-readiness', expectedText: 'Kesiapan Tagihan', email: financeEmail, password: financePassword },
];

const observerTargets = [
  { name: 'observer-document-monitoring', path: '/document-monitoring', expectedText: 'Monitoring Dokumen & Waktu OFF', email: viewerEmail, password: viewerPassword },
  { name: 'observer-reports', path: '/reports', expectedText: ['Revenue Report', 'Detail Revenue Truck'], email: viewerEmail, password: viewerPassword },
];

async function isServerReady() {
  try {
    const response = await fetch(baseUrl, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

function startDevServer() {
  const url = new URL(baseUrl);
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
  const port = url.port || '5173';

  if (process.platform === 'win32') {
    return spawn(`npm run dev -- --host ${host} --port ${port}`, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'ignore',
      shell: true,
      windowsHide: true,
    });
  }

  return spawn(npmCommand, ['run', 'dev', '--', '--host', host, '--port', port], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'ignore',
    detached: false,
  });
}

function stopDevServer(child) {
  if (!child) return;
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  child.kill();
}

async function ensureDevServer() {
  if (await isServerReady()) return null;
  const child = startDevServer();
  const ready = await waitForServer();
  if (!ready) {
    stopDevServer(child);
    throw new Error(`Dev server tidak siap di ${baseUrl}. Jalankan npm run dev, lalu ulangi npm run qa:mobile.`);
  }
  return child;
}

async function waitForLoginOrTarget(page, target) {
  const emailInput = page.locator('input[type="email"]').first();
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10000) {
    if (await emailInput.isVisible().catch(() => false)) return 'login';
    if (await hasExpectedText(page, target)) return 'target';
    await page.waitForTimeout(250);
  }

  return 'unknown';
}

async function hasExpectedText(page, target) {
  const expectedTexts = Array.isArray(target.expectedText) ? target.expectedText : [target.expectedText];
  for (const text of expectedTexts.filter(Boolean)) {
    const matches = page.getByText(text, { exact: false });
    const count = await matches.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, 20); index += 1) {
      if (await matches.nth(index).isVisible().catch(() => false)) return true;
    }
  }
  return false;
}

async function loginIfNeeded(page, target) {
  const targetPath = target.path;
  const targetEmail = target.email || loginEmail;
  const targetPassword = target.password || loginPassword;
  const emailInput = page.locator('input[type="email"]').first();
  await waitForLoginOrTarget(page, target);

  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(targetEmail);
    await page.locator('input[type="password"]').first().fill(targetPassword);
    await Promise.all([
      page.waitForURL((url) => new URL(url).pathname !== '/login', { timeout: 20000 }).catch(() => {}),
      page.locator('button[type="submit"], button.primary-button').first().click(),
    ]);
    await page.waitForTimeout(modalSettleMs);
  }

  if (new URL(page.url()).pathname === '/login') {
    throw new Error(`Login gagal untuk ${targetEmail}. Set QA_EMAIL/QA_PASSWORD atau QA_ADMIN_EMAIL/QA_ADMIN_PASSWORD jika memakai akun lain.`);
  }

  if (new URL(page.url()).pathname !== targetPath) {
    await page.goto(`${baseUrl}${targetPath}`, navigationOptions);
  }
}

async function assertExpectedPage(page, target) {
  const pageNotFound = page.getByText('Page Not Found', { exact: false }).first();
  if (await pageNotFound.isVisible().catch(() => false)) {
    throw new Error(`Target ${target.path} membuka halaman 404. Cek PW_BASE_URL atau route aplikasi.`);
  }

  const loginForm = page.locator('input[type="email"]').first();
  if (await loginForm.isVisible().catch(() => false)) {
    throw new Error(`Target ${target.path} masih berada di halaman login. Cek QA_EMAIL dan QA_PASSWORD.`);
  }

  if (!(await hasExpectedText(page, target))) {
    const expectedTexts = Array.isArray(target.expectedText) ? target.expectedText.join('" atau "') : target.expectedText;
    throw new Error(`Target ${target.path} tidak menampilkan teks "${expectedTexts}".`);
  }
}

async function captureTarget(context, viewport, target) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}${target.path}`, navigationOptions);
  await loginIfNeeded(page, target);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(pageSettleMs);
  await assertExpectedPage(page, target);

  const viewportDir = path.join(outputRoot, viewport.name);
  await fs.mkdir(viewportDir, { recursive: true });
  const screenshotPath = path.join(viewportDir, `${target.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const clientWidth = root.clientWidth;
    return {
      title: document.title,
      path: window.location.pathname,
      clientWidth,
      scrollWidth,
      hasHorizontalScroll: scrollWidth > clientWidth + 1,
    };
  });

  await page.close();
  return { viewport: viewport.name, target: target.name, screenshotPath, ...metrics };
}

async function captureModalState(page, viewport, targetName, modalSelector) {
  const viewportDir = path.join(outputRoot, viewport.name);
  await fs.mkdir(viewportDir, { recursive: true });
  const screenshotPath = path.join(viewportDir, `${targetName}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const metrics = await page.evaluate((selector) => {
    const root = document.documentElement;
    const body = document.body;
    const modal = document.querySelector(selector);
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const clientWidth = root.clientWidth;
    const modalScrollWidth = modal ? modal.scrollWidth : 0;
    const modalClientWidth = modal ? modal.clientWidth : 0;

    return {
      title: document.title,
      path: window.location.pathname,
      clientWidth,
      scrollWidth,
      modalClientWidth,
      modalScrollWidth,
      hasHorizontalScroll: scrollWidth > clientWidth + 1 || modalScrollWidth > modalClientWidth + 1,
    };
  }, modalSelector);

  return { viewport: viewport.name, target: targetName, screenshotPath, ...metrics };
}

async function captureOperationalModals(context, viewport) {
  const page = await context.newPage();
  const results = [];
  const operationsTarget = { name: 'operations', path: '/operations', expectedText: 'Container Job' };

  await page.goto(`${baseUrl}${operationsTarget.path}`, navigationOptions);
  await loginIfNeeded(page, operationsTarget);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(pageSettleMs);
  await assertExpectedPage(page, operationsTarget);

  const updateButton = page.locator('button').filter({ hasText: /^Update$/ }).first();
  if (!(await updateButton.isVisible().catch(() => false))) {
    throw new Error('Tidak menemukan tombol Update di /operations untuk QA modal mobile.');
  }

  await updateButton.click();
  await page.locator('.operational-modal').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(modalSettleMs);
  results.push(await captureModalState(page, viewport, 'operations-update-preparation', '.operational-modal'));

  await page.getByRole('tab', { name: /Uang Jalan|SPK/i }).click();
  await page.waitForTimeout(modalSettleMs);
  results.push(await captureModalState(page, viewport, 'operations-update-rpuj', '.operational-modal'));

  await page.getByRole('tab', { name: /Dokumen|Closing/i }).click();
  await page.waitForTimeout(modalSettleMs);
  results.push(await captureModalState(page, viewport, 'operations-update-closing', '.operational-modal'));

  await page.locator('.operational-modal > header button').click();
  await page.locator('.operational-modal').waitFor({ state: 'hidden', timeout: 10000 });

  const detailButton = page.locator('.operations-page .container-row-actions .secondary-button').first();
  if (!(await detailButton.isVisible().catch(() => false))) {
    throw new Error('Tidak menemukan tombol Detail di /operations untuk QA modal mobile.');
  }

  await detailButton.click();
  await page.locator('.container-job-detail-modal').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(modalSettleMs);
  results.push(await captureModalState(page, viewport, 'operations-detail-modal', '.container-job-detail-modal'));

  await page.close();
  return results;
}

async function captureMasterModals(context, viewport) {
  const page = await context.newPage();
  const results = [];
  const masterTarget = {
    name: 'master-trucks',
    path: '/trucks',
    expectedText: 'Daftar Truck',
    email: adminEmail,
    password: adminPassword,
  };

  await page.goto(`${baseUrl}${masterTarget.path}`, navigationOptions);
  await loginIfNeeded(page, masterTarget);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(pageSettleMs);
  await assertExpectedPage(page, masterTarget);

  let detailButton = page.locator('.master-mobile-card button[aria-label^="Lihat"]').first();
  if (!(await detailButton.isVisible().catch(() => false))) {
    detailButton = page.locator('.master-table button[aria-label^="Lihat"]').first();
  }
  if (await detailButton.isVisible().catch(() => false)) {
    await detailButton.click();
    await page.locator('.master-detail-modal').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(modalSettleMs);
    results.push(await captureModalState(page, viewport, 'master-trucks-detail-modal', '.master-detail-modal'));
    await page.locator('.master-detail-modal .modal-close-button').click();
    await page.locator('.master-detail-modal').waitFor({ state: 'hidden', timeout: 10000 });
  }

  const createButton = page.getByRole('button', { name: /Input Truck Baru/i }).first();
  if (await createButton.isVisible().catch(() => false)) {
    await createButton.click();
    await page.locator('.master-modal').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(modalSettleMs);
    results.push(await captureModalState(page, viewport, 'master-trucks-form-modal', '.master-modal'));
  }

  await page.close();
  return results;
}

async function captureOverviewModals(context, viewport) {
  const results = [];

  const weeklyPage = await context.newPage();
  const weeklyTarget = { name: 'weekly-orders', path: '/weekly-orders', expectedText: 'Order Mingguan' };
  await weeklyPage.goto(`${baseUrl}${weeklyTarget.path}`, navigationOptions);
  await loginIfNeeded(weeklyPage, weeklyTarget);
  await weeklyPage.waitForLoadState('networkidle').catch(() => {});
  await weeklyPage.waitForTimeout(pageSettleMs);
  await assertExpectedPage(weeklyPage, weeklyTarget);

  const weeklyDetailButton = weeklyPage.locator('.weekly-detail-button:not([disabled])').first();
  if (await weeklyDetailButton.isVisible().catch(() => false)) {
    await weeklyDetailButton.click();
    await weeklyPage.locator('.weekly-order-detail-modal').waitFor({ state: 'visible', timeout: 10000 });
    await weeklyPage.waitForTimeout(modalSettleMs);
    results.push(await captureModalState(weeklyPage, viewport, 'weekly-order-detail-modal', '.weekly-order-detail-modal'));
  }
  await weeklyPage.close();

  const historyPage = await context.newPage();
  const historyTarget = { name: 'order-history', path: '/order-history', expectedText: 'Riwayat Order' };
  await historyPage.goto(`${baseUrl}${historyTarget.path}`, navigationOptions);
  await loginIfNeeded(historyPage, historyTarget);
  await historyPage.waitForLoadState('networkidle').catch(() => {});
  await historyPage.waitForTimeout(pageSettleMs);
  await assertExpectedPage(historyPage, historyTarget);

  const historyDetailButton = historyPage.locator('.order-history-action-button').first();
  if (await historyDetailButton.isVisible().catch(() => false)) {
    await historyDetailButton.click();
    await historyPage.locator('[aria-labelledby="order-history-detail-title"]').waitFor({ state: 'visible', timeout: 10000 });
    await historyPage.waitForTimeout(modalSettleMs);
    results.push(await captureModalState(historyPage, viewport, 'order-history-detail-modal', '[aria-labelledby="order-history-detail-title"]'));
  }
  await historyPage.close();

  return results;
}

async function captureSalesModals(context, viewport) {
  const page = await context.newPage();
  const results = [];
  const salesTarget = {
    name: 'sales-orders',
    path: '/sales-orders',
    expectedText: 'Daftar Sales Order',
    email: salesEmail,
    password: salesPassword,
  };

  await page.goto(`${baseUrl}${salesTarget.path}`, navigationOptions);
  await loginIfNeeded(page, salesTarget);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(pageSettleMs);
  await assertExpectedPage(page, salesTarget);

  const detailButton = page.locator('.sales-orders-page .order-summary-actions .secondary-button').first();
  if (await detailButton.isVisible().catch(() => false)) {
    await detailButton.click();
    await page.locator('.sales-order-modal').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(modalSettleMs);
    results.push(await captureModalState(page, viewport, 'sales-order-detail-modal', '.sales-order-modal'));
    await page.locator('.sales-order-modal > header button').click();
    await page.locator('.sales-order-modal').waitFor({ state: 'hidden', timeout: 10000 });
  }

  const createButton = page.getByRole('button', { name: /Input Sales Order|Buat Sales Order/i }).first();
  if (await createButton.isVisible().catch(() => false)) {
    await createButton.click();
    await page.locator('.sales-order-modal').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(modalSettleMs);
    results.push(await captureModalState(page, viewport, 'sales-order-form-modal', '.sales-order-modal'));
  }

  await page.close();
  return results;
}

async function captureFinanceModals(context, viewport) {
  const results = [];

  const rpujPage = await context.newPage();
  const rpujTarget = financeTargets.find((target) => target.name === 'finance-rpuj-approval');
  await rpujPage.goto(`${baseUrl}${rpujTarget.path}`, navigationOptions);
  await loginIfNeeded(rpujPage, rpujTarget);
  await rpujPage.waitForLoadState('networkidle').catch(() => {});
  await rpujPage.waitForTimeout(pageSettleMs);
  await assertExpectedPage(rpujPage, rpujTarget);

  const rpujDetailButton = rpujPage.locator('.finance-rpuj-table button').filter({ hasText: /^Detail$/ }).first();
  if (await rpujDetailButton.isVisible().catch(() => false)) {
    await rpujDetailButton.click();
    await rpujPage.locator('.finance-rpuj-detail-modal').waitFor({ state: 'visible', timeout: 10000 });
    await rpujPage.waitForTimeout(modalSettleMs);
    results.push(await captureModalState(rpujPage, viewport, 'finance-rpuj-detail-modal', '.finance-rpuj-detail-modal'));
    await rpujPage.locator('.finance-rpuj-detail-header button').click();
    await rpujPage.locator('.finance-rpuj-detail-modal').waitFor({ state: 'hidden', timeout: 10000 });
  }
  await rpujPage.close();

  const invoicePage = await context.newPage();
  const invoiceTarget = financeTargets.find((target) => target.name === 'finance-invoices');
  await invoicePage.goto(`${baseUrl}${invoiceTarget.path}`, navigationOptions);
  await loginIfNeeded(invoicePage, invoiceTarget);
  await invoicePage.waitForLoadState('networkidle').catch(() => {});
  await invoicePage.waitForTimeout(pageSettleMs);
  await assertExpectedPage(invoicePage, invoiceTarget);

  const invoiceDetailButton = invoicePage.locator('.finance-invoice-action-row .finance-table-action-button').first();
  if (await invoiceDetailButton.isVisible().catch(() => false)) {
    await invoiceDetailButton.click();
    await invoicePage.locator('.finance-invoice-detail-modal').waitFor({ state: 'visible', timeout: 10000 });
    await invoicePage.waitForTimeout(modalSettleMs);
    results.push(await captureModalState(invoicePage, viewport, 'finance-invoice-detail-modal', '.finance-invoice-detail-modal'));
  }
  await invoicePage.close();

  return results;
}

async function captureFinanceDashboardModals(context, viewport) {
  const page = await context.newPage();
  const results = [];
  const completedTarget = financeTargets.find((target) => target.name === 'finance-completed-trips');

  await page.goto(`${baseUrl}${completedTarget.path}`, navigationOptions);
  await loginIfNeeded(page, completedTarget);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(pageSettleMs);
  await assertExpectedPage(page, completedTarget);

  const detailButton = page.locator('.finance-dashboard-page .finance-master-table button').filter({ hasText: /^Detail$/ }).first();
  if (await detailButton.isVisible().catch(() => false)) {
    await detailButton.click();
    await page.locator('.finance-dashboard-detail-modal').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(modalSettleMs);
    results.push(await captureModalState(page, viewport, 'finance-completed-trip-detail-modal', '.finance-dashboard-detail-modal'));
  }

  await page.close();
  return results;
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const devServer = await ensureDevServer();
  const browser = await chromium.launch({ headless: !headed });
  const results = [];

  try {
    for (const viewport of viewports) {
      const operationalContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });

      for (const target of operationalTargets) {
        results.push(await captureTarget(operationalContext, viewport, target));
      }

      for (const target of overviewTargets) {
        results.push(await captureTarget(operationalContext, viewport, target));
      }

      results.push(...await captureOperationalModals(operationalContext, viewport));
      results.push(...await captureOverviewModals(operationalContext, viewport));
      await operationalContext.close();

      const adminContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });

      for (const target of masterTargets) {
        results.push(await captureTarget(adminContext, viewport, target));
      }

      for (const target of adminWorkflowTargets) {
        results.push(await captureTarget(adminContext, viewport, target));
      }

      results.push(...await captureMasterModals(adminContext, viewport));
      await adminContext.close();

      const salesContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });

      for (const target of salesTargets) {
        results.push(await captureTarget(salesContext, viewport, target));
      }

      results.push(...await captureSalesModals(salesContext, viewport));
      await salesContext.close();

      const financeContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });

      for (const target of financeTargets) {
        results.push(await captureTarget(financeContext, viewport, target));
      }

      results.push(...await captureFinanceModals(financeContext, viewport));
      results.push(...await captureFinanceDashboardModals(financeContext, viewport));
      await financeContext.close();

      const observerContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });

      for (const target of observerTargets) {
        results.push(await captureTarget(observerContext, viewport, target));
      }

      await observerContext.close();
    }
  } finally {
    await browser.close();
    stopDevServer(devServer);
  }

  const manifestPath = path.join(outputRoot, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({
    baseUrl,
    createdAt: new Date().toISOString(),
    results,
  }, null, 2));

  const scrollIssues = results.filter((item) => item.hasHorizontalScroll);
  console.log(`Mobile screenshots tersimpan di ${outputRoot}`);
  console.log(`Manifest: ${manifestPath}`);
  if (scrollIssues.length) {
    console.log('Horizontal scroll terdeteksi:');
    scrollIssues.forEach((item) => {
      console.log(`- ${item.viewport} ${item.target}: ${item.scrollWidth}px > ${item.clientWidth}px`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
