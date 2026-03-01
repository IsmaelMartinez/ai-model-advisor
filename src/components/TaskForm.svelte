<script>
  import { createEventDispatcher } from 'svelte';

  /** @type {Object} tasks data from tasks.json */
  export let tasksData = {};

  /** @type {Object} available categories from ModelSelector.getAvailableCategories() */
  export let availableCategories = {};

  /** @type {boolean} */
  export let isLoading = false;

  /** @type {string|null} pre-filled category from classifier */
  export let prefillCategory = null;

  /** @type {string|null} pre-filled subcategory from classifier */
  export let prefillSubcategory = null;

  /** @type {number} classifier confidence (0-1) when pre-filling */
  export let prefillConfidence = 0;

  const dispatch = createEventDispatcher();

  // Form state
  let selectedCategory = '';
  let selectedSubcategory = '';
  let selectedDeployment = '';
  let taskDescription = '';
  let showTextInput = false;

  // Deployment target options
  const deploymentOptions = [
    { value: '', label: 'Any environment' },
    { value: 'browser', label: 'Browser (WebGPU/WASM)' },
    { value: 'edge', label: 'Edge / Mobile' },
    { value: 'cloud', label: 'Cloud / Server' }
  ];

  // Build category options from tasks data + available models
  $: categoryOptions = buildCategoryOptions(tasksData, availableCategories);
  $: subcategoryOptions = buildSubcategoryOptions(selectedCategory, tasksData, availableCategories);

  // Auto-select first subcategory when category changes
  $: if (selectedCategory && subcategoryOptions.length > 0) {
    const currentValid = subcategoryOptions.some(s => s.value === selectedSubcategory);
    if (!currentValid) {
      selectedSubcategory = subcategoryOptions[0].value;
    }
  }

  // Accept pre-fill from classifier
  $: if (prefillCategory && !selectedCategory) {
    selectedCategory = prefillCategory;
    if (prefillSubcategory) {
      selectedSubcategory = prefillSubcategory;
    }
  }

  function buildCategoryOptions(tasks, available) {
    if (!tasks?.taskTaxonomy) return [];
    return Object.entries(tasks.taskTaxonomy)
      .filter(([key]) => available[key])
      .map(([key, val]) => ({
        value: key,
        label: val.label,
        description: val.description,
        modelCount: Object.values(available[key] || {}).reduce((a, b) => a + b, 0)
      }));
  }

  function buildSubcategoryOptions(category, tasks, available) {
    if (!category || !tasks?.taskTaxonomy?.[category]) return [];
    const subcats = tasks.taskTaxonomy[category].subcategories;
    const availableSubs = available[category] || {};
    return Object.entries(subcats)
      .filter(([key]) => availableSubs[key])
      .map(([key, val]) => ({
        value: key,
        label: val.label,
        description: val.description,
        modelCount: availableSubs[key] || 0
      }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!selectedCategory || !selectedSubcategory) return;

    dispatch('submit', {
      category: selectedCategory,
      subcategory: selectedSubcategory,
      deploymentTarget: selectedDeployment || null,
      taskDescription: taskDescription.trim() || null
    });
  }

  function handleKeydown(event) {
    if (event.ctrlKey && event.key === 'Enter') {
      handleSubmit(event);
    }
  }

  // Dispatch classify event when user types (for classifier pre-fill)
  let classifyTimeout;
  function handleTextInput() {
    clearTimeout(classifyTimeout);
    if (taskDescription.trim().length >= 10) {
      classifyTimeout = setTimeout(() => {
        dispatch('classify', { taskDescription: taskDescription.trim() });
      }, 400);
    }
  }

  function formatCategory(cat) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form on:submit={handleSubmit} class="task-form" novalidate on:keydown={handleKeydown}>

  <!-- Optional text input for classifier pre-fill -->
  <div class="text-assist">
    <button
      type="button"
      class="toggle-text"
      on:click={() => showTextInput = !showTextInput}
      aria-expanded={showTextInput}
    >
      {#if showTextInput}
        Hide text assist
      {:else}
        Describe your task to auto-fill
      {/if}
    </button>

    {#if showTextInput}
      <div class="text-input-wrapper">
        <label for="task-description-assist" class="sr-only">Describe your AI task for auto-detection</label>
        <textarea
          id="task-description-assist"
          bind:value={taskDescription}
          on:input={handleTextInput}
          placeholder="e.g., 'I want to classify product images' — we'll detect the right category"
          rows="2"
          maxlength="500"
          disabled={isLoading}
        ></textarea>
        {#if prefillConfidence > 0}
          <div class="prefill-indicator" role="status">
            Detected: {formatCategory(prefillCategory)} — {formatCategory(prefillSubcategory)}
            <span class="confidence">({(prefillConfidence * 100).toFixed(0)}%)</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Main form: 3 dropdowns -->
  <div class="form-grid">
    <div class="form-field">
      <label for="category-select">Task Category</label>
      <select
        id="category-select"
        bind:value={selectedCategory}
        disabled={isLoading}
        required
      >
        <option value="" disabled>Select a category...</option>
        {#each categoryOptions as opt}
          <option value={opt.value}>{opt.label} ({opt.modelCount} models)</option>
        {/each}
      </select>
      {#if selectedCategory}
        <span class="field-hint">{categoryOptions.find(o => o.value === selectedCategory)?.description || ''}</span>
      {/if}
    </div>

    <div class="form-field">
      <label for="subcategory-select">Specific Task</label>
      <select
        id="subcategory-select"
        bind:value={selectedSubcategory}
        disabled={isLoading || !selectedCategory}
        required
      >
        <option value="" disabled>Select a task...</option>
        {#each subcategoryOptions as opt}
          <option value={opt.value}>{opt.label} ({opt.modelCount} models)</option>
        {/each}
      </select>
      {#if selectedSubcategory}
        <span class="field-hint">{subcategoryOptions.find(o => o.value === selectedSubcategory)?.description || ''}</span>
      {/if}
    </div>

    <div class="form-field">
      <label for="deployment-select">Run it on</label>
      <select
        id="deployment-select"
        bind:value={selectedDeployment}
        disabled={isLoading}
      >
        {#each deploymentOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <button
    type="submit"
    class="submit-button"
    disabled={isLoading || !selectedCategory || !selectedSubcategory}
  >
    {#if isLoading}
      <svg class="spinner" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="40 60" />
      </svg>
      <span>Finding models...</span>
    {:else}
      <span>Find Eco-Friendly Models</span>
      <span class="arrow">→</span>
    {/if}
  </button>
</form>

<style>
  .task-form {
    margin-bottom: 2rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Text assist toggle */
  .text-assist {
    margin-bottom: 1.5rem;
  }

  .toggle-text {
    background: none;
    border: 1px dashed rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 0.6rem 1rem;
    color: #64748b;
    font-size: 0.85rem;
    cursor: pointer;
    width: 100%;
    text-align: center;
    transition: all 0.2s ease;
  }

  .toggle-text:hover {
    border-color: rgba(16, 185, 129, 0.4);
    color: #94a3b8;
  }

  .text-input-wrapper {
    margin-top: 0.75rem;
  }

  .text-input-wrapper textarea {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #e8f5e9;
    font-family: inherit;
    font-size: 0.9rem;
    line-height: 1.5;
    resize: none;
  }

  .text-input-wrapper textarea::placeholder {
    color: #4b5563;
  }

  .text-input-wrapper textarea:focus {
    outline: none;
    border-color: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
  }

  .text-input-wrapper textarea:disabled {
    color: #6b7280;
    cursor: not-allowed;
  }

  .prefill-indicator {
    margin-top: 0.5rem;
    padding: 0.4rem 0.75rem;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 6px;
    font-size: 0.8rem;
    color: #34d399;
  }

  .confidence {
    opacity: 0.7;
  }

  /* Form grid */
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .form-field:last-child {
    grid-column: 1 / -1;
  }

  .form-field label {
    font-size: 0.75rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
  }

  .form-field select {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #e8f5e9;
    font-family: inherit;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s ease;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2364748b' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 1rem center;
    padding-right: 2.5rem;
  }

  .form-field select:focus {
    outline: none;
    border-color: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
  }

  .form-field select:disabled {
    color: #4b5563;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .form-field select option {
    background: #1a1f2e;
    color: #e8f5e9;
  }

  .field-hint {
    font-size: 0.75rem;
    color: #4b5563;
    padding-left: 0.25rem;
  }

  /* Submit button */
  .submit-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
    padding: 1.1rem 1.5rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .submit-button::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.1) 100%);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .submit-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
  }

  .submit-button:hover:not(:disabled)::before {
    opacity: 1;
  }

  .submit-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .submit-button:disabled {
    background: #1f2937;
    color: #4b5563;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .submit-button .arrow {
    transition: transform 0.2s ease;
  }

  .submit-button:hover:not(:disabled) .arrow {
    transform: translateX(4px);
  }

  .spinner {
    width: 20px;
    height: 20px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Responsive */
  @media (max-width: 640px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-field:last-child {
      grid-column: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .submit-button,
    .toggle-text,
    .spinner {
      transition: none;
      animation: none;
    }
  }
</style>
