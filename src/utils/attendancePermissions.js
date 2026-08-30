/**
 * Interim S5 capability: attendance visibility alone no longer grants the
 * power to reject or restore a record. Department membership is irrelevant.
 */
export function canRejectRecord(user) {
  return Boolean(user && (user.role === 'admin' || user.can_view_attendance))
}

export const ATTENDANCE_REJECT_FORBIDDEN = 'attendance_reject_forbidden'

/** A stale UI must treat this 403 as a permanent capability denial. */
export function isAttendanceRejectCapabilityDenied(response) {
  return response?.status === 403
    && response?.data?.error === ATTENDANCE_REJECT_FORBIDDEN
}
