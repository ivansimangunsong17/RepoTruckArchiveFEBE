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

export function mapContainerJobExpense(row = {}) {
  const proofAttachment = row.proofAttachment || row.proof_attachment || (
    row.proof_attachment_id
      ? {
          id: row.proof_attachment_id,
          fileName: row.proof_file_name,
          fileSize: row.proof_file_size,
          mimeType: row.proof_mime_type,
          storagePath: row.proof_storage_path,
        }
      : null
  );

  return {
    id: row.id,
    salesOrderId: row.sales_order_id || row.salesOrderId || '',
    containerJobId: row.container_job_id || row.containerJobId || '',
    driverId: row.driver_id || row.driverId || '',
    category: row.category || '',
    expenseGroup: row.expense_group || row.expenseGroup || null,
    amount: Number(row.amount || 0),
    description: row.description || '',
    recipientType: row.recipient_type || row.recipientType || '',
    recipientName: row.recipient_name || row.recipientName || '',
    paymentStatus: row.payment_status || row.paymentStatus || 'belum_dibayar',
    paidAt: row.paid_at || row.paidAt || null,
    paidByName: row.paid_by_name || row.paidByName || '',
    proofAttachmentId: row.proof_attachment_id || row.proofAttachmentId || '',
    proofAttachment: mapAttachmentFile(proofAttachment),
    financeCheckStatus: row.finance_check_status || row.financeCheckStatus || 'belum_dicek',
    financeCheckedByName: row.finance_checked_by_name || row.financeCheckedByName || '',
    financeCheckedAt: row.finance_checked_at || row.financeCheckedAt || null,
    financeNote: row.finance_note || row.financeNote || '',
    source: row.source || 'manual',
    sourceRefId: row.source_ref_id || row.sourceRefId || '',
    createdByName: row.created_by_name || row.createdByName || '',
    updatedByName: row.updated_by_name || row.updatedByName || '',
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

function firstAttachment(...attachments) {
  return attachments.find(Boolean);
}

export function mapContainerJob(row, attachments = [], expenses = []) {
  const assignment = row.assignment_snapshot || {};
  const attachmentMap = attachments.reduce((map, attachment) => {
    map[attachment.category] = attachment;
    return map;
  }, {});
  const tilaGatepassPrimaryAttachment = firstAttachment(
    attachmentMap.tilaGatepassDocumentFile,
    attachmentMap.unloadingVoucherDocument,
    attachmentMap.weighingDocumentFile,
  );
  const tilaGatepassLegacyDocumentFiles = [
    ['Legacy TILA / Delivery Card', attachmentMap.unloadingVoucherDocument],
    ['Legacy Gatepass / SP2', attachmentMap.weighingDocumentFile],
  ]
    .filter(([, attachment]) => attachment && attachment.id !== tilaGatepassPrimaryAttachment?.id)
    .map(([name, attachment]) => ({
      name,
      file: mapAttachmentFile(attachment),
    }));
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
    internalSoNumber: row.so_number,
    accurateSoNumber: row.accurate_so_number || '',
    doNumber: row.do_number,
    customer: row.customer_name,
    shipment: row.shipment_type,
    jobType: row.job_type,
    vesselName: row.vessel_name || '',
    terminal: row.terminal,
    serviceName: row.service_name,
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
    driverPaymentMethod: assignment.driverPaymentMethod || 'bank',
    driverBankAccount: assignment.driverBankAccount || assignment.bankAccount || '',
    driverBankName: assignment.driverBankName || '',
    driverBankAccountNumber: assignment.driverBankAccountNumber || '',
    driverBankAccountHolder: assignment.driverBankAccountHolder || '',
    driverEmoneyProvider: assignment.driverEmoneyProvider || '',
    driverEmoneyNumber: assignment.driverEmoneyNumber || '',
    unitCode: assignment.unitCode || row.vehicle_unit_code || '',
    plateNumber: assignment.plateNumber || null,
    chassis: assignment.vehicleDetail || null,
    rpujStatus: row.rpuj_status,
    rpujNotes: row.rpuj_notes,
    hasDriverCommission: Boolean(row.has_driver_commission),
    driverCommissionAmount: Number(row.driver_commission_amount || 0),
    driverCommissionSourceDestinationId: row.driver_commission_source_destination_id || '',
    driverCommissionNote: row.driver_commission_note || '',
    rpujRequestedBy: row.rpuj_requested_by_name || '',
    rpujRequestedAt: row.rpuj_requested_at,
    rpujReviewedBy: row.rpuj_reviewed_by_name || '',
    rpujReviewedAt: row.rpuj_reviewed_at,
    rpujRejectionNote: row.rpuj_rejection_note || '',
    rpujTransferUploadedBy: row.rpuj_transfer_uploaded_by_name || '',
    rpujTransferUploadedAt: row.rpuj_transfer_uploaded_at,
    rpujTransferProof: mapAttachmentFile(attachmentMap.rpujTransferProof),
    spkNumber: row.spk_number,
    eirNumber: row.eir_number,
    loadingVoucher: row.loading_voucher_number,
    tilaGatepassDocument: row.tila_gatepass_document_number || row.unloading_voucher_number || row.weighing_document_number,
    tilaGatepassMigrationNote: row.tila_gatepass_migration_note || '',
    unloadingVoucher: row.unloading_voucher_number,
    travelDocument: row.travel_document_number,
    weighingDocument: row.weighing_document_number,
    cancelledAt: row.cancelled_at,
    cancelledByName: row.cancelled_by_name || '',
    cancelReason: row.cancel_reason || row.cancel_request_note || '',
    cancelSource: row.cancel_source || '',
    cancelRequestStatus: row.cancel_request_status || 'none',
    cancelRequestNote: row.cancel_request_note || '',
    cancelRequestedByName: row.cancel_requested_by_name || '',
    cancelRequestedByRole: row.cancel_requested_by_role || '',
    cancelRequestedAt: row.cancel_requested_at,
    cancelReviewedByName: row.cancel_reviewed_by_name || '',
    cancelReviewedAt: row.cancel_reviewed_at,
    cancelReviewNote: row.cancel_review_note || '',
    repoLocation: row.repo_location || '',
    repoStoredAt: row.repo_stored_at,
    repoEirNumber: row.repo_eir_number || '',
    repoReason: row.repo_reason || '',
    repoNotes: row.repo_notes || '',
    repoContainerCondition: row.repo_container_condition || '',
    repoReleasedDriverId: row.repo_released_driver_id,
    repoReleasedVehicleId: row.repo_released_vehicle_id,
    repoCreatedByName: row.repo_created_by_name || '',
    repoPickedUpAt: row.repo_picked_up_at,
    repoPickedUpByName: row.repo_picked_up_by_name || '',
    inapStartedAt: row.inap_started_at,
    inapEndedAt: row.inap_ended_at,
    inapReason: row.inap_reason || '',
    inapNotes: row.inap_notes || '',
    inapCreatedByName: row.inap_created_by_name || '',
    ujAmountSnapshot: row.uj_amount_snapshot == null ? null : Number(row.uj_amount_snapshot),
    ujSourceDestinationId: row.uj_source_destination_id || '',
    ujSnapshotAt: row.uj_snapshot_at,
    ujSnapshotSource: row.uj_snapshot_source || '',
    entrySource: row.entry_source || 'realtime',
    historicalPeriod: row.historical_period || '',
    historicalNotes: row.historical_notes || '',
    spkDocument: mapAttachmentFile(attachmentMap.spkDocument),
    additionalCostDocument: mapAttachmentFile(attachmentMap.additionalCostDocument),
    eirDocument: mapAttachmentFile(attachmentMap.eirDocument),
    repoEirDocument: mapAttachmentFile(attachmentMap.repoEirDocument),
    loadingVoucherDocument: mapAttachmentFile(attachmentMap.loadingVoucherDocument),
    tilaGatepassDocumentFile: mapAttachmentFile(tilaGatepassPrimaryAttachment),
    tilaGatepassLegacyDocumentFiles,
    unloadingVoucherDocument: mapAttachmentFile(attachmentMap.unloadingVoucherDocument),
    travelDocumentFile: mapAttachmentFile(attachmentMap.travelDocumentFile),
    weighingDocumentFile: mapAttachmentFile(attachmentMap.weighingDocumentFile),
    otherDocuments,
    expenses: expenses.map(mapContainerJobExpense),
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
  const paymentMethod = form.driverPaymentMethod || driver?.payment_method || 'bank';
  const bankAccount = [
    form.driverBankName || driver?.bank_name,
    form.driverBankAccountNumber || driver?.bank_account_number,
  ].filter(Boolean).join(' ');
  const emoneyAccount = [
    form.driverEmoneyProvider || driver?.emoney_provider,
    form.driverEmoneyNumber || driver?.emoney_number,
  ].filter(Boolean).join(' ');

  return {
    driver: form.driver || driver?.name || null,
    unitCode: form.unitCode || vehicle?.unit_code || null,
    plateNumber: form.plateNumber || vehicle?.plate_number || null,
    vehicleDetail,
    driverPaymentMethod: paymentMethod === 'emoney' ? 'emoney' : 'bank',
    driverBankAccount: paymentMethod === 'emoney' ? emoneyAccount || null : bankAccount || null,
    driverBankName: form.driverBankName || driver?.bank_name || null,
    driverBankAccountNumber: form.driverBankAccountNumber || driver?.bank_account_number || null,
    driverBankAccountHolder: form.driverBankAccountHolder || driver?.bank_account_holder || null,
    driverEmoneyProvider: form.driverEmoneyProvider || driver?.emoney_provider || null,
    driverEmoneyNumber: form.driverEmoneyNumber || driver?.emoney_number || null,
  };
}

export function mapAssignmentHistory(row) {
  return {
    id: row.id,
    containerJobId: row.container_job_id,
    changeSource: row.change_source,
    previousDriverId: row.previous_driver_id,
    previousDriverName: row.previous_driver_name || '',
    nextDriverId: row.next_driver_id,
    nextDriverName: row.next_driver_name || '',
    previousVehicleId: row.previous_vehicle_id,
    previousPlateNumber: row.previous_plate_number || '',
    nextVehicleId: row.next_vehicle_id,
    nextPlateNumber: row.next_plate_number || '',
    reason: row.reason || '',
    note: row.note || '',
    changedByName: row.changed_by_name || '',
    changedByRole: row.changed_by_role || '',
    createdAt: row.created_at,
  };
}
