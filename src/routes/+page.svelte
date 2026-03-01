<script>
  import TaskForm from "../components/TaskForm.svelte";
  import RecommendationDisplay from "../components/RecommendationDisplay.svelte";
  import { EmbeddingTaskClassifier } from "../lib/classification/EmbeddingTaskClassifier.js";
  import { BrowserTaskClassifier } from "../lib/classification/BrowserTaskClassifier.js";
  import { ModelSelector } from "../lib/recommendation/ModelSelector.js";

  // Import data
  import modelsData from "../lib/data/models.json";
  import tasksData from "../lib/data/tasks.json";

  // Initialize components
  let taskClassifier;
  let fallbackClassifier;
  let modelSelector;
  let usingFallback = false;
  let classifierReady = false;

  // Component state
  let isLoading = false;
  let isModelLoading = false;
  let modelLoadProgress = "";
  let downloadPercentage = 0;
  let recommendations = [];
  let taskCategory = "";
  let taskSubcategory = "";
  let error = null;
  let ensembleInfo = null;
  let showResultsHighlight = false;
  let recommendationsSection;

  // Classifier pre-fill state
  let prefillCategory = null;
  let prefillSubcategory = null;
  let prefillConfidence = 0;

  // Available categories (from model data)
  let availableCategories = {};

  // Model count
  let totalModelCount = 0;

  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  onMount(async () => {
    try {
      // 1. Initialize components
      modelSelector = new ModelSelector(modelsData);
      fallbackClassifier = new BrowserTaskClassifier();
      availableCategories = modelSelector.getAvailableCategories();

      // Count total models
      totalModelCount = Object.values(availableCategories)
        .flatMap(subs => Object.values(subs))
        .reduce((a, b) => a + b, 0);

      // Initialize embedding classifier (loads in background, not blocking)
      taskClassifier = new EmbeddingTaskClassifier({
        onProgress: (progress) => {
          if (progress.status === "downloading") {
            modelLoadProgress = progress.message;
            downloadPercentage = progress.progress;
            isModelLoading = true;
          } else if (progress.status === "loading" || progress.status === "computing") {
            modelLoadProgress = progress.message;
            downloadPercentage = progress.progress;
            isModelLoading = true;
          } else if (progress.status === "ready") {
            modelLoadProgress = "";
            downloadPercentage = 100;
            isModelLoading = false;
            classifierReady = true;
          } else if (progress.status === "error") {
            modelLoadProgress = "";
            isModelLoading = false;
            console.warn("Embedding classifier failed, using keyword fallback");
            usingFallback = true;
          }
        },
      });

      const initResult = await taskClassifier.initialize(tasksData);
      if (initResult.success) {
        classifierReady = true;
        usingFallback = false;
      } else {
        usingFallback = true;
      }

      // 2. Handle URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const catFromUrl = urlParams.get("category");
      const subFromUrl = urlParams.get("task");
      const deployFromUrl = urlParams.get("deploy");

      if (catFromUrl && subFromUrl) {
        handleFormSubmit({
          detail: {
            category: catFromUrl,
            subcategory: subFromUrl,
            deploymentTarget: deployFromUrl || null,
            taskDescription: null
          }
        });
      }
    } catch (err) {
      console.error("Failed to initialize:", err);
      error = "Failed to initialize the AI model advisor. Please refresh the page.";
    }
  });

  async function handleClassify(event) {
    const { taskDescription } = event.detail;

    try {
      let result;
      if (!usingFallback && classifierReady) {
        result = await taskClassifier.classify(taskDescription, { topK: 5 });
      } else {
        result = await fallbackClassifier.classify(taskDescription);
      }

      const topPrediction = result.subcategoryPredictions?.[0] || result.predictions?.[0];
      if (topPrediction?.category) {
        prefillCategory = topPrediction.category;
        prefillSubcategory = topPrediction.subcategory || null;
        prefillConfidence = result.confidence || 0;
      }
    } catch (err) {
      // Classifier failure is not critical — form still works
      console.warn("Classifier pre-fill failed:", err);
    }
  }

  function handleFormSubmit(event) {
    const { category, subcategory, deploymentTarget, taskDescription } = event.detail;

    isLoading = true;
    error = null;
    recommendations = [];
    taskCategory = "";
    taskSubcategory = "";
    ensembleInfo = null;

    try {
      taskCategory = category;
      taskSubcategory = subcategory;

      const groupedModels = modelSelector.getTaskModelsGroupedByTier(
        category,
        subcategory,
        0,
        deploymentTarget
      );

      const filteredRecommendations = [
        ...groupedModels.lightweight.models,
        ...groupedModels.standard.models,
        ...groupedModels.advanced.models,
        ...(groupedModels.xlarge?.models || []),
      ];

      if (filteredRecommendations.length === 0) {
        // If deployment filter yielded no results, show message
        if (deploymentTarget) {
          error = `No ${deploymentTarget}-ready models found for this task. Try "Any environment" to see all options.`;
        } else {
          error = `No models found for ${category} / ${subcategory}.`;
        }
      } else {
        recommendations = filteredRecommendations;
      }

      // Scroll to results
      showResultsHighlight = true;
      setTimeout(() => {
        if (recommendationsSection) {
          recommendationsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setTimeout(() => { showResultsHighlight = false; }, 1500);
      }, 100);

      // Update URL
      const currentUrl = new URL(window.location);
      currentUrl.searchParams.set("category", category);
      currentUrl.searchParams.set("task", subcategory);
      if (deploymentTarget) {
        currentUrl.searchParams.set("deploy", deploymentTarget);
      } else {
        currentUrl.searchParams.delete("deploy");
      }
      goto(currentUrl.pathname + currentUrl.search, { replaceState: true, noScroll: true });
    } catch (err) {
      console.error("Error processing task:", err);
      error = err.message || "An error occurred. Please try again.";
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>AI Model Advisor — Find the Right AI Model</title>
  <meta name="description" content="Find the right AI model for your task. We help you choose between specialized smaller models and powerful larger ones." />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</svelte:head>

<div class="app">
  <div class="background-effects">
    <div class="glow glow-1"></div>
    <div class="glow glow-2"></div>
    <div class="grid-overlay"></div>
  </div>

  <main>
    <header class="hero">
      <h1>
        <span class="gradient-text">AI Model Advisor</span>
      </h1>

      <p class="hero-subtitle">
        Find the <em>right AI model</em> for your task.
      </p>

      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-number">{totalModelCount || '...'}</span>
          <span class="stat-label">Models</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-number">{Object.keys(availableCategories).length || '...'}</span>
          <span class="stat-label">Categories</span>
        </div>
      </div>
    </header>

    <div class="disclaimer-card">
      <div class="disclaimer-icon">💡</div>
      <div class="disclaimer-content">
        <p>
          <strong>This is a starting point, not a final answer.</strong>
          We point you toward models that might fit your task, but you decide what works best for your use case,
          data, and constraints. Smaller models are often highly specialized and can match or outperform
          larger ones for specific tasks while using far fewer resources.
        </p>
      </div>
    </div>

    {#if isModelLoading || modelLoadProgress}
      <div class="model-loading-card" role="status" aria-live="polite" aria-atomic="true">
        <div class="loading-icon">
          <svg class="spinner" viewBox="0 0 50 50" aria-hidden="true">
            <circle cx="25" cy="25" r="20" fill="none" stroke="url(#gradient)" stroke-width="4" stroke-linecap="round" stroke-dasharray="80 120" />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#10b981" />
                <stop offset="100%" stop-color="#34d399" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="loading-content">
          <h3>Loading MiniLM Classifier</h3>
          <p>{modelLoadProgress || "Preparing AI model (~23MB)..."}</p>
          {#if downloadPercentage > 0}
            <div class="progress-track" role="progressbar" aria-valuenow={downloadPercentage} aria-valuemin="0" aria-valuemax="100">
              <div class="progress-fill" style="width: {downloadPercentage}%"></div>
            </div>
          {/if}
          <span class="loading-note">Optional — form works without it • Cached after first load</span>
        </div>
      </div>
    {/if}

    {#if error && !isLoading}
      <div class="error-card" role="alert">
        <div class="error-icon">⚠️</div>
        <div class="error-content">
          <strong>Something went wrong</strong>
          <p>{error}</p>
        </div>
        <button class="error-dismiss" on:click={() => error = null}>✕</button>
      </div>
    {/if}

    <TaskForm
      {tasksData}
      {availableCategories}
      {isLoading}
      {prefillCategory}
      {prefillSubcategory}
      {prefillConfidence}
      on:submit={handleFormSubmit}
      on:classify={handleClassify}
    />

    <div bind:this={recommendationsSection} class:results-highlight={showResultsHighlight}>
      <RecommendationDisplay
        {recommendations}
        {taskCategory}
        {taskSubcategory}
        {isLoading}
        {ensembleInfo}
      />
    </div>

    <footer class="app-footer">
      <div class="footer-content">
        <div class="footer-brand">
          <span class="footer-logo">🌍</span>
          <span>Building sustainable AI, one model at a time</span>
        </div>
        <div class="footer-meta">
          <span>Data from Hugging Face Hub</span>
          <span class="dot">•</span>
          <span>Updated {new Date(modelsData.lastUpdated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span class="dot">•</span>
          <a href="https://github.com/ismaelmartinez/model-selector" target="_blank" rel="noopener noreferrer" aria-label="View source code on GitHub">GitHub</a>
        </div>
      </div>
    </footer>
  </main>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.6;
    background: #0a0f0d;
    color: #e8f5e9;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .app {
    min-height: 100vh;
    position: relative;
    overflow-x: hidden;
  }

  /* Background Effects */
  .background-effects {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(120px);
    opacity: 0.4;
  }

  .glow-1 {
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, #10b981 0%, transparent 70%);
    top: -200px;
    left: -200px;
    animation: float 20s ease-in-out infinite;
  }

  .glow-2 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #059669 0%, transparent 70%);
    bottom: -150px;
    right: -150px;
    animation: float 25s ease-in-out infinite reverse;
  }

  @keyframes float {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(50px, 30px); }
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(16, 185, 129, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(16, 185, 129, 0.03) 1px, transparent 1px);
    background-size: 60px 60px;
  }

  main {
    position: relative;
    z-index: 1;
    max-width: 1000px;
    margin: 0 auto;
    padding: 3rem 1.5rem;
  }

  /* Hero Section */
  .hero {
    text-align: center;
    margin-bottom: 3rem;
  }

  h1 {
    font-size: clamp(2.5rem, 8vw, 4.5rem);
    font-weight: 800;
    margin: 0 0 1rem;
    letter-spacing: -0.03em;
  }

  .gradient-text {
    background: linear-gradient(135deg, #ffffff 0%, #10b981 50%, #34d399 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-subtitle {
    font-size: 1.25rem;
    color: #94a3b8;
    margin: 0 0 2rem;
    line-height: 1.8;
  }

  .hero-subtitle em {
    color: #e8f5e9;
    font-style: normal;
    font-weight: 600;
  }

  .stats-bar {
    display: inline-flex;
    align-items: center;
    gap: 2rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 1rem 2rem;
    backdrop-filter: blur(10px);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-number {
    font-size: 1.5rem;
    font-weight: 700;
    color: #10b981;
  }

  .stat-label {
    font-size: 0.75rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .stat-divider {
    width: 1px;
    height: 30px;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Disclaimer Card */
  .disclaimer-card {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    margin-bottom: 2rem;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
  }

  .disclaimer-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
    margin-top: 0.1rem;
  }

  .disclaimer-content {
    flex: 1;
  }

  .disclaimer-content p {
    margin: 0;
    font-size: 0.875rem;
    color: #94a3b8;
    line-height: 1.7;
  }

  .disclaimer-content strong {
    color: #e8f5e9;
    font-weight: 600;
  }

  /* Loading Card */
  .model-loading-card {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 16px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    backdrop-filter: blur(10px);
  }

  .loading-icon {
    flex-shrink: 0;
  }

  .spinner {
    width: 48px;
    height: 48px;
    animation: spin 1.5s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .loading-content {
    flex: 1;
  }

  .loading-content h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    font-weight: 600;
    color: #34d399;
  }

  .loading-content p {
    margin: 0 0 0.75rem;
    color: #94a3b8;
    font-size: 0.875rem;
  }

  .progress-track {
    height: 6px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #10b981, #34d399);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .loading-note {
    font-size: 0.75rem;
    color: #64748b;
  }

  /* Error Card */
  .error-card {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 16px;
    padding: 1.25rem;
    margin-bottom: 2rem;
  }

  .error-icon {
    font-size: 1.5rem;
  }

  .error-content {
    flex: 1;
  }

  .error-content strong {
    display: block;
    color: #fca5a5;
    margin-bottom: 0.25rem;
  }

  .error-content p {
    margin: 0;
    color: #fecaca;
    font-size: 0.875rem;
  }

  .error-dismiss {
    background: none;
    border: none;
    color: #f87171;
    cursor: pointer;
    padding: 0.25rem;
    font-size: 1rem;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .error-dismiss:hover {
    opacity: 1;
  }

  /* Results highlight animation */
  .results-highlight {
    animation: highlightPulse 1.5s ease-out;
  }

  @keyframes highlightPulse {
    0% {
      box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4);
    }
    50% {
      box-shadow: 0 0 20px 10px rgba(76, 175, 80, 0.2);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
    }
  }

  /* Footer */
  .app-footer {
    margin-top: 4rem;
    padding-top: 2rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .footer-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    color: #94a3b8;
  }

  .footer-logo {
    font-size: 1.25rem;
  }

  .footer-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #64748b;
  }

  .dot {
    opacity: 0.5;
  }

  .footer-meta a {
    color: inherit;
    text-decoration: none;
    transition: opacity 0.2s ease;
  }

  .footer-meta a:hover {
    opacity: 0.7;
    text-decoration: underline;
  }

  .footer-meta a:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  /* Responsive */
  @media (max-width: 640px) {
    main {
      padding: 2rem 1rem;
    }

    h1 {
      font-size: 2.5rem;
    }

    .hero-subtitle {
      font-size: 1rem;
    }

    .stats-bar {
      flex-direction: column;
      gap: 1rem;
      padding: 1.5rem;
    }

    .stat-divider {
      width: 40px;
      height: 1px;
    }
  }

  /* Accessibility */
  @media (prefers-reduced-motion: reduce) {
    .glow-1, .glow-2, .spinner {
      animation: none;
    }
  }

</style>
