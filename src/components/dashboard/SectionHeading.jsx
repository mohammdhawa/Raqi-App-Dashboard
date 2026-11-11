// Sunaa signature 04: every section is numbered, like a drawing sheet.
export default function SectionHeading({ index, title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 14px',
      paddingBottom: 10, borderBottom: '1px solid var(--c-border)',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--c-accent-text)' }}>
        {index}
      </span>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{title}</h2>
    </div>
  )
}
