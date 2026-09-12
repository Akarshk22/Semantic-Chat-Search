import './ConversationContext.css'

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

export default function ConversationContext({ messages }) {
  if (!messages || messages.length === 0) return null

  return (
    <div className="conversation-context-block">
      {messages.map((msg, i) => {
        const isMatch = Boolean(msg.is_match)
        return (
          <div
            key={msg.id || i}
            className={`context-turn ${isMatch ? 'context-turn-matched' : ''}`}
          >
            <div className="turn-gutter">
              {isMatch ? <span className="matched-accent-bar" /> : null}
            </div>

            <div className="turn-main">
              <div className="turn-meta">
                <span className="turn-sender">{msg.sender}</span>
                <span className="turn-timestamp">{formatTime(msg.timestamp)}</span>
                {isMatch && <span className="match-pill">Direct Hit</span>}
              </div>

              <div className={`turn-content ${isMatch ? 'turn-content-highlight' : ''}`}>
                {msg.text}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
