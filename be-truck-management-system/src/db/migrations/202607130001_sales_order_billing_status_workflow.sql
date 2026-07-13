update sales_orders
set billing_status = case
  when billing_status = 'pending_invoice' then 'belum_invoice'
  when billing_status = 'invoice_issued' then 'belum_dikirim'
  when billing_status = 'waiting_payment' then 'menunggu_pembayaran'
  when billing_status = 'paid' then 'lunas'
  when billing_status is null or btrim(billing_status) = '' then 'belum_invoice'
  else billing_status
end;

alter table sales_orders
  alter column billing_status set default 'belum_invoice';
