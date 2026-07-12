import {
  createVehicleDocumentController,
  deleteVehicleDocumentController,
  downloadVehicleDocumentController,
  listVehicleDocumentsController,
  updateVehicleDocumentController,
} from './vehicle-documents.controller.js';

export const vehicleDocumentRoutes = [
  {
    method: 'GET',
    path: '/api/vehicles/:vehicleId/documents',
    permission: 'vehicle_document.read',
    handler: listVehicleDocumentsController,
  },
  {
    method: 'POST',
    path: '/api/vehicles/:vehicleId/documents',
    permission: 'vehicle_document.create',
    handler: createVehicleDocumentController,
  },
  {
    method: 'PUT',
    path: '/api/vehicles/:vehicleId/documents/:documentId',
    permission: 'vehicle_document.update',
    handler: updateVehicleDocumentController,
  },
  {
    method: 'DELETE',
    path: '/api/vehicles/:vehicleId/documents/:documentId',
    permission: 'vehicle_document.delete',
    handler: deleteVehicleDocumentController,
  },
  {
    method: 'GET',
    path: '/api/vehicles/:vehicleId/documents/:documentId/download',
    permission: 'vehicle_document.read',
    handler: downloadVehicleDocumentController,
  },
];
