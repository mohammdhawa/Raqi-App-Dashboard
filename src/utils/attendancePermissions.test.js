import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canRejectRecord,
  isAttendanceRejectCapabilityDenied,
} from './attendancePermissions.js'

test('attendance rejection admits only admins and can_view_attendance users', () => {
  assert.equal(canRejectRecord({ role: 'admin', can_view_attendance: false }), true)
  assert.equal(canRejectRecord({ role: 'employee', can_view_attendance: true }), true)
  assert.equal(canRejectRecord({ role: 'manager', can_view_attendance: false, department_id: 1 }), false)
  assert.equal(canRejectRecord({ role: 'chief', can_view_attendance: false, department_id: 1 }), false)
  assert.equal(canRejectRecord({ role: 'employee', can_view_attendance: false }), false)
  assert.equal(canRejectRecord(null), false)
})

test('department scope cannot restore the removed rejection capability', () => {
  const manager = { role: 'manager', can_view_attendance: false, department_id: 4 }

  assert.equal(canRejectRecord(manager, { department_id: 4 }), false)
  assert.equal(canRejectRecord(manager, { department_id: 9 }), false)
  assert.equal(canRejectRecord(manager, {}), false)
})

test('recognizes only the new rejection capability denial', () => {
  assert.equal(isAttendanceRejectCapabilityDenied({
    status: 403,
    data: { error: 'attendance_reject_forbidden' },
  }), true)
  assert.equal(isAttendanceRejectCapabilityDenied({
    status: 403,
    data: { error: 'forbidden' },
  }), false)
  assert.equal(isAttendanceRejectCapabilityDenied({
    status: 422,
    data: { error: 'attendance_reject_forbidden' },
  }), false)
})
