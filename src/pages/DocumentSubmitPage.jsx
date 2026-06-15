import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import {
  Upload, FileText, X, LayoutTemplate, Search, AlertCircle,
  Paperclip, FileUp, ArrowRight, Hash, UserCheck,
} from 'lucide-react'
import ApproverPicker from '../components/documents/ApproverPicker'
import TemplateFieldForm, { getInitialFieldValues, validateFieldValues } from '../components/documents/TemplateFieldForm'
import { extractErrorMessage } from '../components/documents/shared'

const UPLOAD_EXTS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp']
const ATTACHMENT_EXTS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'xlsx', 'xls']
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_ATTACHMENTS = 10

const WORKFLOW_MODES = [
  { key: 'sequential', label: 'متسلسل', desc: 'يعتمد المعتمدون المستند بالترتيب المحدد، كل واحد بعد الآخر.' },
  { key: 'parallel', label: 'متوازٍ', desc: 'يمكن لجميع المعتمدين الاطلاع على المستند واعتماده في أي وقت.' },
]

const cardStyle = {
  background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16,
  boxShadow: 'var(--sh-card)', overflow: 'hidden', marginBottom: 20,
}
const cardHeaderStyle = {
  padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
  display: 'flex', alignItems: 'center', gap: 9,
}
const cardBodyStyle = { padding: 20 }

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`
  return `${(bytes / 1024 / 1024).toFixed(2)} م.ب`
}

function validateFile(file, allowedExts) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !allowedExts.includes(ext)) {
    return `صيغة الملف غير مدعومة (الصيغ المسموحة: ${allowedExts.join('، ')})`
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'حجم الملف يتجاوز الحد الأقصى المسموح به (20 ميجابايت)'
  }
  return null
}

/** Recursively appends a (possibly nested) value to FormData using bracket notation. */
function appendFormData(fd, key, value) {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    value.forEach((v, i) => appendFormData(fd, `${key}[${i}]`, v))
  } else if (value instanceof File) {
    fd.append(key, value)
  } else if (typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => appendFormData(fd, key ? `${key}[${k}]` : k, v))
  } else {
    fd.append(key, value)
  }
}

// ── Field primitives ──────────────────────────────────────────────────────────

function FieldWrap({ label, required, error, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', marginBottom: 7 }}>
        {label}
        {required && <span style={{ color: 'var(--c-rejected)', marginInlineStart: 3 }}>*</span>}
      </label>
      {children}
      {hint && !error && <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 5, lineHeight: 1.6 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginTop: 5 }}>{error}</div>}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text', error, maxLength }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 42,
      background: 'var(--c-surface)',
      border: `1.5px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
      borderRadius: 10, padding: '0 12px', boxSizing: 'border-box',
    }}>
      <input
        type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength}
        style={{
          flex: 1, border: 0, outline: 0, background: 'transparent', width: '100%',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          textAlign: type === 'number' ? 'left' : 'right',
          direction: type === 'number' ? 'ltr' : 'rtl',
        }}
      />
    </div>
  )
}

