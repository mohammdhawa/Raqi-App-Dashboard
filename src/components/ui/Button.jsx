const variants = {
  primary: {
    background: 'var(--c-primary)',
    color: '#fff',
    border: 'none',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--c-text-2)',
    border: '1px solid var(--c-border)',
  },
  danger: {
    background: 'var(--c-rejected-bg)',
    color: 'var(--c-rejected)',
    border: '1px solid transparent',
  },
}

const hoverClasses = {
  primary: 'hover:opacity-90',
  ghost: 'hover:border-[var(--c-border-strong)] hover:text-[var(--c-text)]',
  danger: 'hover:border-[#F4C9C6]',
}

export default function Button({
  children,
  variant = 'primary',
  className = '',
  style = {},
  ...props
}) {
  return (
    <button
      style={{
        borderRadius: '10px',
        fontWeight: 700,
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        padding: '0 16px',
        height: 38,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        cursor: 'pointer',
        transition: 'all 0.15s',
        outline: 'none',
        whiteSpace: 'nowrap',
        ...variants[variant],
        ...style,
      }}
      className={`${hoverClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
