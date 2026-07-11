import { isDatabaseEnabled, query } from '../../db/client.js';

let settingsStore = {
  settingKey: 'archive',
  settingValue: null,
  updatedAt: null,
};

export async function findArchiveSettings() {
  if (isDatabaseEnabled) {
    const result = await query(
      'select setting_value from system_settings where setting_key = $1',
      ['archive'],
    );
    return result.rows[0]?.setting_value || null;
  }

  return settingsStore.settingValue;
}

export async function saveArchiveSettings(settings) {
  if (isDatabaseEnabled) {
    const result = await query(
      `
        insert into system_settings (setting_key, setting_value, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (setting_key) do update
        set setting_value = excluded.setting_value,
            updated_at = now()
        returning setting_value
      `,
      ['archive', JSON.stringify(settings)],
    );
    return result.rows[0].setting_value;
  }

  settingsStore = {
    settingKey: 'archive',
    settingValue: settings,
    updatedAt: new Date().toISOString(),
  };
  return settingsStore.settingValue;
}
