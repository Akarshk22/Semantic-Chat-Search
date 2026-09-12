import { useState } from 'react'
import ConversationContext from './ConversationContext'
import SignalBar from './SignalBar'
import {
  MessageSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
} from './Icons'
import './ResultCard.css'

import { fetchThread } from '../services/api'

function formatDate(ts) {
  try {
    const d = new Date(ts)
    return (
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    )
  } catch {
    return ts
  }
}

// Deterministic pleasant avatar colors per sender
const SENDER_COLORS = {
  Rahul: { bg: '#dbeafe', text: '#1e40af', darkBg: '#1e3a8a', darkText: '#93c5fd' },
  Priya: { bg: '#fce7f3', text: '#9d174d', darkBg: '#831843', darkText: '#fbcfe8' },
  Ankit: { bg: '#d1fae5', text: '#065f46', darkBg: '#064e3b', darkText: '#a7f3d0' },
  Sneha: { bg: '#fef3c7', text: '#92400e', darkBg: '#78350f', darkText: '#fde68a' },
  Vikas: { bg: '#e0e7ff', text: '#3730a3', darkBg: '#312e81', darkText: '#c7d2fe' },
  Karan: { bg: '#ffedd5', text: '#9a3412', darkBg: '#7c2d12', darkText: '#fed7aa' },
  Neha: { bg: '#fae8ff', text: '#86198f', darkBg: '#701a75', darkText: '#f5d0fe' },
  Meera: { bg: '#ccfbf1', text: '#115e59', darkBg: '#134e4a', darkText: '#99f6e4' },
}

export default function ResultCard({ result, rank }) {
  const [showSignals, setShowSignals] = useState(false)
  const [showThread, setShowThread] = useState(false)
  const [threadMsgs, setThreadMsgs] = useState([])
  const [threadLoading, setThreadLoading] = useState(false)

  const sig = result.signals || {}
  const senderColor = SENDER_COLORS[result.sender] || {
    bg: '#f1f5f9',
    text: '#334155',
    darkBg: '#1e293b',
    darkText: '#cbd5e1',
  }

  // Active signal indicators
  const activeTags = []
  if ((sig.semantic || 0) > 0.28) activeTags.push('Semantic Match')
  if ((sig.person || 0) > 0) activeTags.push('Author Match')
  if ((sig.temporal || 0) > 0.3) activeTags.push('Time Match')
  if ((sig.decision || 0) > 0.3) activeTags.push('Key Decision')
  if ((sig.lexical || 0) > 0.2) activeTags.push('Lexical Match')

  const loadThread = async () => {
    if (showThread) {
      setShowThread(false)
      return
    }
    setThreadLoading(true)
    try {
      const convId = result.conversation_id || result.conversationId
      const data = await fetchThread(convId, 60)
      setThreadMsgs(data.messages || [])
      setShowThread(true)
    } catch {
      setThreadMsgs([])
      setShowThread(true)
    } finally {
      setThreadLoading(false)
    }
  }

  return (
    <article className="result-card">
      {/* ── Card Header ────────────────────────────────────────── */}
      <div className="card-top">
        <div className="card-header-left">
          <div
            className="sender-avatar"
            style={{
              backgroundColor: 'var(--avatar-bg, ' + senderColor.bg + ')',
              color: 'var(--avatar-text, ' + senderColor.text + ')',
            }}
          >
            {result.sender ? result.sender[0].toUpperCase() : '?'}
          </div>

          <div className="sender-details">
            <div className="sender-line">
              <span className="sender-name">{result.sender}</span>
              <span className="thread-channel-badge">
                <MessageSquareIcon size={11} />
                <span>{result.conversation_id}</span>
              </span>
            </div>
            <time className="timestamp-text">{formatDate(result.timestamp)}</time>
          </div>
        </div>

        <div className="card-header-right">
          <div className="rank-tag">#{rank}</div>
        </div>
      </div>

      {/* ── Message Context ────────────────────────────────────── */}
      <div className="card-context-wrapper">
        <ConversationContext messages={result.context} />
      </div>

      {/* ── Signal Tags ────────────────────────────────────────── */}
      {activeTags.length > 0 && (
        <div className="signals-tag-row">
          {activeTags.map(tag => (
            <span key={tag} className="meta-pill">
              <CheckIcon size={11} />
              <span>{tag}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Card Action Bar ────────────────────────────────────── */}
      <div className="card-action-bar">
        <div className="action-buttons-left">
          <button
            type="button"
            className={`card-btn ${showSignals ? 'card-btn-active' : ''}`}
            onClick={() => setShowSignals(s => !s)}
          >
            {showSignals ? <ChevronUpIcon size={13} /> : <ChevronDownIcon size={13} />}
            <span>{showSignals ? 'Hide signals' : 'Why this matched'}</span>
          </button>

          <button
            type="button"
            className={`card-btn ${showThread ? 'card-btn-active' : ''}`}
            onClick={loadThread}
            disabled={threadLoading}
          >
            <MessageSquareIcon size={13} />
            <span>{threadLoading ? 'Loading thread…' : showThread ? 'Close thread' : 'Full conversation'}</span>
          </button>
        </div>

        <span className="message-id-code">id: {result.message_id}</span>
      </div>

      {/* ── Retrieval Signals Breakdown Panel ──────────────────── */}
      {showSignals && (
        <div className="signals-drawer">
          <div className="signals-drawer-header">
            <h4>Relevance Breakdown</h4>
            <span className="overall-score-pill">
              Composite score: {(result.score || 0).toFixed(3)}
            </span>
          </div>
          <div className="signals-grid">
            <SignalBar label="semantic" value={sig.semantic} />
            <SignalBar label="lexical" value={sig.lexical} />
            <SignalBar label="person" value={sig.person} />
            <SignalBar label="temporal" value={sig.temporal} />
            <SignalBar label="decision" value={sig.decision} />
          </div>
        </div>
      )}

      {/* ── Full Thread View Drawer ────────────────────────────── */}
      {showThread && (
        <div className="thread-drawer">
          <div className="thread-drawer-header">
            <h4>Conversation Thread</h4>
            <span className="thread-count-meta">{threadMsgs.length} messages</span>
          </div>
          <div className="thread-scroll-list">
            {threadMsgs.map((m, i) => (
              <div
                key={m.id || i}
                className={`thread-row ${m.id === result.message_id ? 'thread-row-target' : ''}`}
              >
                <span className="thread-author">{m.sender}</span>
                <span className="thread-body">{m.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
