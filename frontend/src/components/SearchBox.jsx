import { useState, useRef, useEffect } from 'react'
import { SearchIcon, CloseIcon } from './Icons'
import './SearchBox.css'

export default function SearchBox({ onSearch, loading, initialQuery }) {
  const [value, setValue] = useState(initialQuery || '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (initialQuery !== undefined) setValue(initialQuery)
  }, [initialQuery])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (value.trim() && !loading) onSearch(value.trim())
  }

  return (
    <form className="search-box-form" onSubmit={handleSubmit}>
      <div className="search-input-shell">
        <div className="search-lead-icon">
          <SearchIcon size={18} />
        </div>
        <input
          ref={inputRef}
          className="search-field"
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="e.g. When did we decide on the trip? or What was Priya's budget?"
          disabled={loading}
          autoFocus
          spellCheck={false}
        />
        {value && !loading && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => {
              setValue('')
              inputRef.current?.focus()
            }}
            aria-label="Clear query"
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>

      <button className="search-submit-btn" type="submit" disabled={!value.trim() || loading}>
        {loading ? (
          <span className="search-loading-inline">
            <span className="search-spin-dot" />
            Searching…
          </span>
        ) : (
          'Search'
        )}
      </button>
    </form>
  )
}
