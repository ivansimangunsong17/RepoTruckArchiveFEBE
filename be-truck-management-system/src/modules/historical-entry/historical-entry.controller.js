import { sendSuccess } from '../../utils/apiResponse.js';
import { safeRecordActivityLog } from '../activity-logs/activity-logs.service.js';
import { getHistoricalPeriod, saveHistoricalPeriod } from './historical-entry.service.js';

export async function getHistoricalPeriodController(request, response) {
  const period = await getHistoricalPeriod(request.params.period);
  sendSuccess(response, period);
}

export async function updateHistoricalPeriodController(request, response) {
  const before = await getHistoricalPeriod(request.params.period);
  const period = await saveHistoricalPeriod(request.params.period, request.body, request.user);
  await safeRecordActivityLog(request, {
    action: period.status === 'locked' ? 'LOCK_HISTORICAL_PERIOD' : 'UNLOCK_HISTORICAL_PERIOD',
    module: 'historical_entry',
    entityType: 'historical_period',
    entityId: period.period,
    beforeData: before,
    afterData: period,
    metadata: {
      historicalPeriod: period.period,
      status: period.status,
      notes: period.notes,
    },
  });
  sendSuccess(response, period, period.status === 'locked' ? 'Periode data lama dikunci.' : 'Periode data lama dibuka kembali.');
}
