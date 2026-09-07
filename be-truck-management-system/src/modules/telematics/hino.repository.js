import { query, withTransaction } from '../../db/client.js';

const HINO_PROVIDER = 'hino_connect';

function mapLivePositionRow(row) {
  return {
    vehicleId: row.vehicle_id,
    hinoVehicleId: row.hino_vehicle_id,
    vin: row.vin || row.hino_vehicle_id || '',
    unitCode: row.unit_code || '',
    plateNumber: row.plate_number || row.vehicle_plate_number || '',
    hinoPlateNumber: row.hino_plate_number || '',
    displayName: row.display_name || '',
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    speedKph: row.speed_kph == null ? null : Number(row.speed_kph),
    heading: row.heading == null ? null : Number(row.heading),
    ignitionStatus: row.ignition_status || '',
    engineStatus: row.engine_status || '',
    address: row.address || '',
    gpsTime: row.gps_time,
    syncedAt: row.synced_at,
    source: 'hino_connect',
  };
}

function mapCachedVehicleRow(row) {
  return {
    vehicleId: row.linked_vehicle_id || row.vehicle_id,
    hinoVehicleId: row.hino_vehicle_id,
    vin: row.vin || '',
    unitCode: row.unit_code || '',
    plateNumber: row.vehicle_plate_number || row.plate_number || '',
    hinoPlateNumber: row.hino_plate_number || '',
    displayName: row.display_name || '',
    vehicleStatus: row.vehicle_status || '',
    syncedAt: row.synced_at,
    isLinked: Boolean(row.link_id),
    isAutoMatched: Boolean(!row.link_id && row.vehicle_id),
    linkId: row.link_id || null,
    linkedAt: row.linked_at || null,
    source: 'hino_connect',
  };
}

export async function getCachedHinoToken() {
  const result = await query(
    `
      select access_token, token_type, expires_at, raw_payload, updated_at
      from hino_api_tokens
      where provider = $1
    `,
    [HINO_PROVIDER],
  );
  return result.rows[0] || null;
}

export async function saveHinoToken({ accessToken, tokenType = 'Bearer', expiresAt = null, rawPayload = {} }) {
  await query(
    `
      insert into hino_api_tokens (provider, access_token, token_type, expires_at, raw_payload, updated_at)
      values ($1, $2, $3, $4, $5::jsonb, now())
      on conflict (provider) do update
      set access_token = excluded.access_token,
          token_type = excluded.token_type,
          expires_at = excluded.expires_at,
          raw_payload = excluded.raw_payload,
          updated_at = now()
    `,
    [HINO_PROVIDER, accessToken, tokenType, expiresAt, JSON.stringify(rawPayload || {})],
  );
}

export async function getLatestHinoApiLog(endpoint) {
  const result = await query(
    `
      select endpoint, status, http_status, request_count, vehicle_count, error_message, created_at
      from hino_api_usage_logs
      where endpoint = $1
      order by created_at desc
      limit 1
    `,
    [endpoint],
  );
  return result.rows[0] || null;
}

export async function recordHinoApiUsage({
  endpoint,
  status,
  httpStatus = null,
  requestCount = 1,
  vehicleCount = 0,
  errorMessage = '',
}) {
  await query(
    `
      insert into hino_api_usage_logs (
        endpoint, status, http_status, request_count, vehicle_count, error_message
      ) values ($1, $2, $3, $4, $5, $6)
    `,
    [endpoint, status, httpStatus, requestCount, vehicleCount, errorMessage || null],
  );
}

export async function saveHinoVehiclePositions(items = []) {
  if (!items.length) return { saved: 0, linked: 0 };

  return withTransaction(async (client) => {
    let saved = 0;
    let linked = 0;

    for (const item of items) {
      const linkResult = await client.query(
        `
          select vehicle_id
          from hino_vehicle_links
          where is_active
            and hino_vehicle_id = $1
          limit 1
        `,
        [item.hinoVehicleId],
      );

      let vehicleId = linkResult.rows[0]?.vehicle_id || null;

      if (!vehicleId && item.plateNumber) {
        const vehicleResult = await client.query(
          `
            select id
            from vehicles
            where archived_at is null
              and lower(replace(plate_number, ' ', '')) = lower(replace($1, ' ', ''))
            limit 1
          `,
          [item.plateNumber],
        );
        vehicleId = vehicleResult.rows[0]?.id || null;
      }

      if (vehicleId) linked += 1;

      await client.query(
        `
          insert into hino_vehicle_positions (
            vehicle_id, hino_vehicle_id, plate_number, latitude, longitude, speed_kph,
            heading, ignition_status, engine_status, address, gps_time, synced_at, raw_payload
          ) values (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, now(), $12::jsonb
          )
        `,
        [
          vehicleId,
          item.hinoVehicleId,
          item.plateNumber,
          item.latitude,
          item.longitude,
          item.speedKph,
          item.heading,
          item.ignitionStatus,
          item.engineStatus,
          item.address,
          item.gpsTime,
          JSON.stringify(item.rawPayload || {}),
        ],
      );
      saved += 1;
    }

    return { saved, linked };
  });
}

