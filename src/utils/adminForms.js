// Pure helpers for the admin screens: what a user form sends, and how a
// section move reports itself. Kept out of the components so the rules can be
// read — and exercised — without rendering a drawer.

/**
 * Select values are strings ('' meaning "none"); the API wants an integer or an
 * explicit null. One converter, so a cleared field never degrades into an
 * omitted one — the distinction the whole payload diff below rests on.
 */
export function idOrNull(value) {
  return value === '' || value == null ? null : Number(value)
}

export function buildUserCreatePayload(form) {
  return {
    name:                  form.name,
    email:                 form.email,
    role:                  form.role,
    attendance_check:      form.attendance_check,
    can_view_attendance:   form.can_view_attendance,
    department_id:         idOrNull(form.department_id),
    section_id:            idOrNull(form.section_id),
    password:              form.password,
    password_confirmation: form.password_confirmation,
  }
}

/**
 * PATCH /admin/users/{user} carries only what actually changed — every rule on
 * the endpoint is `sometimes`, so an unsent field is left alone.
 *
 * The department and the section are the exception: they travel together
 * whenever either moves. `users.department_id` and `users.section_id` are two
 * columns that both answer "which department is this person in", so they have
 * to agree, and the endpoint refuses a department change that doesn't say what
 * the section becomes rather than silently nulling it. Hence:
 *
 *   - moving department      → send the new section, or an explicit null
 *   - clearing the department → send `section_id: null` with it, because every
 *                               row in `sections` belongs to a department and
 *                               the old one cannot survive
 *   - clearing only the section → send `section_id: null`, never omit it
 */
export function buildUserUpdatePayload(initial, form) {
  const payload = {}

  if (form.name !== initial.name) payload.name = form.name
  if (form.email !== initial.email) payload.email = form.email
  if (form.role !== initial.role) payload.role = form.role
  if (form.attendance_check !== initial.attendance_check) payload.attendance_check = form.attendance_check
  if (form.can_view_attendance !== initial.can_view_attendance) payload.can_view_attendance = form.can_view_attendance

  if (form.password) {
    payload.password              = form.password
    payload.password_confirmation = form.password_confirmation
  }

  const departmentId = idOrNull(form.department_id)
  const sectionId    = idOrNull(form.section_id)

  if (departmentId !== idOrNull(initial.department_id)) {
    payload.department_id = departmentId
    payload.section_id    = departmentId === null ? null : sectionId
  } else if (sectionId !== idOrNull(initial.section_id)) {
    payload.section_id = sectionId
  }

  return payload
}

/**
 * "تم نقل القسم ونقل 12 مستخدماً معه."
 *
 * Arabic counts change the noun's form, so the count is not simply
 * interpolated: 1 and 2 have their own words, 3–10 take the plural, and 11 and
 * above return to the singular accusative.
 */
export function movedUsersMessage(count) {
  if (count === 1) return 'تم نقل القسم ونقل مستخدم واحد معه.'
  if (count === 2) return 'تم نقل القسم ونقل مستخدمَين معه.'
  if (count >= 3 && count <= 10) return `تم نقل القسم ونقل ${count} مستخدمين معه.`
  return `تم نقل القسم ونقل ${count} مستخدماً معه.`
}
