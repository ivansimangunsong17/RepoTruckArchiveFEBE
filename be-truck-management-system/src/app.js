import { createServer } from 'node:http';
import { env } from './config/env.js';
import { isDatabaseEnabled, query } from './db/client.js';
import { authorizeRoute } from './middlewares/auth.middleware.js';
import { handleError } from './middlewares/error.middleware.js';
import { activityLogRoutes } from './modules/activity-logs/activity-logs.routes.js';
import { attachmentRoutes } from './modules/attachments/attachments.routes.js';
import { archiveRoutes } from './modules/archive/archive.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { containerJobRoutes } from './modules/container-jobs/container-jobs.routes.js';
import { financeRoutes } from './modules/finance/finance.routes.js';
import { historicalEntryRoutes } from './modules/historical-entry/historical-entry.routes.js';
import { masterRoutes } from './modules/master/master.routes.js';
import { reportRoutes } from './modules/reports/reports.routes.js';
import { salesOrderRoutes } from './modules/sales-orders/sales-orders.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';
import { storageRoutes } from './modules/storage/storage.routes.js';
import { isStorageBackupInProgress } from './modules/storage/storage-files.js';
import { userRoutes } from './modules/users/users.routes.js';
import { vehicleDocumentRoutes } from './modules/vehicle-documents/vehicle-documents.routes.js';
import { sendSuccess, sendError } from './utils/apiResponse.js';

const routes = [
  {
    method: 'GET',
    path: '/health',
    public: true,
    handler: async (_request, response) => {
      let database = { configured: isDatabaseEnabled, status: isDatabaseEnabled ? 'unknown' : 'disabled' };
      if (isDatabaseEnabled) {
        try {
          await query('select 1');
          database = { configured: true, status: 'ok' };
        } catch (error) {
          database = { configured: true, status: 'error', message: error.message };
        }
      }

      sendSuccess(response, {
        status: 'ok',
        service: 'be-truck-management-system',
        database,
        timestamp: new Date().toISOString(),
      });
    },
  },
  ...authRoutes,
  ...userRoutes,
  ...attachmentRoutes,
  ...activityLogRoutes,
  ...archiveRoutes,
  ...salesOrderRoutes,
  ...containerJobRoutes,
  ...financeRoutes,
  ...historicalEntryRoutes,
  ...masterRoutes,
  ...vehicleDocumentRoutes,
  ...reportRoutes,
  ...storageRoutes,
  ...settingsRoutes,
];
const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function resolveCorsOrigin(requestOrigin) {
  if (env.corsOrigins.includes('*')) return '*';
  if (requestOrigin && env.corsOrigins.includes(requestOrigin)) return requestOrigin;
  return env.corsOrigins[0] || 'http://localhost:5173';
}

function applyCors(request, response) {
  response.setHeader('Access-Control-Allow-Origin', resolveCorsOrigin(request.headers.origin));
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Vary', 'Origin');
}

async function parseBody(request) {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return null;

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    const error = new Error('Body request harus berupa JSON valid.');
    error.statusCode = 400;
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function matchRoutePath(routePath, pathname) {
  const routeParts = routePath.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (routeParts.length !== pathParts.length) return null;

  return routeParts.reduce((params, part, index) => {
    if (params === null) return null;
    if (part.startsWith(':')) return { ...params, [part.slice(1)]: decodeURIComponent(pathParts[index]) };
    return part === pathParts[index] ? params : null;
  }, {});
}

function findRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchRoutePath(route.path, pathname);
    if (params) return { ...route, params };
  }
  return null;
}

export function createApp() {
  return createServer(async (request, response) => {
    applyCors(request, response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const route = findRoute(request.method, url.pathname);

      if (!route) {
        sendError(response, { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' }, 404);
        return;
      }

      request.query = Object.fromEntries(url.searchParams.entries());
      request.params = route.params || {};
      authorizeRoute(route, request);
      if (mutationMethods.has(request.method) && await isStorageBackupInProgress()) {
        const error = new Error('Backup lokal sedang berjalan. Perubahan data dibuka kembali setelah backup selesai.');
        error.statusCode = 503;
        error.code = 'BACKUP_IN_PROGRESS';
        response.setHeader('Retry-After', '120');
        throw error;
      }
      request.body = await parseBody(request);
      await route.handler(request, response);
    } catch (error) {
      handleError(response, error);
    }
  });
}
