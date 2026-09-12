import { useState, useEffect } from 'react'
import SearchBox from './components/SearchBox'
import ResultCard from './components/ResultCard'
import ExampleQueries from './components/ExampleQueries'
import {
  SunIcon,
  MoonIcon,
  SearchIcon,
  UserIcon,
  CalendarIcon,
  SparklesIcon,
  InfoIcon,
} from './components/Icons'
import './App.css'

import { searchArchive } from './services/api'

const EXAMPLE_QUERIES = [
  'When did we decide on the trip?',
  'Where did everyone finally agree to go?',
  'What did Priya say about the budget?',
  'What did we discuss last month?',
  'How was the group planning to travel to the hills?',
  'What framework did the team ultimately adopt?',
  'Where was Sneha\'s birthday celebrated?',
  'Who was worried about spending too much?',
]

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('chat_search_theme') || 'light'
  })
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchMeta, setSearchMeta] = useState(null)
  const [interpretation, setInterpretation] = useState(null)
  const [currentQuery, setCurrentQuery] = useState('')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('chat_search_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'))
  }

  const handleSearch = async (query) => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setCurrentQuery(query)
    setSearched(true)
    try {
      const data = await searchArchive(query, 5)
      setResults(data.results || [])
      setInterpretation(data.interpretation || null)
      setSearchMeta({
        total_searched: data.total_searched ?? data.totalSearched,
        search_time_ms: data.search_time_ms ?? data.searchTimeMs,
      })
    } catch (e) {
      setError(e.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell">
      {/* ── Top Navigation Bar ─────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-container">
          <div className="brand">
            <div className="brand-badge">
              <SparklesIcon size={17} />
            </div>
            <div className="brand-text">
              <div className="brand-title-row">
                <span className="brand-title">Archive Search</span>
                <span className="brand-tag">Multilingual</span>
              </div>
              <span className="brand-caption">Semantic group chat retrieval</span>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="dataset-status">
              <span className="status-dot" />
              <span className="status-label">4,200 messages indexed</span>
            </div>
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
              <span className="theme-toggle-label">
                {theme === 'light' ? 'Dark' : 'Light'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content Area ──────────────────────────────────── */}
      <main className="main-content">
        <section className="search-section">
          <div className="search-intro">
            <h1 className="hero-heading">Find conversations by meaning.</h1>
            <p className="hero-subheading">
              Search memory-driven queries across months of chaotic messages — even when query and answer share zero words.
            </p>
          </div>

          <SearchBox onSearch={handleSearch} loading={loading} initialQuery={currentQuery} />

          {!searched && !loading && (
            <ExampleQueries queries={EXAMPLE_QUERIES} onSelect={handleSearch} />
          )}
        </section>

        {/* ── Loading Skeleton / Indicator ──────────────────────── */}
        {loading && (
          <div className="loading-state">
            <div className="loading-ring" />
            <span className="loading-caption">Searching across candidate messages…</span>
          </div>
        )}

        {/* ── Error Notification ────────────────────────────────── */}
        {error && (
          <div className="error-card">
            <div className="error-icon-wrap">
              <InfoIcon size={18} />
            </div>
            <div className="error-content">
              <h4>Search unavailable</h4>
              <p>{error}</p>
              <span className="error-helper">
                Ensure backend service is running on <code>http://localhost:8000</code>.
              </span>
            </div>
          </div>
        )}

        {/* ── Search Results ────────────────────────────────────── */}
        {!loading && results.length > 0 && (
          <section className="results-container">
            <div className="results-header-bar">
              <div className="results-title-group">
                <h2 className="results-heading">Search Results</h2>
                <span className="results-count-pill">{results.length} matches</span>
              </div>

              <div className="results-meta-badges">
                {searchMeta && (
                  <span className="meta-stat">
                    {searchMeta.total_searched?.toLocaleString()} candidates · {searchMeta.search_time_ms?.toFixed(0)}ms
                  </span>
                )}
              </div>
            </div>

            {/* ── Intent breakdown chips ── */}
            {interpretation && (
              <div className="intent-ribbon">
                <span className="intent-ribbon-label">Interpreted as:</span>
                {interpretation.person && (
                  <span className="intent-chip intent-person">
                    <UserIcon size={13} />
                    <span>Sender: <strong>{interpretation.person}</strong></span>
                  </span>
                )}
                {interpretation.time_range?.label && (
                  <span className="intent-chip intent-time">
                    <CalendarIcon size={13} />
                    <span>Time: <strong>{interpretation.time_range.label}</strong></span>
                  </span>
                )}
                <span className="intent-chip intent-type">
                  {interpretation.query_type} query
                </span>
                {interpretation.semantic_query && interpretation.semantic_query !== currentQuery && (
                  <span className="intent-chip intent-semantic" title={interpretation.semantic_query}>
                    <SearchIcon size={12} />
                    <span>Semantic: "{interpretation.semantic_query}"</span>
                  </span>
                )}
              </div>
            )}

            <div className="results-stack">
              {results.map((result, idx) => (
                <ResultCard key={result.message_id} result={result} rank={idx + 1} />
              ))}
            </div>
          </section>
        )}

        {/* ── Empty State ───────────────────────────────────────── */}
        {!loading && searched && results.length === 0 && !error && (
          <div className="empty-panel">
            <div className="empty-icon-box">
              <SearchIcon size={24} />
            </div>
            <h3>No conversations matched</h3>
            <p>
              We couldn't find matching messages for <strong>"{currentQuery}"</strong>.
            </p>
            <div className="empty-action-row">
              <button
                className="empty-reset-btn"
                onClick={() => {
                  setSearched(false)
                  setCurrentQuery('')
                }}
              >
                Reset search
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="footer-bar">
        <div className="footer-inner">
          <span>Semantic Chat Archive Search</span>
          <span className="footer-sep">·</span>
          <span>SentenceTransformers MiniLM-L12</span>
          <span className="footer-sep">·</span>
          <span>BM25 + Dense Hybrid Fusion</span>
        </div>
      </footer>
    </div>
  )
}
