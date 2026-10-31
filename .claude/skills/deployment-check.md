---
description: Pre-deployment validation checklist for AI Model Selector
tags: [deployment, ci-cd, quality]
---

# Deployment Check Skill

You are performing pre-deployment validation for AI Model Selector. Run through this comprehensive checklist:

## Pre-Deployment Checklist

### 1. Code Quality

```bash
# Run fast tests (REQUIRED)
npm test
```

**Must pass:** All 23 tests ✅

### 2. Build Verification

```bash
# Build for production
npm run build
```

**Check for:**
- Build completes successfully ✅
- No critical errors (warnings OK)
- Check bundle size in output (should be ~40KB gzipped)

### 3. Preview Testing

```bash
# Preview production build
npm run preview
```

**Manual checks at localhost:4174:**
- [ ] Page loads in <1 second
- [ ] Enter a task description (10-500 chars)
- [ ] Classification returns results
- [ ] Recommendations display correctly
- [ ] Environmental scores show (1-3 scale)
- [ ] Keyboard navigation works (Tab, Enter, Ctrl+Enter)
- [ ] No console errors

### 4. Accessibility Check

**Test keyboard navigation:**
- [ ] Tab through all interactive elements
- [ ] Enter submits the form
- [ ] Ctrl+Enter submits from textarea
- [ ] Focus indicators visible
- [ ] No keyboard traps

**Test screen reader (if available):**
- [ ] Form labels announced
- [ ] Results announced (aria-live regions)
- [ ] Semantic HTML structure

### 5. Cross-Browser Testing (Optional but recommended)

**Minimum: Chrome (primary target)**
**Nice to have: Firefox, Safari**

Test core flow:
- [ ] Page loads
- [ ] Classification works
- [ ] Results display

### 6. Configuration Verification

**Check critical configs:**

```bash
# Verify WebGPU headers in vite.config.js
grep -A2 "Cross-Origin-Embedder-Policy" vite.config.js

# Verify transformers.js exclusion
grep -A2 "optimizeDeps" vite.config.js

# Verify static adapter
grep "adapter-static" vite.config.js
```

**All must be present and correct** ✅

### 7. Data Validation

```bash
# Check data files exist and are valid JSON
node -e "JSON.parse(require('fs').readFileSync('src/lib/data/models.json'))"
node -e "JSON.parse(require('fs').readFileSync('src/lib/data/tasks.json'))"
```

**Both must parse without errors** ✅

### 8. Git Status

```bash
git status
```

**Check:**
- [ ] All changes committed
- [ ] On correct branch (main for production deploy)
- [ ] No unexpected changes in working directory

### 9. GitHub Actions Check (for auto-deploy)

**Review `.github/workflows/deploy.yml`:**
- [ ] Workflow file exists
- [ ] Triggers on push to main
- [ ] Runs `npm test` before deploy
- [ ] Builds with `npm run build`
- [ ] Deploys to GitHub Pages

### 10. Final Verification

**After deployment to GitHub Pages:**

1. Visit: https://ismaelmartinez.github.io/model-selector
2. Test complete user flow:
   - Enter task description
   - Get recommendations
   - Verify environmental scores
3. Check browser console for errors
4. Verify page loads in <1 second

## Deployment Commands

### Automated (Recommended)

```bash
# Ensure all checks pass, then:
git push origin main

# GitHub Actions will:
# 1. Run tests
# 2. Build application
# 3. Deploy to GitHub Pages
```

### Manual

```bash
# Build locally
npm run build

# Upload dist/ directory to hosting provider
# (GitHub Pages, Netlify, Vercel, etc.)
```

## Rollback Plan

**If deployment fails or has critical issues:**

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or rollback to specific commit
git reset --hard <previous-commit-hash>
git push --force origin main  # CAUTION: Only if necessary
```

## Post-Deployment

1. Monitor for errors in production
2. Check analytics (if available)
3. Verify GitHub Actions completed successfully
4. Test from different networks/devices
5. Document any issues found

## Usage

When user asks to "deploy" or "check deployment readiness", use this skill to validate everything before pushing to production.