function TextareaInput({ value, onChange, placeholder, rows = 4, maxLength, error }) {
  return (
    <div style={{
      background: 'var(--c-surface)',
      border: `1.5px solid ${error ? 'var(--c-rejected)' : 'var(--c-border)'}`,
      borderRadius: 10, padding: '10px 12px', boxSizing: 'border-box',
    }}>
      <textarea
        value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows} maxLength={maxLength}
        placeholder={placeholder}
        style={{
          width: '100%', border: 0, outline: 0, background: 'transparent', resize: 'vertical',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
          textAlign: 'right', direction: 'rtl', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ── Tab switch ────────────────────────────────────────────────────────────────

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10,
        border: `1.5px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
        background: active ? 'var(--c-primary)' : '#fff',
        color: active ? '#fff' : 'var(--c-text-2)',
        fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .14s',
      }}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}

// ── Workflow mode radio card ─────────────────────────────────────────────────

function WorkflowModeCard({ mode, active, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        flex: 1, padding: 14, borderRadius: 12, cursor: 'pointer',
        background: active ? 'rgba(34,65,103,0.03)' : '#fff',
        border: `1.5px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
        boxShadow: active ? '0 0 0 3px rgba(34,65,103,0.07)' : 'none',
        transition: 'all .14s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--c-text)' }}>{mode.label}</span>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          border: `1.5px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
          background: active ? 'var(--c-primary)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}>
          {active && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L4 7L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>{mode.desc}</div>
    </div>
  )
}

// ── File dropzone (single file — upload tab) ─────────────────────────────────

function FileDropzone({ file, onSelect, onRemove, accept, hint, error }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.[0]) onSelect(e.dataTransfer.files[0])
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `1.5px dashed ${error ? 'var(--c-rejected)' : dragOver ? 'var(--c-primary)' : 'var(--c-border)'}`,
          borderRadius: 12, padding: '30px 16px', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'var(--c-accent-tint)' : 'var(--c-surface)',
          transition: 'all .14s',
        }}
      >
        <input
          ref={inputRef} type="file" accept={accept} style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) onSelect(e.target.files[0]); e.target.value = '' }}
        />
        {!file ? (
          <>
            <Upload size={26} style={{ color: 'var(--c-text-3)', marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>اسحب الملف هنا أو انقر للاختيار</div>
            {hint && <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 4 }}>{hint}</div>}
          </>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'var(--c-accent-tint)', color: 'var(--c-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileText size={18} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{file.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{formatFileSize(file.size)}</div>
            </div>
            <button
              type="button" onClick={e => { e.stopPropagation(); onRemove() }}
              style={{
                width: 28, height: 28, borderRadius: 8, border: '1px solid var(--c-border)',
                background: '#fff', color: 'var(--c-text-3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
      {error && <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginTop: 6 }}>{error}</div>}
    </div>
  )
}

// ── Template card (generate tab) ─────────────────────────────────────────────

function TemplateCard({ tpl, active, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 12, cursor: 'pointer',
        border: `1.5px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
        background: active ? 'rgba(34,65,103,0.03)' : '#fff',
        boxShadow: active ? '0 0 0 3px rgba(34,65,103,0.07)' : 'none',
        transition: 'all .14s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: 'var(--c-accent-tint)', color: 'var(--c-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LayoutTemplate size={17} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 800, color: 'var(--c-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tpl.name}
          </div>
          {tpl.type && <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{tpl.type}</div>}
        </div>
      </div>
      {tpl.description && (
        <div style={{
          fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {tpl.description}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DocumentSubmitPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const attachInputRef = useRef(null)

  const [tab, setTab] = useState('upload')

  // Common fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [workflowMode, setWorkflowMode] = useState('sequential')
  const [approverIds, setApproverIds] = useState([])

  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Upload tab
  const [file, setFile] = useState(null)

  // Generate tab
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templateSearch, setTemplateSearch] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [template, setTemplate] = useState(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [fieldValues, setFieldValues] = useState({})
  const [counters, setCounters] = useState(null)
  const [exportNumber, setExportNumber] = useState('')
  const [importNumber, setImportNumber] = useState('')
  const [attachments, setAttachments] = useState([])

  // Fetch active templates (debounced search)
  useEffect(() => {
    let active = true
    setTemplatesLoading(true)
    const t = setTimeout(() => {
      api.get('/document-templates', { params: templateSearch ? { search: templateSearch } : {} })
        .then(res => {
          if (!active) return
          const pag = res.data.templates ?? res.data
          const list = pag?.data ?? (Array.isArray(pag) ? pag : [])
          setTemplates(list.filter(t => t.is_active !== false))
        })
        .catch(() => { if (active) setTemplates([]) })
        .finally(() => { if (active) setTemplatesLoading(false) })
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [templateSearch])

  // Fetch full template (fields_schema) when one is selected
  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplate(null)
      setFieldValues({})
      setErrors(prev => ({ ...prev, field_values: {} }))
      return
    }
    let active = true
    setTemplateLoading(true)
    api.get(`/document-templates/${selectedTemplateId}`)
      .then(res => {
        if (!active) return
        const tpl = res.data.template ?? res.data
        setTemplate(tpl)
        setFieldValues(getInitialFieldValues(tpl.fields_schema))
        setErrors(prev => ({ ...prev, field_values: {}, template: undefined }))
      })
      .catch(() => { if (active) setTemplate(null) })
      .finally(() => { if (active) setTemplateLoading(false) })
    return () => { active = false }
  }, [selectedTemplateId])

  // Fetch export/import counters once for prefilling the generate form
  useEffect(() => {
    api.get('/document-counters/next')
      .then(res => {
        setCounters(res.data)
        if (res.data?.export?.next_number != null) setExportNumber(String(res.data.export.next_number))
        if (res.data?.import?.next_number != null) setImportNumber(String(res.data.import.next_number))
      })
      .catch(() => setCounters(null))
  }, [])

  const showCounters = counters?.department_id != null
  const exportRequired = showCounters && counters?.export?.is_initialized === false

  function handleTabChange(next) {
    setTab(next)
    setErrors({})
    setSubmitError('')
  }

  function handleSelectFile(f) {
    const err = validateFile(f, UPLOAD_EXTS)
    setFile(f)
    setErrors(prev => ({ ...prev, file: err || undefined }))
  }

  function handleAddAttachments(fileList) {
    const incoming = Array.from(fileList)
    let attachError = ''
    const valid = []
    for (const f of incoming) {
      const err = validateFile(f, ATTACHMENT_EXTS)
      if (err) { attachError = `${f.name}: ${err}`; continue }
      valid.push(f)
    }
    setAttachments(prev => {
      const combined = [...prev, ...valid]
      if (combined.length > MAX_ATTACHMENTS) {
        attachError = `الحد الأقصى ${MAX_ATTACHMENTS} مرفقات`
        return combined.slice(0, MAX_ATTACHMENTS)
      }
      return combined
    })
    setErrors(prev => ({ ...prev, attachments: attachError || undefined }))
  }

  function removeAttachment(idx) {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  function validateCommon() {
    const errs = {}
    if (!title.trim()) errs.title = 'العنوان مطلوب'
    if (approverIds.length === 0) errs.approver_ids = 'يرجى اختيار معتمد واحد على الأقل'
    return errs
  }

  function applySubmitError(e) {
    const data = e.response?.data
    if (e.response?.status === 422 && data?.errors && typeof data.errors === 'object') {
      const flat = {}
      const fieldErrs = {}
      for (const [key, msgs] of Object.entries(data.errors)) {
        const msg = Array.isArray(msgs) ? msgs[0] : msgs
        if (key.startsWith('field_values.')) {
          const fieldKey = key.slice('field_values.'.length).split('.')[0]
          fieldErrs[fieldKey] = msg
        } else if (key === 'template_id') {
          flat.template = msg
        } else {
          flat[key.split('.')[0]] = msg
        }
      }
      setErrors(prev => ({ ...prev, ...flat, field_values: { ...prev.field_values, ...fieldErrs } }))
      setSubmitError(Object.values(data.errors).flat()[0] ?? 'يرجى مراجعة الحقول المظللة')
      return
    }
    setSubmitError(extractErrorMessage(e, 'حدث خطأ أثناء إرسال المستند.'))
  }

  async function handleSubmitUpload() {
    const errs = validateCommon()
    if (!file) errs.file = 'يرجى اختيار ملف'
    setErrors(errs)
    setSubmitError('')
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      if (description.trim()) fd.append('description', description.trim())
      fd.append('file', file)
      fd.append('workflow_mode', workflowMode)
      approverIds.forEach(id => fd.append('approver_ids[]', id))
      attachments.forEach(f => fd.append('attachments[]', f))
      const res = await api.post('/documents', fd)
      const doc = res.data.document ?? res.data
      toast.success('تم إرسال المستند بنجاح')
      navigate(`/documents/${doc.id}`)
    } catch (e) {
      applySubmitError(e)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitGenerate() {
    const errs = validateCommon()
    if (!template) errs.template = 'يرجى اختيار قالب'
    if (exportRequired && !exportNumber.trim()) errs.export_number = 'رقم الصادر مطلوب لهذه الإدارة'

    const fieldErrs = template ? validateFieldValues(template.fields_schema, fieldValues) : {}

    setErrors({ ...errs, field_values: fieldErrs })
    setSubmitError('')
    if (Object.keys(errs).length || Object.keys(fieldErrs).length) return

    setSubmitting(true)
    try {
      const payload = {
        template_id: template.id,
        title: title.trim(),
        field_values: fieldValues,
        workflow_mode: workflowMode,
        approver_ids: approverIds,
      }
      if (description.trim()) payload.description = description.trim()
      if (showCounters) {
        if (exportNumber.trim()) payload.export_number = Number(exportNumber)
        if (importNumber.trim()) payload.import_number = Number(importNumber)
      }

      let res
      if (attachments.length > 0) {
        const fd = new FormData()
        appendFormData(fd, '', payload)
        attachments.forEach(f => fd.append('attachments[]', f))
        res = await api.post('/documents/generated', fd)
      } else {
        res = await api.post('/documents/generated', payload)
      }
      const doc = res.data.document ?? res.data
      toast.success('تم إرسال المستند بنجاح')
      navigate(`/documents/${doc.id}`)
    } catch (e) {
      applySubmitError(e)
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit() {
    if (submitting) return
    if (tab === 'upload') handleSubmitUpload()
    else handleSubmitGenerate()
  }

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 880, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 26 }}>
        <Link to="/documents/sent" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
          fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', textDecoration: 'none',
        }}>
          <ArrowRight size={14} />
          العودة للصادر
        </Link>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          مستند جديد
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          ارفع مستنداً جاهزاً أو أنشئ واحداً من قالب، وحدد المعتمدين عليه.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <TabButton active={tab === 'upload'} icon={Upload} label="رفع ملف" onClick={() => handleTabChange('upload')} />
        <TabButton active={tab === 'generate'} icon={LayoutTemplate} label="إنشاء من قالب" onClick={() => handleTabChange('generate')} />
      </div>

      {/* Document info */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <FileText size={16} style={{ color: 'var(--c-primary)' }} />
          <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>بيانات المستند</span>
        </div>
        <div style={cardBodyStyle}>
          <FieldWrap label="العنوان" required error={errors.title}>
            <TextInput value={title} onChange={setTitle} placeholder="عنوان المستند" maxLength={255} error={errors.title} />
          </FieldWrap>
          <div style={{ marginBottom: 0 }}>
            <FieldWrap label="الوصف (اختياري)">
              <TextareaInput value={description} onChange={setDescription} placeholder="وصف مختصر للمستند..." rows={3} maxLength={2000} />
            </FieldWrap>
          </div>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'upload' ? (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Upload size={16} style={{ color: 'var(--c-primary)' }} />
            <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>الملف</span>
          </div>
          <div style={cardBodyStyle}>
            <FileDropzone
              file={file}
              onSelect={handleSelectFile}
              onRemove={() => { setFile(null); setErrors(prev => ({ ...prev, file: undefined })) }}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              hint="الصيغ المدعومة: PDF, Word, JPG, PNG, WEBP — الحد الأقصى 20 ميجابايت"
              error={errors.file}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Template picker */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <LayoutTemplate size={16} style={{ color: 'var(--c-primary)' }} />
              <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>القالب</span>
              {template && (
                <>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => setSelectedTemplateId(null)}
                    style={{
                      border: '1px solid var(--c-border)', background: '#fff', borderRadius: 8,
                      padding: '5px 12px', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)',
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    }}
                  >
                    تغيير القالب
                  </button>
                </>
              )}
            </div>
            <div style={cardBodyStyle}>
              {!template ? (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                    borderRadius: 10, padding: '0 12px', height: 40, marginBottom: 16,
                  }}>
                    <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                    <input
                      value={templateSearch} onChange={e => setTemplateSearch(e.target.value)}
                      placeholder="ابحث عن قالب بالاسم..."
                      style={{
                        flex: 1, border: 0, outline: 0, background: 'transparent',
                        fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)', textAlign: 'right',
                      }}
                    />
                  </div>

                  {errors.template && (
                    <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginBottom: 10 }}>{errors.template}</div>
                  )}

                  {templatesLoading ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5 }}>
                      ...جارِ التحميل
                    </div>
                  ) : templates.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5 }}>
                      لا توجد قوالب متاحة
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                      {templates.map(tpl => (
                        <TemplateCard key={tpl.id} tpl={tpl} active={false} onSelect={() => setSelectedTemplateId(tpl.id)} />
                      ))}
                    </div>
                  )}
                </>
              ) : templateLoading ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--c-text-3)', fontSize: 12.5 }}>
                  ...جارِ التحميل
                </div>
              ) : (
                <TemplateCard tpl={template} active onSelect={() => {}} />
              )}
            </div>
          </div>

          {/* Dynamic fields */}
          {template && !templateLoading && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <FileText size={16} style={{ color: 'var(--c-primary)' }} />
                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>بيانات القالب</span>
              </div>
              <div style={cardBodyStyle}>
                {(template.fields_schema ?? []).length === 0 ? (
                  <div style={{ padding: '8px 0', color: 'var(--c-text-3)', fontSize: 12.5 }}>
                    لا توجد حقول إضافية لهذا القالب
                  </div>
                ) : (
                  <TemplateFieldForm
                    schema={template.fields_schema}
                    value={fieldValues}
                    onChange={setFieldValues}
                    errors={errors.field_values ?? {}}
                  />
                )}
              </div>
            </div>
          )}

          {/* Export / import counters */}
          {showCounters && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Hash size={16} style={{ color: 'var(--c-primary)' }} />
                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>أرقام الصادر والوارد</span>
              </div>
              <div style={cardBodyStyle}>
                <FieldWrap
                  label="رقم الصادر" required={exportRequired} error={errors.export_number}
                  hint={exportRequired ? 'لم يتم بعد تحديد بداية ترقيم الصادر لهذه الإدارة، يرجى إدخال الرقم الذي يبدأ منه الترقيم.' : undefined}
                >
                  <TextInput type="number" value={exportNumber} onChange={setExportNumber} placeholder="رقم الصادر" error={errors.export_number} />
                </FieldWrap>
                <div style={{ marginBottom: 0 }}>
                  <FieldWrap label="رقم الوارد (اختياري)">
                    <TextInput type="number" value={importNumber} onChange={setImportNumber} placeholder="رقم الوارد" />
                  </FieldWrap>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Attachments */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <Paperclip size={16} style={{ color: 'var(--c-primary)' }} />
          <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>مرفقات إضافية (اختياري)</span>
        </div>
        <div style={cardBodyStyle}>
          <div
            onClick={() => attachInputRef.current?.click()}
            style={{
              border: '1.5px dashed var(--c-border)', borderRadius: 12, padding: '20px 16px',
              textAlign: 'center', cursor: 'pointer', background: 'var(--c-surface)', marginBottom: 12,
            }}
          >
            <input
              ref={attachInputRef} type="file" multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) handleAddAttachments(e.target.files); e.target.value = '' }}
            />
            <FileUp size={22} style={{ color: 'var(--c-text-3)', marginBottom: 6 }} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>انقر لإضافة مرفقات</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 4 }}>
              حتى {MAX_ATTACHMENTS} ملفات — PDF, Word, Excel, صور — 20 ميجابايت لكل ملف
            </div>
          </div>

          {errors.attachments && (
            <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginBottom: 10 }}>{errors.attachments}</div>
          )}

          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  border: '1px solid var(--c-border)', borderRadius: 10, background: '#fff',
                }}>
                  <FileText size={16} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{formatFileSize(f.size)}</div>
                  </div>
                  <button
                    type="button" onClick={() => removeAttachment(i)}
                    style={{
                      width: 26, height: 26, borderRadius: 7, border: '1px solid var(--c-border)',
                      background: '#fff', color: 'var(--c-text-3)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Workflow & approvers */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <UserCheck size={16} style={{ color: 'var(--c-primary)' }} />
          <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--c-text)' }}>سير الاعتماد</span>
        </div>
        <div style={cardBodyStyle}>
          <FieldWrap label="نمط الاعتماد" required>
            <div style={{ display: 'flex', gap: 12 }}>
              {WORKFLOW_MODES.map(mode => (
                <WorkflowModeCard
                  key={mode.key} mode={mode} active={workflowMode === mode.key}
                  onSelect={() => setWorkflowMode(mode.key)}
                />
              ))}
            </div>
          </FieldWrap>

          <div style={{ marginBottom: 0 }}>
            <FieldWrap label="المعتمدون" required error={errors.approver_ids}>
              <ApproverPicker value={approverIds} onChange={setApproverIds} workflowMode={workflowMode} />
            </FieldWrap>
          </div>
        </div>
      </div>

      {/* Submit */}
      {submitError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 10,
          background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)', fontSize: 12.5, fontWeight: 600,
          marginBottom: 16,
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          {submitError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="ghost" onClick={() => navigate('/documents/sent')} disabled={submitting}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? '...جارِ الإرسال' : 'إرسال المستند'}
        </Button>
      </div>
    </div>
  )
}
