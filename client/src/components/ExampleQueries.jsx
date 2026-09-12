import { useState } from 'react'
import { SparklesIcon } from './Icons'
import './ExampleQueries.css'

export default function ExampleQueries({ queries, onSelect, activeQuery }) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div className="examples-wrapper" aria-label="Suggestion panel">
      <div className="examples-header">
        <div className="examples-header-left">
          <SparklesIcon size={14} className="examples-icon" />
          <span className="examples-title">Suggested Queries</span>
          <span className="examples-badge">{queries.length} suggestions</span>
        </div>
        <button
          type="button"
          className="examples-toggle-btn"
          onClick={() => setIsOpen(prev => !prev)}
          aria-expanded={isOpen}
        >
          {isOpen ? 'Hide suggestions' : 'Show suggestions'}
        </button>
      </div>

      {isOpen && (
        <>
          <div className="examples-pill-grid">
            {queries.map((q, idx) => {
              const text = typeof q === 'string' ? q : q.text
              const tag = typeof q === 'string' ? (idx < 2 ? 'Zero-overlap' : null) : q.tag
              const isSelected = activeQuery === text

              return (
                <button
                  key={text}
                  className={`example-pill ${tag === 'Zero-overlap' ? 'example-pill-hard' : ''} ${
                    isSelected ? 'example-pill-active' : ''
                  }`}
                  onClick={() => onSelect(text)}
                  type="button"
                  title={`Search for "${text}"`}
                >
                  <span className="example-pill-text">{text}</span>
                  {tag && (
                    <span
                      className={`pill-badge ${
                        tag === 'Zero-overlap' ? 'pill-badge-hard' : 'pill-badge-default'
                      }`}
                    >
                      {tag}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <p className="examples-footnote">
            Queries tagged <strong>Zero-overlap</strong> share no vocabulary with the target chat message.
          </p>
        </>
      )}
    </div>
  )
}

