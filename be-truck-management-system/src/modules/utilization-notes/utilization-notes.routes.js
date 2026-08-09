import {
  deleteUtilizationNoteController,
  listUtilizationNotesController,
  upsertUtilizationNoteController,
} from './utilization-notes.controller.js';

export const utilizationNoteRoutes = [
  {
    method: 'GET',
    path: '/api/utilization-notes',
    permissions: ['report.read', 'container_job.read'],
    handler: listUtilizationNotesController,
  },
  {
    method: 'PUT',
    path: '/api/utilization-notes',
    permissions: ['container_job.update', 'container_job.update_status'],
    handler: upsertUtilizationNoteController,
  },
  {
    method: 'DELETE',
    path: '/api/utilization-notes/:id',
    permissions: ['container_job.update', 'container_job.update_status'],
    handler: deleteUtilizationNoteController,
  },
];
