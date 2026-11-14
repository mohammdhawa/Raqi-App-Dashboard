/**
 * Who reaches the attendance reports — the backend's `attendance.report.view`
 * gate, verbatim. Admins and can_view_attendance users always do; a manager or
 * chief only while their `team_attendance_access` switch is on. The switch
 * defaults to on, so a session cached before the field existed reads as on.
 */
export function canViewAttendanceReports(user) {
  if (!user) return false
  if (user.role === 'admin' || user.can_view_attendance) return true

  return ['manager', 'chief'].includes(user.role) && user.team_attendance_access !== false
}

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
