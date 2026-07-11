import { changePasswordController, loginController, logoutController, meController } from './auth.controller.js';

export const authRoutes = [
  {
    method: 'POST',
    path: '/api/auth/login',
    public: true,
    handler: loginController,
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    authOnly: true,
    handler: logoutController,
  },
  {
    method: 'POST',
    path: '/api/auth/change-password',
    authOnly: true,
    handler: changePasswordController,
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    authOnly: true,
    handler: meController,
  },
];
