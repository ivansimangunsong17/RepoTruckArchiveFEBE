// Kelayakan Finance untuk Sales Order, terpisah dari status operasional sales_orders.status.
// Satu sumber untuk semua gerbang Finance (invoice, dokumen invoice, debit note, finance_rows)
// dan untuk cek "billing sudah maju" di modul lain, supaya tidak saling menyimpang.

// Transport sebuah job (alias job, bukan cancelled) sudah layak ditagih: selesai, atau container
// sudah dititip di depo (repo_stored_at). Perjalanan Repo setelahnya adalah layanan terpisah.
export function jobTransportBillableSql(job = 'cj') {
  return `((${job}.status = 'completed' and ${job}.completed_at is not null) or ${job}.repo_stored_at is not null)`;
}

// Billing SO sudah maju (semantik sama dengan ensureSalesOrderBillingNotAdvanced): nomor invoice,
// billing_status selain belum_invoice, dokumen debit note, atau pembayaran yang belum di-void.
export function billingAdvancedSql(so = 'so') {
  return `(
    nullif(btrim(coalesce(${so}.invoice_number, '')), '') is not null
    or coalesce(${so}.billing_status, 'belum_invoice') <> 'belum_invoice'
    or ${so}.debit_note_document_uploaded_at is not null
    or exists (
      select 1 from sales_order_payments sop_adv
      where sop_adv.sales_order_id = ${so}.id and sop_adv.voided_at is null
    )
  )`;
}

// SO layak diproses Finance: tidak cancelled, dan
// A. semua job non-cancelled transportnya sudah layak ditagih (minimal satu job), atau
// B. billing sudah maju -- SO yang sudah diinvoice/dibayar tidak boleh hilang dari Finance hanya
//    karena job-nya dibuka kembali/dikoreksi.
export function financeEligibleSalesOrderSql(so = 'so') {
  return `(
    ${so}.status <> 'cancelled'
    and (
      (
        exists (
          select 1 from container_jobs fe_job
          where fe_job.sales_order_id = ${so}.id and fe_job.status <> 'cancelled'
        )
        and not exists (
          select 1 from container_jobs fe_job
          where fe_job.sales_order_id = ${so}.id
            and fe_job.status <> 'cancelled'
            and not ${jobTransportBillableSql('fe_job')}
        )
      )
      or ${billingAdvancedSql(so)}
    )
  )`;
}

export async function isSalesOrderBillingAdvanced(client, salesOrderId) {
  if (!salesOrderId) return false;
  const result = await client.query(
    `select ${billingAdvancedSql('so')} as advanced from sales_orders so where so.id = $1`,
    [salesOrderId],
  );
  return Boolean(result.rows[0]?.advanced);
}
