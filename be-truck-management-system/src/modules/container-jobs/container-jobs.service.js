import {
  generateContainerJobSpk,
  findContainerJobById,
  findContainerJobsPage,
  updateContainerJob,
} from './container-jobs.repository.js';

export function listContainerJobs(query) {
  return findContainerJobsPage({
    page: query.page,
    pageSize: query.pageSize,
    query: query.query || '',
    status: query.status || '',
  });
}

export async function getContainerJob(id) {
  const job = await findContainerJobById(id);
  if (!job) {
    const error = new Error('Container Job tidak ditemukan.');
    error.statusCode = 404;
    error.code = 'CONTAINER_JOB_NOT_FOUND';
    throw error;
  }
  return job;
}

export function saveContainerJob(id, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Payload Container Job harus berupa object.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const allowedStatuses = ['received', 'running', 'completed', 'cancelled'];
  if (payload.status && !allowedStatuses.includes(payload.status)) {
    const error = new Error('Status Container Job tidak valid.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (payload.status === 'completed' && !payload.completedAt) {
    const error = new Error('Waktu selesai wajib diisi untuk status selesai.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (payload.status === 'completed') {
    const missing = [
      !(payload.driver || payload.driverId) && 'driver',
      !(payload.plateNumber || payload.vehicleId) && 'truck',
      !payload.runningAt && 'waktu mulai',
      !payload.spkNumber && 'nomor SPK',
      !payload.loadingVoucher && 'nomor bon muat',
      !payload.unloadingVoucher && 'nomor bon bongkar',
      !payload.travelDocument && 'nomor surat jalan',
      !payload.weighingDocument && 'nomor surat timbang',
    ].filter(Boolean);

    if (missing.length) {
      const error = new Error(`Pekerjaan belum dapat diselesaikan. Lengkapi: ${missing.join(', ')}.`);
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  }

  return updateContainerJob(id, payload);
}

export function createContainerJobSpk(id, payload = {}) {
  return generateContainerJobSpk(id, payload);
}
