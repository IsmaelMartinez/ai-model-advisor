<script>
  import TaskInput from "../components/TaskInput.svelte";
  import RecommendationDisplay from "../components/RecommendationDisplay.svelte";
  import ClarificationFlow from "../components/ClarificationFlow.svelte";
  import { EmbeddingTaskClassifier } from "../lib/classification/EmbeddingTaskClassifier.js";
  import { BrowserTaskClassifier } from "../lib/classification/BrowserTaskClassifier.js";
  import { CLASSIFIER_CONFIG } from "../lib/classification/classifierConfig.js";
  import { ModelSelector } from "../lib/recommendation/ModelSelector.js";
  import { getDefaultSubcategory } from "../lib/data/constants.js";

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
  let taskDescription = "";
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
  
  // Clarification flow state
  let showClarification = false;
  let clarificationOptions = [];
  let pendingTaskDescription = "";

  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  onMount(async () => {
    try {
      // 1. Initialize components first
      modelSelector = new ModelSelector(modelsData);
      fallbackClassifier = new BrowserTaskClassifier(); // Uses tasks.json internally

      // Use new MiniLM embedding classifier (23MB vs 500MB Llama)
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
            console.warn("⚠️ Embedding classifier failed, using keyword fallback");
            usingFallback = true;
          }
        },
      });

      // Initialize the embedding classifier with task data
      // This triggers model download on first visit, cached after
      const initResult = await taskClassifier.initialize(tasksData);
      if (initResult.success) {
        classifierReady = true;
        usingFallback = false;
        console.log("✅ Embedding classifier ready (98.3% accuracy, 23MB)");
      } else {
        console.warn("⚠️ Embedding classifier failed, using keyword fallback");
        usingFallback = true;
      }

      console.log("✅ Data pipeline initialized successfully");

      // 2. Handle URL parameters after initialization is complete
      const urlParams = new URLSearchParams(window.location.search);
      const taskFromUrl = urlParams.get("task");
      if (taskFromUrl) {
        try {
          taskDescription = decodeURIComponent(taskFromUrl);

          // Security: Validate and sanitize URL parameter
          // Enforce maximum length (500 chars)
          if (taskDescription.length > 500) {
            taskDescription = taskDescription.substring(0, 500);
            console.warn("Task from URL exceeded 500 characters, truncated");
          }

          // Security: Strip control characters and non-printable characters
          taskDescription = taskDescription.replace(/[\x00-\x1F\x7F]/g, '');

          // Components are now guaranteed to be initialized
          handleTaskSubmit({ detail: { taskDescription } });
        } catch (err) {
          console.error("Failed to process task from URL:", err);
          // Don't auto-submit if URL parameter is malformed
        }
      }
    } catch (err) {
      console.error("❌ Failed to initialize data pipeline:", err);
      error = "Failed to initialize the AI model advisor. Please refresh the page.";
    }
  });

  // Check if task needs clarification
  function needsClarification(description) {
    const lowerDesc = description.toLowerCase();
    const ambiguousPatterns = [
      { pattern: /\b(help|assist|work with)\b.*\b(ai|model|ml)\b/i, reason: "general" },
      { pattern: /^(i want to|i need to|help me)\s+\w+$/i, reason: "too_short" },
      { pattern: /\b(process|handle|work with)\s+(data|information)\b/i, reason: "data_ambiguous" },
      { pattern: /\b(analyze|analysis)\b/i, matchMultiple: ["text", "image", "audio", "video", "time", "series"], reason: "analysis_type" },
    ];

    // Check for very short descriptions
    if (description.split(/\s+/).length < 4) {
      return { needs: true, reason: "too_short" };
    }

    // Check ambiguous patterns
    for (const p of ambiguousPatterns) {
      if (p.pattern.test(lowerDesc)) {
        return { needs: true, reason: p.reason };
      }
    }

    return { needs: false };
  }

  // Generate clarification options based on ambiguity
  function generateClarificationOptions(description, reason) {
    const options = {
      general: [
        { label: "📝 Text & Language", desc: "Analyze, generate, or classify text", category: "natural_language_processing" },
        { label: "🖼️ Images & Vision", desc: "Classify, detect, or segment images", category: "computer_vision" },
        { label: "🎤 Speech & Audio", desc: "Transcribe, synthesize, or analyze audio", category: "speech_processing" },
        { label: "📈 Time Series & Forecasting", desc: "Predict trends or detect anomalies", category: "time_series" },
        { label: "🎯 Recommendations", desc: "Suggest products, content, or items", category: "recommendation_systems" },
      ],
      too_short: [
        { label: "📝 Text & Language", desc: "NLP tasks like classification, generation, translation", category: "natural_language_processing" },
        { label: "🖼️ Images & Vision", desc: "Computer vision tasks", category: "computer_vision" },
        { label: "🎤 Speech & Audio", desc: "Audio processing tasks", category: "speech_processing" },
        { label: "📈 Data & Analytics", desc: "Time series, forecasting, anomaly detection", category: "time_series" },
        { label: "🤖 Other AI Tasks", desc: "Reinforcement learning, recommendations", category: "recommendation_systems" },
      ],
      data_ambiguous: [
        { label: "📊 Tabular Data", desc: "Structured data, spreadsheets, databases", category: "data_preprocessing" },
        { label: "📝 Text Data", desc: "Documents, articles, messages", category: "natural_language_processing" },
        { label: "🖼️ Image Data", desc: "Photos, graphics, scans", category: "computer_vision" },
        { label: "📈 Time Series Data", desc: "Sequential measurements over time", category: "time_series" },
      ],
      analysis_type: [
        { label: "📝 Text Analysis", desc: "Sentiment, entities, classification", category: "natural_language_processing" },
        { label: "🖼️ Image Analysis", desc: "Object detection, segmentation", category: "computer_vision" },
        { label: "🎤 Audio Analysis", desc: "Speech recognition, sound classification", category: "speech_processing" },
        { label: "📈 Trend Analysis", desc: "Time series forecasting, patterns", category: "time_series" },
      ],
      low_confidence: [
        { label: "📝 Text & Language", desc: "Summarization, generation, translation, analysis", category: "natural_language_processing" },
        { label: "🖼️ Images & Vision", desc: "Classification, detection, segmentation", category: "computer_vision" },
        { label: "🎤 Speech & Audio", desc: "Transcription, synthesis, audio analysis", category: "speech_processing" },
        { label: "📈 Time Series", desc: "Forecasting, anomaly detection, trends", category: "time_series" },
        { label: "🎯 Recommendations", desc: "Content, product, or user suggestions", category: "recommendation_systems" },
        { label: "🎮 Reinforcement Learning", desc: "Game AI, robotics, decision making", category: "reinforcement_learning" },
        { label: "🔧 Data Processing", desc: "Cleaning, preprocessing, feature extraction", category: "data_preprocessing" },
      ],
    };

    return options[reason] || options.general;
  }

  async function handleTaskSubmit(event) {
    const { taskDescription: description } = event.detail;

    if (!taskClassifier || !modelSelector) {
      error = "System not initialized. Please refresh the page.";
      return;
    }

    // Check if clarification is needed
    const clarification = needsClarification(description);
    if (clarification.needs) {
      pendingTaskDescription = description;
      clarificationOptions = generateClarificationOptions(description, clarification.reason);
      showClarification = true;
      return;
    }

    await processTask(description);
  }

  async function handleClarificationSelect(event) {
    const { category, originalDescription } = event.detail;
    showClarification = false;
    
    // Process with the clarified category
    await processTask(originalDescription, category);
  }

  function handleClarificationSkip() {
    showClarification = false;
    // Pass skipClarification=true to prevent infinite loop
    processTask(pendingTaskDescription, null, true);
  }

  async function handleClarificationText(event) {
    const { originalDescription, additionalDetails } = event.detail;
    showClarification = false;
    
    // Combine original description with additional details
    // Normalize: remove trailing punctuation from original before adding separator
    const normalizedOriginal = originalDescription.replace(/[.!?,;:]+$/, '').trim();
    const enhancedDescription = `${normalizedOriginal}. ${additionalDetails}`;
    
    // Update the task description in the input field
    taskDescription = enhancedDescription;
    
    // Process with enhanced description, skip further clarification to prevent loops
    await processTask(enhancedDescription, null, true);
  }

  async function processTask(description, forcedCategory = null, skipClarification = false) {
    isLoading = true;
    error = null;
    recommendations = [];
    taskCategory = "";
    taskSubcategory = "";

    try {
      console.log("🔍 Analyzing task:", description);

      let classificationResult;

      if (forcedCategory) {
        // Use the clarified category directly
        classificationResult = {
          predictions: [{ category: forcedCategory, confidence: 1.0 }],
          subcategoryPredictions: [{ category: forcedCategory, subcategory: getDefaultSubcategory(forcedCategory), confidence: 1.0 }]
        };
        ensembleInfo = null;
      } else {
        try {
          if (!classifierReady && !usingFallback) {
            modelLoadProgress = "Loading AI model (first time only, ~23MB)...";
            isModelLoading = true;
          }

          if (!usingFallback && classifierReady) {
            // Use embedding classifier (98.3% accuracy) with voting (5 votes)
            classificationResult = await taskClassifier.classify(description, { topK: 5 });
            
            // Set ensemble/voting info for display
            // Shows how many of the top-K examples agree on the category
            ensembleInfo = {
              method: 'embedding_similarity',
              votes: classificationResult.votesForWinner,
              total: classificationResult.totalVotes,
              confidence: classificationResult.confidence,
              similarExamples: classificationResult.similarExamples || []
            };
            
            // If confidence is below threshold AND not forced by clarification, ask for more details
            // For voting mode (5 votes): need at least 3/5 to agree
            // For fast mode (1 vote): just check confidence threshold
            const lowVoteAgreement = classificationResult.totalVotes > 1 && classificationResult.votesForWinner < 3;
            const lowConfidence = classificationResult.confidence < 0.70;
            
            if ((lowConfidence || lowVoteAgreement) && !forcedCategory && !skipClarification) {
              console.log(`⚠️ Low confidence (${(classificationResult.confidence * 100).toFixed(1)}%, ${classificationResult.votesForWinner}/${classificationResult.totalVotes} agree) - asking for clarification`);
              
              // Trigger clarification flow instead of silently using fallback
              pendingTaskDescription = description;
              clarificationOptions = generateClarificationOptions(description, "low_confidence");
              showClarification = true;
              isLoading = false;
              return; // Stop processing, show clarification UI
            }
          } else if (usingFallback) {
            // Use keyword fallback
            classificationResult = await fallbackClassifier.classify(description);
            ensembleInfo = null;
          } else {
            throw new Error("Classifier not ready");
          }

          isModelLoading = false;
          modelLoadProgress = "";
        } catch (classifierError) {
          console.warn("⚠️ Embedding classifier failed, using keyword fallback:", classifierError);
          classificationResult = await fallbackClassifier.classify(description);
          usingFallback = true;
          isModelLoading = false;
          modelLoadProgress = "";
        }
      }

      const topPrediction = classificationResult.subcategoryPredictions[0] || classificationResult.predictions[0];

      if (!topPrediction || !topPrediction.category) {
        throw new Error("Could not classify the task. Please try describing it differently.");
      }

      const classification = {
        category: topPrediction.category,
        subcategory: topPrediction.subcategory || getDefaultSubcategory(topPrediction.category),
      };

      taskCategory = classification.category;
      taskSubcategory = classification.subcategory;

      const groupedModels = modelSelector.getTaskModelsGroupedByTier(
        classification.category,
        classification.subcategory,
      );

      const filteredRecommendations = [
        ...groupedModels.lightweight.models,
        ...groupedModels.standard.models,
        ...groupedModels.advanced.models,
      ];

      if (filteredRecommendations.length === 0) {
        throw new Error(`No models found for ${classification.category}. Try a different task description.`);
      }

      recommendations = filteredRecommendations;

      // Scroll to results and show highlight animation
      showResultsHighlight = true;
      setTimeout(() => {
        if (recommendationsSection) {
          recommendationsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // Remove highlight after animation completes
        setTimeout(() => { showResultsHighlight = false; }, 1500);
      }, 100);

      const currentUrl = new URL(window.location);
      currentUrl.searchParams.set("task", encodeURIComponent(description));
      goto(currentUrl.pathname + currentUrl.search, { replaceState: true, noScroll: true });
    } catch (err) {
      console.error("❌ Error processing task:", err);
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
          <span class="stat-number">150+</span>
          <span class="stat-label">Models</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-number">7</span>
          <span class="stat-label">Categories</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-number">98.3%</span>
          <span class="stat-label">Accuracy</span>
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
          larger ones for specific tasks while using far fewer resources. When you refine your task description, 
          we re-run the classifier, so recommendations may change as we better understand your needs.
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
          <span class="loading-note">One-time download • Cached in browser for instant future loads</span>
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

    {#if showClarification}
      <ClarificationFlow 
        options={clarificationOptions}
        originalDescription={pendingTaskDescription}
        on:select={handleClarificationSelect}
        on:skip={handleClarificationSkip}
        on:clarify={handleClarificationText}
      />
    {:else}
      <TaskInput bind:taskDescription {isLoading} on:submit={handleTaskSubmit} />
    {/if}

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

  .highlight {
    display: inline-block;
    margin-top: 0.5rem;
    color: #10b981;
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

  @media (prefers-contrast: high) {
    .badge {
      border-width: 2px;
    }
  }
</style>
