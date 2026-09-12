import { SparklesIcon } from './Icons'
import './ExampleQueries.css'

export default function ExampleQueries({ queries, onSelect }) {
  return (
    <div className="examples-wrapper">
      <div className="examples-header">
        <SparklesIcon size={14} className="examples-icon" />
        <span className="examples-title">Sample test queries</span>
      </div>

      <div className="examples-pill-grid">
        {queries.map((q, idx) => (
          <button
            key={q}
            className={`example-pill ${idx < 2 ? 'example-pill-hard' : ''}`}
            onClick={() => onSelect(q)}
            type="button"
          >
            <span className="example-pill-text">{q}</span>
            {idx < 2 && <span className="pill-badge">Zero-overlap</span>}
          </button>
        ))}
      </div>

      <p className="examples-footnote">
        Queries tagged <strong>Zero-overlap</strong> share no common words with their target message.
      </p>
    </div>
  )
}