export async function saveHinoVehicles(items = []) {
  if (!items.length) return { saved: 0, linked: 0 };

  return withTransaction(async (client) => {
    let saved = 0;
    let linked = 0;

    for (const item of items) {
      const linkResult = await client.query(
        `
          select vehicle_id
          from hino_vehicle_links
          where is_active
            and hino_vehicle_id = $1
          limit 1
        `,
        [item.hinoVehicleId],
      );

      let vehicleId = linkResult.rows[0]?.vehicle_id || null;

      if (!vehicleId && item.plateNumber) {
        const vehicleResult = await client.query(
          `
            select id
            from vehicles
            where archived_at is null
              and lower(replace(plate_number, ' ', '')) = lower(replace($1, ' ', ''))
            limit 1
          `,
          [item.plateNumber],
        );
        vehicleId = vehicleResult.rows[0]?.id || null;
      }

      if (vehicleId) linked += 1;

      await client.query(
        `
          insert into hino_vehicles (
            vehicle_id, hino_vehicle_id, vin, plate_number, display_name,
            vehicle_status, synced_at, raw_payload
          ) values (
            $1, $2, $3, $4, $5,
            $6, now(), $7::jsonb
          )
          on conflict (hino_vehicle_id) do update
          set vehicle_id = excluded.vehicle_id,
              vin = excluded.vin,
              plate_number = excluded.plate_number,
              display_name = excluded.display_name,
              vehicle_status = excluded.vehicle_status,
              synced_at = now(),
              raw_payload = excluded.raw_payload
        `,
        [
          vehicleId,
          item.hinoVehicleId,
          item.vin,
          item.plateNumber,
          item.displayName,
          item.vehicleStatus,
          JSON.stringify(item.rawPayload || {}),
        ],
      );
      saved += 1;
    }

    return { saved, linked };
  });
}

export async function listCachedHinoVehicles() {
  const result = await query(
    `
      select hv.vehicle_id, hv.hino_vehicle_id, hv.vin, hv.plate_number,
             hv.display_name, hv.vehicle_status, hv.synced_at,
             hvl.id as link_id, hvl.vehicle_id as linked_vehicle_id, hvl.linked_at,
             v.unit_code, v.plate_number as vehicle_plate_number,
             hvl.hino_plate_number
      from hino_vehicles hv
      left join hino_vehicle_links hvl on hvl.hino_vehicle_id = hv.hino_vehicle_id and hvl.is_active
      left join vehicles v on v.id = coalesce(hvl.vehicle_id, hv.vehicle_id)
      order by coalesce(v.unit_code, hv.plate_number, hv.display_name, hv.hino_vehicle_id)
    `,
  );

  return result.rows.map(mapCachedVehicleRow);
}

async function findHinoVehicleCandidate(client, hinoVehicleId) {
  const result = await client.query(
    `
      with latest_position as (
        select hino_vehicle_id,
               hino_vehicle_id as vin,
               plate_number,
               null::text as display_name,
               coalesce(engine_status, ignition_status) as vehicle_status,
               raw_payload,
               synced_at
        from hino_vehicle_positions
        where hino_vehicle_id = $1
        order by synced_at desc
        limit 1
      )
      select hino_vehicle_id, vin, plate_number, display_name, vehicle_status, raw_payload, synced_at
      from hino_vehicles
      where hino_vehicle_id = $1
      union all
      select hino_vehicle_id, vin, plate_number, display_name, vehicle_status, raw_payload, synced_at
      from latest_position
      where not exists (select 1 from hino_vehicles where hino_vehicle_id = $1)
      limit 1
    `,
    [hinoVehicleId],
  );
  return result.rows[0] || null;
}

