import { useState } from 'react';
import { UserIcon, CalendarIcon, SparklesIcon } from './Icons';
import './FilterBar.css';

const DEFAULT_PARTICIPANTS = [
  'Ankit', 'Karan', 'Meera', 'Neha', 'Priya', 'Rahul', 'Sneha', 'Vikas'
];

const TOPIC_PRESETS = [
  { id: 'all', label: 'All Topics', icon: '🌐' },
  { id: 'trip_manali', label: 'Trip to Manali', icon: '🏔️' },
  { id: 'birthday_restaurant', label: "Sneha's Birthday", icon: '🎂' },
  { id: 'project_techstack', label: 'Project Tech Stack', icon: '💻' },
  { id: 'general', label: 'General Chat', icon: '💬' }
];

const MONTH_PRESETS = [
  { label: 'All Time', start: '', end: '' },
  { label: 'Mar', start: '2026-03-01', end: '2026-03-31' },
  { label: 'Apr', start: '2026-04-01', end: '2026-04-30' },
  { label: 'May', start: '2026-05-01', end: '2026-05-31' },
  { label: 'Jun', start: '2026-06-01', end: '2026-06-30' },
  { label: 'Jul', start: '2026-07-01', end: '2026-07-31' },
  { label: 'Aug', start: '2026-08-01', end: '2026-08-31' }
];

// Consistent avatar colors
const AVATAR_COLORS = {
  Rahul: '#3b82f6',
  Priya: '#ec4899',
  Ankit: '#10b981',
  Neha: '#f59e0b',
  Vikas: '#8b5cf6',
  Sneha: '#06b6d4',
  Karan: '#f97316',
  Meera: '#6366f1'
};

export default function FilterBar({ filters, onFilterChange, filterMeta }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const participantsList = filterMeta?.participants?.map(p => p.name) || DEFAULT_PARTICIPANTS;
  const selectedParticipants = filters.participants || [];
  const selectedTopic = filters.conversationId || 'all';
  const startDate = filters.startDate || '';
  const endDate = filters.endDate || '';

  // Count active filters
  let activeCount = 0;
  if (selectedParticipants.length > 0) activeCount += selectedParticipants.length;
  if (selectedTopic && selectedTopic !== 'all') activeCount += 1;
  if (startDate || endDate) activeCount += 1;

  const toggleParticipant = (name) => {
    const next = selectedParticipants.includes(name)
      ? selectedParticipants.filter(p => p !== name)
      : [...selectedParticipants, name];
    onFilterChange({ ...filters, participants: next });
  };

  const handleTopicSelect = (topicId) => {
    onFilterChange({ ...filters, conversationId: topicId === 'all' ? null : topicId });
  };

  const handleDatePreset = (preset) => {
    onFilterChange({
      ...filters,
      startDate: preset.start || null,
      endDate: preset.end || null
    });
  };

  const handleCustomDate = (key, value) => {
    onFilterChange({
      ...filters,
      [key]: value ? value : null
    });
  };

  const clearAllFilters = () => {
    onFilterChange({
      participants: [],
      conversationId: null,
      startDate: null,
      endDate: null
    });
  };

  return (
    <div className="filter-bar-container">
      {/* ── Top Summary Bar ── */}
      <div className="filter-header-bar">
        <button
          type="button"
          className={`filter-toggle-btn ${activeCount > 0 ? 'has-active' : ''}`}
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          <span className="filter-icon">⚡</span>
          <span className="filter-title">Faceted Filters</span>
          {activeCount > 0 && (
            <span className="filter-active-pill">{activeCount} active</span>
          )}
          <span className={`filter-chevron ${isExpanded ? 'open' : ''}`}>▼</span>
        </button>

        {/* Quick summary tags */}
        <div className="filter-quick-tags">
          {selectedParticipants.map(name => (
            <span key={name} className="active-tag" onClick={() => toggleParticipant(name)}>
              <span className="active-tag-dot" style={{ backgroundColor: AVATAR_COLORS[name] || '#888' }} />
              {name}
              <button type="button" className="tag-remove">×</button>
            </span>
          ))}

          {selectedTopic && selectedTopic !== 'all' && (
            <span className="active-tag" onClick={() => handleTopicSelect('all')}>
              Topic: {TOPIC_PRESETS.find(t => t.id === selectedTopic)?.label || selectedTopic}
              <button type="button" className="tag-remove">×</button>
            </span>
          )}

          {(startDate || endDate) && (
            <span className="active-tag" onClick={() => handleDatePreset({ start: '', end: '' })}>
              Date: {startDate || 'Start'} → {endDate || 'End'}
              <button type="button" className="tag-remove">×</button>
            </span>
          )}
        </div>

        {activeCount > 0 && (
          <button type="button" className="clear-filters-btn" onClick={clearAllFilters}>
            Clear all
          </button>
        )}
      </div>

      {/* ── Expandable Facet Controls ── */}
      {isExpanded && (
        <div className="filter-panel">
          {/* 1. Participant Multi-select Chips */}
          <div className="filter-group">
            <div className="filter-group-header">
              <UserIcon size={14} />
              <span className="filter-group-label">Participants (Multi-select)</span>
              {selectedParticipants.length > 0 && (
                <span className="filter-hint">Showing only selected senders</span>
              )}
            </div>
            <div className="chips-wrap">
              {participantsList.map(name => {
                const isSelected = selectedParticipants.includes(name);
                const color = AVATAR_COLORS[name] || '#64748b';
                return (
                  <button
                    key={name}
                    type="button"
                    className={`participant-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleParticipant(name)}
                    style={{
                      '--chip-color': color,
                      borderColor: isSelected ? color : undefined,
                      backgroundColor: isSelected ? `${color}22` : undefined
                    }}
                  >
                    <span className="chip-avatar" style={{ backgroundColor: color }}>
                      {name[0]}
                    </span>
                    <span className="chip-name">{name}</span>
                    {isSelected && <span className="chip-check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Conversation Topic Selector */}
          <div className="filter-group">
            <div className="filter-group-header">
              <SparklesIcon size={14} />
              <span className="filter-group-label">Conversation Topic</span>
            </div>
            <div className="topic-pills-wrap">
              {TOPIC_PRESETS.map(t => {
                const isSelected = selectedTopic === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`topic-pill ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleTopicSelect(t.id)}
                  >
                    <span className="topic-icon">{t.icon}</span>
                    <span className="topic-label">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Date Range Slider & Month Presets */}
          <div className="filter-group">
            <div className="filter-group-header">
              <CalendarIcon size={14} />
              <span className="filter-group-label">Date Range (March – August 2026)</span>
            </div>

            <div className="date-filter-row">
              <div className="month-presets">
                {MONTH_PRESETS.map(preset => {
                  const isSelected = startDate === preset.start && endDate === preset.end;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      className={`month-pill ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleDatePreset(preset)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="custom-date-inputs">
                <label className="date-input-label">
                  <span>From:</span>
                  <input
                    type="date"
                    className="date-input"
                    value={startDate}
                    min="2026-03-01"
                    max="2026-08-31"
                    onChange={(e) => handleCustomDate('startDate', e.target.value)}
                  />
                </label>

                <label className="date-input-label">
                  <span>To:</span>
                  <input
                    type="date"
                    className="date-input"
                    value={endDate}
                    min="2026-03-01"
                    max="2026-08-31"
                    onChange={(e) => handleCustomDate('endDate', e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
