import './SignalBar.css'

const SIGNAL_CONFIG = {
  semantic: { label: 'Semantic alignment', desc: 'Vector cosine similarity with multilingual embeddings' },
  lexical: { label: 'Lexical overlap (BM25)', desc: 'Keyword match frequency and inverse document frequency' },
  person: { label: 'Author match', desc: 'Sender identification filter match' },
  temporal: { label: 'Temporal relevance', desc: 'Recency and date window decay score' },
  decision: { label: 'Decision heuristic', desc: 'Resolution and commitment language presence' },
}

export default function SignalBar({ label, value }) {
  const config = SIGNAL_CONFIG[label] || { label, desc: '' }
  const pct = Math.min(100, Math.max(0, Math.round((value || 0) * 100)))

  return (
    <div className="signal-item">
      <div className="signal-label-col">
        <span className="signal-name">{config.label}</span>
      </div>

      <div className="signal-track-col">
        <div className="signal-track-bg">
          <div
            className="signal-fill-bar"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="signal-value-col">
        <span className="signal-percent">{pct}%</span>
      </div>
    </div>
  )
}
