<script>
  /**
   * @typedef {Object} Model
   * @property {string} id - Unique model identifier
   * @property {string} name - Display name
   * @property {string} huggingFaceId - HuggingFace model ID
   * @property {string} description - Model description
   * @property {number} sizeMB - Model size in megabytes
   * @property {number} [accuracy] - Model accuracy (0-1)
   * @property {number} environmentalScore - Environmental impact score (1-3)
   * @property {string[]} deploymentOptions - Deployment targets
   * @property {string[]} frameworks - Supported frameworks
   * @property {string} lastUpdated - Last update date
   * @property {string} tier - Performance tier
   */

  /**
   * @typedef {Object} EnsembleInfo
   * @property {string} method - Classification method used
   * @property {number} votes - Number of votes for winner
   * @property {number} total - Total number of votes
   * @property {number} confidence - Confidence score (0-1)
   * @property {Array<{text: string, category: string, similarity: string}>} similarExamples
   */

  /** @type {Model[]} */
  export let recommendations = [];
  
  /** @type {string} */
  export let taskCategory = '';
  
  /** @type {string} */
  export let taskSubcategory = '';
  
  /** @type {boolean} */
  export let isLoading = false;

  /** @type {EnsembleInfo|null} */
  export let ensembleInfo = null;
  
  function getEnvironmentalBadge(score) {
    switch (score) {
      case 1: return { 
        label: 'Low Impact', 
        class: 'env-low', 
        icon: '🌱', 
        color: '#10b981',
        tooltip: 'Under 500MB - Can run on laptops, phones, edge devices'
      };
      case 2: return { 
        label: 'Medium', 
        class: 'env-medium', 
        icon: '⚡', 
        color: '#f59e0b',
        tooltip: 'Under 4GB - Suitable for cloud or desktop with GPU'
      };
      case 3: return { 
        label: 'High Impact', 
        class: 'env-high', 
        icon: '🔥', 
        color: '#ef4444',
        tooltip: 'Over 4GB - Requires dedicated GPU infrastructure'
      };
      default: return { 
        label: 'Unknown', 
        class: 'env-unknown', 
        icon: '❓', 
        color: '#6b7280',
        tooltip: 'Environmental impact unknown'
      };
    }
  }
  
  function getTierInfo(tier) {
    switch (tier) {
      case 'lightweight': return { label: 'Lightweight', icon: '🪶', desc: 'Minimal resources' };
      case 'standard': return { label: 'Standard', icon: '⚖️', desc: 'Balanced performance' };
      case 'advanced': return { label: 'Advanced', icon: '🚀', desc: 'Maximum capability' };
      default: return { label: tier, icon: '📦', desc: '' };
    }
  }
  
  function formatSize(sizeMB) {
    if (sizeMB < 1) return `${(sizeMB * 1000).toFixed(0)}KB`;
    if (sizeMB < 1000) return `${sizeMB.toFixed(0)}MB`;
    return `${(sizeMB / 1000).toFixed(1)}GB`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  }

  function formatCategory(cat) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
</script>

