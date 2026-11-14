import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canRejectRecord,
  canViewAttendanceReports,
  isAttendanceRejectCapabilityDenied,
} from './attendancePermissions.js'

test('a manager or chief sees team attendance unless it is switched off', () => {
  assert.equal(canViewAttendanceReports({ role: 'manager' }), true)
  assert.equal(canViewAttendanceReports({ role: 'manager', team_attendance_access: true }), true)
  assert.equal(canViewAttendanceReports({ role: 'manager', team_attendance_access: false }), false)
  assert.equal(canViewAttendanceReports({ role: 'chief', team_attendance_access: false }), false)
  assert.equal(canViewAttendanceReports({ role: 'employee', team_attendance_access: true }), false)
  assert.equal(canViewAttendanceReports(null), false)
})

test('the team switch does not narrow admins or can_view_attendance users', () => {
  assert.equal(canViewAttendanceReports({ role: 'admin', team_attendance_access: false }), true)
  assert.equal(canViewAttendanceReports({
    role: 'manager', can_view_attendance: true, team_attendance_access: false,
  }), true)
  assert.equal(canViewAttendanceReports({ role: 'employee', can_view_attendance: true }), true)
})

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
