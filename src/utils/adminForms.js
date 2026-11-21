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
    team_attendance_access: form.team_attendance_access,
    department_id:        idOrNull(form.department_id),
    section_id:            idOrNull(form.section_id),
    password:              form.password,
    password_confirmation: form.password_confirmation,
  }
}

/**
 * What actually changed between the frozen server snapshot and the form.
 *
 * This is the *diff*, not the request body — see userUpdateBody for what is
 * sent. It stays a pure diff because it answers a second question too: which
 * fields the user genuinely touched, which is what decides whether editing
 * your own account has to re-read the session.
 *
 * Nearly every rule on PATCH /admin/users/{user} is `sometimes`, so an unsent
 * field is left alone.
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
  if (form.team_attendance_access !== initial.team_attendance_access) payload.team_attendance_access = form.team_attendance_access

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
 * The body of PATCH /admin/users/{user}: the diff, plus `role`.
 *
 * `role` is the one rule on that endpoint that is `required` rather than
 * `sometimes` (UpdateUserRequest), so a body that diffs it out is refused with
 * «الدور الوظيفي مطلوب.» — even when the role is exactly what it already was
 * and the form is showing it selected. It therefore rides along with every
 * update instead of being treated as just another changed field.
 *
 * Kept apart from the diff so `changedKeys` keeps meaning "what the user
 * touched": stamping `role` into the diff would make renaming your own account
 * look like a permission change and pointlessly re-read the session.
 */
export function userUpdateBody(changes, form) {
  return { ...changes, role: form.role }
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

// Laravel's Password::defaults() — the rule both user requests apply.
export const PASSWORD_MIN = 8

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The checks the user form can answer before the request goes out, keyed by
 * field so each message lands under its own control. The server still owns
 * everything that needs the database (a taken email, the single chief, the
 * last administrator); this only spares a round trip for what is plainly
 * missing or mistyped.
 *
 * `checkPassword` is false when editing without opening the password fields:
 * an empty password there means "leave it as it is".
 */
export function validateUserForm(form, { checkPassword = true } = {}) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'الاسم مطلوب.'
  if (!form.email.trim()) errors.email = 'البريد الإلكتروني مطلوب.'
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = 'صيغة البريد الإلكتروني غير صحيحة.'

  if (checkPassword) {
    if (!form.password) errors.password = 'كلمة المرور مطلوبة.'
    else if (form.password.length < PASSWORD_MIN) errors.password = `كلمة المرور يجب أن تكون ${PASSWORD_MIN} أحرف على الأقل.`
    if (form.password && form.password_confirmation !== form.password) {
      errors.password_confirmation = 'تأكيد كلمة المرور غير متطابق.'
    }
  }
  return errors
}

// No look-alikes (0/O, 1/l/I), so a password read aloud or copied by hand
// survives the trip to the employee.
const PW_LOWER  = 'abcdefghjkmnpqrstuvwxyz'
const PW_UPPER  = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const PW_DIGITS = '23456789'

/** A random password with at least one lowercase, uppercase and digit. */
export function generatePassword(length = 12) {
  const all = PW_LOWER + PW_UPPER + PW_DIGITS
  const pick = set => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length]
  const chars = [pick(PW_LOWER), pick(PW_UPPER), pick(PW_DIGITS)]
  while (chars.length < length) chars.push(pick(all))
  // Fisher–Yates, so the guaranteed classes are not always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
