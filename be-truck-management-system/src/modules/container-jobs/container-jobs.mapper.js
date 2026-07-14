function mapAttachmentFile(attachment) {
  return attachment
    ? {
        name: attachment.fileName || '',
        size: attachment.fileSize == null ? 0 : Number(attachment.fileSize),
        type: attachment.mimeType || '',
        path: attachment.id,
        storagePath: attachment.storagePath || '',
      }
    : null;
}

export function mapContainerJob(row, attachments = []) {
  const assignment = row.assignment_snapshot || {};
  const attachmentMap = attachments.reduce((map, attachment) => {
    map[attachment.category] = attachment;
    return map;
  }, {});
  const otherDocuments = attachments
    .filter((attachment) => attachment.category === 'otherDocument')
    .map((attachment) => ({
      name: attachment.notes || attachment.referenceNumber || attachment.fileName || 'Other Document',
      file: mapAttachmentFile(attachment),
    }));

  return {
    id: row.id,
    orderId: row.sales_order_id,
    soNumber: row.so_number,
    doNumber: row.do_number,
    customer: row.customer_name,
    shipment: row.shipment_type,
    jobType: row.job_type,
    origin: row.origin,
    destination: row.destination,
    tripDate: row.trip_date,
    qty20ft: Number(row.order_qty_20ft || 0),
    qty40ft: Number(row.order_qty_40ft || 0),
    containerNumber: row.container_number,
    size: row.container_size,
    type: row.container_type,
    notes: row.container_notes,
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
    driver: assignment.driver || null,
    plateNumber: assignment.plateNumber || null,
    chassis: assignment.vehicleDetail || null,
    rpujStatus: row.rpuj_status,
    rpujNotes: row.rpuj_notes,
    spkNumber: row.spk_number,
    eirNumber: row.eir_number,
    loadingVoucher: row.loading_voucher_number,
    unloadingVoucher: row.unloading_voucher_number,
    travelDocument: row.travel_document_number,
    weighingDocument: row.weighing_document_number,
    spkDocument: mapAttachmentFile(attachmentMap.spkDocument),
    eirDocument: mapAttachmentFile(attachmentMap.eirDocument),
    loadingVoucherDocument: mapAttachmentFile(attachmentMap.loadingVoucherDocument),
    unloadingVoucherDocument: mapAttachmentFile(attachmentMap.unloadingVoucherDocument),
    travelDocumentFile: mapAttachmentFile(attachmentMap.travelDocumentFile),
    weighingDocumentFile: mapAttachmentFile(attachmentMap.weighingDocumentFile),
    otherDocuments,
    status: row.status,
    receivedAt: row.received_at,
    runningAt: row.running_at,
    completedAt: row.completed_at,
    createdBy: row.created_by_name || row.order_created_by_name,
    updatedBy: row.updated_by_name,
    updatedAt: row.updated_at,
  };
}

export function toAssignmentSnapshot(form, driver, vehicle) {
  const vehicleDetail = form.chassis || (vehicle
    ? `${vehicle.unit_code || ''}${vehicle.brand ? ` - ${vehicle.brand}` : ''}${vehicle.vehicle_type ? ` ${vehicle.vehicle_type}` : ''}`.trim()
    : null);

  return {
    driver: form.driver || driver?.name || null,
    plateNumber: form.plateNumber || vehicle?.plate_number || null,
    vehicleDetail,
  };
}
