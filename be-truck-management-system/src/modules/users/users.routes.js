import {
  createUserController,
  getUserController,
  listUsersController,
  resetUserPasswordController,
  updateUserController,
  updateUserStatusController,
} from './users.controller.js';

export const userRoutes = [
  {
    method: 'GET',
    path: '/api/users',
    permission: 'user.read',
    handler: listUsersController,
  },
  {
    method: 'POST',
    path: '/api/users',
    permission: 'user.create',
    handler: createUserController,
  },
  {
    method: 'GET',
    path: '/api/users/:id',
    permission: 'user.read',
    handler: getUserController,
  },
  {
    method: 'PATCH',
    path: '/api/users/:id',
    permission: 'user.update',
    handler: updateUserController,
  },
  {
    method: 'PATCH',
    path: '/api/users/:id/status',
    permissions: ['user.disable', 'user.update'],
    handler: updateUserStatusController,
  },
  {
    method: 'POST',
    path: '/api/users/:id/reset-password',
    permission: 'user.reset_password',
    handler: resetUserPasswordController,
  },
];
