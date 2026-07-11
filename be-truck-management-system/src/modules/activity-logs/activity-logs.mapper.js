export function mapActivityLog(row) {
  const metadata = row.metadata || {};
  return {
    id: row.id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    target: row.target,
    actorUserId: metadata.actorUserId || null,
    module: metadata.module || row.target,
    entityType: metadata.entityType || null,
    entityId: metadata.entityId || null,
    beforeData: metadata.beforeData || null,
    afterData: metadata.afterData || null,
    ipAddress: metadata.ipAddress || null,
    userAgent: metadata.userAgent || null,
    metadata,
    createdAt: row.created_at,
  };
}

export function toActivityLogDb(payload) {
  return {
    actor_name: payload.actorName || payload.userName || 'System',
    actor_role: payload.actorRole || payload.role || null,
    action: payload.action,
    target: payload.target || payload.module || null,
    metadata: JSON.stringify(payload.metadata || {}),
  };
}
