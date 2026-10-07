// Revenue Repo: Rp300.000 per container yang benar-benar diambil (satu baris per pickup item),
// berbeda dari UJ Repo yang satu nilai per movement. Combo 2x20 = dua baris terpisah, masing-
// masing ke Sales Order/customer job-nya sendiri.
//
// Disimpan sebagai manual_revenue_lines berstatus 'draft': tercatat permanen dan terlihat di
// Finance, tetapi belum masuk billing_amount/invoice sampai kebijakan invoice Repo diputuskan.
export const REPO_REVENUE_PER_CONTAINER = 300000;
export const REPO_REVENUE_CHARGE_TYPE = 'repo';

export function buildRepoRevenueDescription({ containerNumber, pickupType }) {
  return [
    'Revenue Repo',
    containerNumber,
    pickupType === 'combo_2x20' ? '(Combo 2x20)' : '',
  ].filter(Boolean).join(' ');
}

// items: [{ id: container_pickup_items.id, job: { id, sales_order_id, container_number } }]
// Unique index uq_manual_revenue_lines_pickup_item menjamin satu baris per item.
export async function createRepoRevenueLines(client, { movementId, pickupType, items = [], actorName }) {
  const lines = [];
  for (const item of items) {
    const inserted = await client.query(
      `
        insert into manual_revenue_lines (
          sales_order_id, container_job_id, container_pickup_item_id, charge_type, description,
          quantity, unit, unit_price, total_amount, note, status, created_by_name, updated_by_name
        )
        values ($1, $2, $3, 'repo', $4, 1, 'container', $5, $5, $6, 'draft', $7, $7)
        on conflict (container_pickup_item_id) where container_pickup_item_id is not null
        do nothing
        returning id, sales_order_id, container_job_id, container_pickup_item_id, total_amount, status
      `,
      [
        item.job.sales_order_id,
        item.job.id,
        item.id,
        buildRepoRevenueDescription({ containerNumber: item.job.container_number, pickupType }),
        REPO_REVENUE_PER_CONTAINER,
        `movement:${movementId}`,
        actorName,
      ],
    );
    if (inserted.rows[0]) {
      lines.push(inserted.rows[0]);
      continue;
    }
    const existing = await client.query(
      `
        select id, sales_order_id, container_job_id, container_pickup_item_id, total_amount, status
        from manual_revenue_lines
        where container_pickup_item_id = $1
      `,
      [item.id],
    );
    if (existing.rows[0]) lines.push(existing.rows[0]);
  }
  return lines;
}
