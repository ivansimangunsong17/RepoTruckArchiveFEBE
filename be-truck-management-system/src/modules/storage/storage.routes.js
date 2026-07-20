import {
  listStorageTrashController,
  purgeStorageTrashController,
  restoreStorageTrashController,
} from './storage.controller.js';

export const storageRoutes = [
  {
    method: 'GET',
    path: '/api/storage/trash',
    permission: 'storage.manage',
    handler: listStorageTrashController,
  },
  {
    method: 'POST',
    path: '/api/storage/trash/:id/restore',
    permission: 'storage.manage',
    handler: restoreStorageTrashController,
  },
  {
    method: 'DELETE',
    path: '/api/storage/trash/:id',
    permission: 'storage.manage',
    handler: purgeStorageTrashController,
  },
];
