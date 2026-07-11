import { sendSuccess } from '../../utils/apiResponse.js';
import {
  getMasterRow,
  listMasterRows,
  listMasterRowsPage,
  removeMasterRow,
  saveMasterRow,
} from './master.service.js';

export async function listMasterController(request, response) {
  const rows = await listMasterRows(request.params.resource);
  sendSuccess(response, rows);
}

export async function listMasterPageController(request, response) {
  const result = await listMasterRowsPage(request.params.resource, request.query);
  sendSuccess(response, result);
}

export async function getMasterController(request, response) {
  const row = await getMasterRow(request.params.resource, request.params.id);
  sendSuccess(response, row);
}

export async function createMasterController(request, response) {
  const saved = await saveMasterRow(request.params.resource, request.body);
  sendSuccess(response, saved, 'Data master berhasil disimpan.', 201);
}

export async function updateMasterController(request, response) {
  const saved = await saveMasterRow(request.params.resource, request.body, request.params.id);
  sendSuccess(response, saved, 'Data master berhasil diperbarui.');
}

export async function archiveMasterController(request, response) {
  await removeMasterRow(request.params.resource, request.params.id);
  sendSuccess(response, { id: request.params.id }, 'Data master berhasil diarsipkan.');
}