<section class="recommendations" aria-label="Model Recommendations">
  {#if isLoading}
    <div class="loading-state" role="status" aria-live="polite">
      <div class="loading-animation" aria-hidden="true">
        <div class="leaf leaf-1">🍃</div>
        <div class="leaf leaf-2">🌿</div>
        <div class="leaf leaf-3">🍃</div>
      </div>
      <h2>Finding eco-friendly models...</h2>
      <p>Analyzing your task and ranking by environmental efficiency</p>
    </div>
  {:else if recommendations.length > 0}
    <div class="results-header">
      <div class="results-title">
        <h2>
          <span class="count">{recommendations.length}</span>
          Model{recommendations.length !== 1 ? 's' : ''} Found
        </h2>
        <p class="task-badge">
          <span class="task-icon">🎯</span>
          {formatCategory(taskCategory)}
          {#if taskSubcategory}
            <span class="arrow">→</span>
            {formatCategory(taskSubcategory)}
          {/if}
        </p>
      </div>

      <div class="results-meta">
        {#if ensembleInfo && ensembleInfo.votes !== undefined}
          <div class="meta-badge ensemble">
            <span class="meta-icon">🎯</span>
            <span>{ensembleInfo.votes}/{ensembleInfo.total} examples agree ({(ensembleInfo.confidence * 100).toFixed(0)}%)</span>
          </div>
        {/if}

      </div>
    </div>

    <div class="efficiency-banner">
      <span class="banner-icon">🌍</span>
      <span>Ranked by environmental efficiency — smaller, greener models first</span>
    </div>
    
    <div class="models-grid">
      {#each recommendations as model, index}
        {@const envBadge = getEnvironmentalBadge(model.environmentalScore)}
        {@const tierInfo = getTierInfo(model.tier)}
        <article
          class="model-card"
          style="animation-delay: {index * 50}ms"
        >
          <div class="card-header">
            <h3 class="model-name">{model.name}</h3>
            <div class="badges">
              <span class="badge tier-badge" title={tierInfo.desc}>
                {tierInfo.icon} {tierInfo.label}
              </span>
              <span 
                class="badge env-badge {envBadge.class}" 
                title={envBadge.tooltip}
                style="--env-color: {envBadge.color}"
              >
                {envBadge.icon} {envBadge.label}
              </span>
            </div>
          </div>
          
          <p class="model-description">{model.description}</p>
          
          <div class="stats-grid">
            <div class="stat">
              <span class="stat-icon">📦</span>
              <div class="stat-content">
                <span class="stat-value">{formatSize(model.sizeMB)}</span>
                <span class="stat-label">Size</span>
              </div>
            </div>
            <div class="stat">
              <span class="stat-icon">📊</span>
              <div class="stat-content">
                <span class="stat-value">{model.accuracy ? (model.accuracy * 100).toFixed(0) + '%' : 'N/A'}</span>
                <span class="stat-label">Accuracy</span>
              </div>
            </div>
            <div class="stat">
              <span class="stat-icon">📅</span>
              <div class="stat-content">
                <span class="stat-value">{formatDate(model.lastUpdated)}</span>
                <span class="stat-label">Updated</span>
              </div>
            </div>
          </div>
          
          <div class="tags-section">
            <div class="tag-group">
              <span class="tag-label">Deploy:</span>
              <div class="tags">
                {#each model.deploymentOptions as option}
                  <span class="tag">{option}</span>
                {/each}
              </div>
            </div>
            <div class="tag-group">
              <span class="tag-label">Frameworks:</span>
              <div class="tags">
                {#each model.frameworks as framework}
                  <span class="tag framework">{framework}</span>
                {/each}
              </div>
            </div>
          </div>
          
          <div class="card-footer">
            {#if model.huggingFaceId && !model.huggingFaceId.startsWith('placeholder/')}
              <a 
                href="https://huggingface.co/{model.huggingFaceId}" 
                target="_blank" 
                rel="noopener noreferrer"
                class="hf-link"
              >
                <span>View on 🤗 Hugging Face</span>
                <span class="link-arrow">↗</span>
              </a>
            {:else}
              <span class="reference-label">
                📖 Reference Implementation
              </span>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {:else if taskCategory}
    <div class="empty-state">
      <div class="empty-icon">🔍</div>
      <h2>No models found</h2>
      <p>We couldn't find models for this task type.</p>
      <p class="empty-hint">
        💡 Try describing your task differently.
      </p>
    </div>
  {/if}
</section>

<style>
  .recommendations {
    margin-top: 2rem;
  }

  /* Loading State */
  .loading-state {
    text-align: center;
    padding: 4rem 2rem;
  }

  .loading-animation {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .leaf {
    font-size: 2rem;
    animation: float 2s ease-in-out infinite;
  }

  .leaf-1 { animation-delay: 0s; }
  .leaf-2 { animation-delay: 0.3s; }
  .leaf-3 { animation-delay: 0.6s; }

  @keyframes float {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-10px) rotate(10deg); }
  }

  .loading-state h2 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    color: #e8f5e9;
  }

  .loading-state p {
    margin: 0;
    color: #64748b;
  }

  /* Results Header */
  .results-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .results-title h2 {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    color: #e8f5e9;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .count {
    color: #10b981;
  }

  .task-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    padding: 0.35rem 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 100px;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .task-icon {
    font-size: 0.9rem;
  }

  .task-badge .arrow {
    opacity: 0.5;
  }

  .results-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .meta-badge {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    border-radius: 8px;
    font-size: 0.75rem;
  }

  .meta-badge.ensemble {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
  }

  .efficiency-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 10px;
    margin-bottom: 1.5rem;
    font-size: 0.875rem;
    color: #34d399;
  }

  .banner-icon {
    font-size: 1rem;
  }

  /* Models Grid */
  .models-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1.25rem;
  }

  .model-card {
    position: relative;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 1.5rem;
    transition: all 0.3s ease;
    animation: cardFadeIn 0.4s ease-out backwards;
  }

  @keyframes cardFadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .model-card:hover {
    border-color: rgba(16, 185, 129, 0.3);
    transform: translateY(-4px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }

  .card-header {
    margin-bottom: 1rem;
  }

  .model-name {
    margin: 0 0 0.75rem;
    font-size: 1.15rem;
    font-weight: 700;
    color: #e8f5e9;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .tier-badge {
    background: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
  }

  .env-badge {
    background: color-mix(in srgb, var(--env-color) 15%, transparent);
    color: var(--env-color);
    cursor: help;
    position: relative;
  }

  /* Enhanced tooltip styling for environmental badges */
  .env-badge[title]:hover::after {
    content: attr(title);
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    color: #e2e8f0;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 400;
    white-space: nowrap;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .env-badge[title]:hover::before {
    content: '';
    position: absolute;
    bottom: calc(100% + 2px);
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: #1e293b;
    z-index: 10;
  }

  .model-description {
    margin: 0 0 1.25rem;
    font-size: 0.875rem;
    color: #64748b;
    line-height: 1.5;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    margin-bottom: 1.25rem;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .stat-icon {
    font-size: 1rem;
    opacity: 0.7;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 0.9rem;
    font-weight: 600;
    color: #e8f5e9;
  }

  .stat-label {
    font-size: 0.65rem;
    color: #4b5563;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tags-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .tag-group {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .tag-label {
    font-size: 0.7rem;
    color: #4b5563;
    min-width: 70px;
    padding-top: 0.2rem;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .tag {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    color: #94a3b8;
  }

  .tag.framework {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .card-footer {
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .hf-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: #10b981;
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .hf-link:hover {
    color: #34d399;
  }

  .hf-link .link-arrow {
    transition: transform 0.2s ease;
  }

  .hf-link:hover .link-arrow {
    transform: translate(2px, -2px);
  }

  .reference-label {
    font-size: 0.875rem;
    color: #64748b;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state h2 {
    margin: 0 0 0.5rem;
    color: #e8f5e9;
  }

  .empty-state p {
    margin: 0;
    color: #64748b;
  }

  .empty-hint {
    margin-top: 1rem !important;
    padding: 0.75rem 1rem;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 8px;
    display: inline-block;
    color: #fbbf24 !important;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .models-grid {
      grid-template-columns: 1fr;
    }

    .results-header {
      flex-direction: column;
    }

    .stats-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      padding: 0.75rem;
    }

    .stat {
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .model-card,
    .leaf,
    .hf-link .link-arrow {
      transition: none;
      animation: none;
    }
  }
</style>
