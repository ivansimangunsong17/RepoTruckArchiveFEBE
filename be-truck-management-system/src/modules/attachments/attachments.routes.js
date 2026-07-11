import {
  deleteAttachmentController,
  downloadAttachmentController,
  listAttachmentsController,
  updateAttachmentController,
  uploadAttachmentController,
} from './attachments.controller.js';

export const attachmentRoutes = [
  {
    method: 'GET',
    path: '/api/attachments',
    permission: 'document.read',
    handler: listAttachmentsController,
  },
  {
    method: 'POST',
    path: '/api/attachments/upload',
    permission: 'document.upload',
    handler: uploadAttachmentController,
  },
  {
    method: 'PATCH',
    path: '/api/attachments/:id',
    permission: 'document.upload',
    handler: updateAttachmentController,
  },
  {
    method: 'DELETE',
    path: '/api/attachments/:id',
    permission: 'document.delete',
    handler: deleteAttachmentController,
  },
  {
    method: 'GET',
    path: '/api/attachments/:id',
    permission: 'document.read',
    handler: downloadAttachmentController,
  },
];