export async function linkHinoVehicleToTruck({ hinoVehicleId, vehicleId, actorName = '' }) {
  return withTransaction(async (client) => {
    const vehicleResult = await client.query(
      `
        select id, unit_code, plate_number
        from vehicles
        where id = $1
          and archived_at is null
        for update
      `,
      [vehicleId],
    );
    const vehicle = vehicleResult.rows[0];
    if (!vehicle) {
      const error = new Error('Truck Armada tidak ditemukan.');
      error.statusCode = 404;
      error.code = 'VEHICLE_NOT_FOUND';
      throw error;
    }

    const hinoVehicle = await findHinoVehicleCandidate(client, hinoVehicleId);
    if (!hinoVehicle) {
      const error = new Error('Kendaraan HINO belum ada di cache. Sync daftar kendaraan atau posisi HINO terlebih dahulu.');
      error.statusCode = 404;
      error.code = 'HINO_VEHICLE_NOT_FOUND';
      throw error;
    }

    const existingResult = await client.query(
      `
        select hvl.id, hvl.hino_vehicle_id, hvl.vehicle_id,
               v.unit_code, v.plate_number
        from hino_vehicle_links hvl
        left join vehicles v on v.id = hvl.vehicle_id
        where hvl.is_active
          and (hvl.hino_vehicle_id = $1 or hvl.vehicle_id = $2)
        for update
      `,
      [hinoVehicleId, vehicleId],
    );

    await client.query(
      `
        update hino_vehicle_links
        set is_active = false,
            updated_at = now()
        where is_active
          and (hino_vehicle_id = $1 or vehicle_id = $2)
      `,
      [hinoVehicleId, vehicleId],
    );

    const insertResult = await client.query(
      `
        insert into hino_vehicle_links (
          vehicle_id, hino_vehicle_id, hino_plate_number, linked_by_name
        ) values (
          $1, $2, $3, $4
        )
        returning id, vehicle_id, hino_vehicle_id, hino_plate_number, linked_by_name, linked_at
      `,
      [vehicleId, hinoVehicleId, hinoVehicle.plate_number || null, actorName || null],
    );

    await client.query(
      `
        update hino_vehicles
        set vehicle_id = $2,
            synced_at = synced_at
        where hino_vehicle_id = $1
      `,
      [hinoVehicleId, vehicleId],
    );

    await client.query(
      `
        update hino_vehicle_positions
        set vehicle_id = $2
        where hino_vehicle_id = $1
      `,
      [hinoVehicleId, vehicleId],
    );

    return {
      before: existingResult.rows.map((row) => ({
        hinoVehicleId: row.hino_vehicle_id,
        vehicleId: row.vehicle_id,
        unitCode: row.unit_code || '',
        plateNumber: row.plate_number || '',
      })),
      after: {
        ...insertResult.rows[0],
        hinoVehicleId,
        vehicleId,
        unitCode: vehicle.unit_code || '',
        plateNumber: vehicle.plate_number || '',
      },
    };
  });
}

export async function unlinkHinoVehicleFromTruck(hinoVehicleId) {
  return withTransaction(async (client) => {
    const existingResult = await client.query(
      `
        select hvl.id, hvl.hino_vehicle_id, hvl.vehicle_id,
               v.unit_code, v.plate_number
        from hino_vehicle_links hvl
        left join vehicles v on v.id = hvl.vehicle_id
        where hvl.is_active
          and hvl.hino_vehicle_id = $1
        for update
      `,
      [hinoVehicleId],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      const error = new Error('Kendaraan HINO belum terhubung ke truck Armada.');
      error.statusCode = 404;
      error.code = 'HINO_LINK_NOT_FOUND';
      throw error;
    }

    await client.query(
      `
        update hino_vehicle_links
        set is_active = false,
            updated_at = now()
        where id = $1
      `,
      [existing.id],
    );

    await client.query('update hino_vehicles set vehicle_id = null where hino_vehicle_id = $1', [hinoVehicleId]);
    await client.query('update hino_vehicle_positions set vehicle_id = null where hino_vehicle_id = $1', [hinoVehicleId]);

    return {
      before: {
        hinoVehicleId: existing.hino_vehicle_id,
        vehicleId: existing.vehicle_id,
        unitCode: existing.unit_code || '',
        plateNumber: existing.plate_number || '',
      },
      after: {
        hinoVehicleId,
        vehicleId: null,
      },
    };
  });
}

export async function listLiveHinoVehiclePositions() {
  const result = await query(
    `
      with latest_positions as (
        select distinct on (coalesce(vehicle_id::text, hino_vehicle_id))
               id, vehicle_id, hino_vehicle_id, plate_number, latitude, longitude,
               speed_kph, heading, ignition_status, engine_status, address,
               gps_time, synced_at
        from hino_vehicle_positions
        order by coalesce(vehicle_id::text, hino_vehicle_id), synced_at desc
      )
      select lp.vehicle_id, lp.hino_vehicle_id,
             v.unit_code, v.plate_number as vehicle_plate_number,
             lp.plate_number, lp.latitude, lp.longitude,
             lp.speed_kph, lp.heading, lp.ignition_status, lp.engine_status,
             lp.address, lp.gps_time, lp.synced_at,
             hvl.hino_plate_number,
             hv.vin, hv.display_name
      from latest_positions lp
      left join hino_vehicle_links hvl on hvl.hino_vehicle_id = lp.hino_vehicle_id and hvl.is_active
      left join vehicles v on v.id = coalesce(hvl.vehicle_id, lp.vehicle_id)
      left join hino_vehicles hv on hv.hino_vehicle_id = lp.hino_vehicle_id
      order by coalesce(v.unit_code, lp.plate_number, lp.hino_vehicle_id)
    `,
  );

  return result.rows.map(mapLivePositionRow);
}

export async function summarizeHinoApiUsageToday() {
  const result = await query(
    `
      select endpoint,
             count(*)::int as log_count,
             coalesce(sum(request_count), 0)::int as request_count,
             coalesce(sum(vehicle_count), 0)::int as vehicle_count,
             max(created_at) as last_request_at
      from hino_api_usage_logs
      where created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
      group by endpoint
      order by endpoint
    `,
  );

  return result.rows.map((row) => ({
    endpoint: row.endpoint,
    logCount: Number(row.log_count || 0),
    requestCount: Number(row.request_count || 0),
    vehicleCount: Number(row.vehicle_count || 0),
    lastRequestAt: row.last_request_at,
  }));
}
