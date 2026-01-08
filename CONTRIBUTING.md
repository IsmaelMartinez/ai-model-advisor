# Contributing to AI Model Advisor

Thank you for your interest in contributing to the AI Model Advisor project!

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Repository Setup

### Branch Protection (For Maintainers)

The main branch is protected to ensure code quality. To set up branch protection on a new fork or repository:

**Prerequisites:**
- gh CLI installed ([installation guide](https://cli.github.com))
- gh CLI authenticated (`gh auth login`)
- Repository admin permissions

**Setup:**
```bash
./scripts/setup-branch-protection.sh
```

**Verification:**
- View settings at: Settings → Branches → Branch protection rules
- Test by creating a PR and verifying status checks are required

The protection enforces:
- ✓ All tests must pass
- ✓ Production build must succeed
- ✗ No code review required (automated checks only)

## Development

- Run the development server: `npm run dev`
- Run tests: `npm test`
- Build for production: `npm run build`

## Pull Request Process

1. Ensure your code follows the existing style and conventions
2. Add tests for new functionality
3. Update documentation as needed
4. Ensure all tests pass
5. Create a pull request with a clear description of your changes

## Types of Contributions

### Code Contributions
- Bug fixes
- New features
- Performance improvements
- UI/UX enhancements

### Documentation
- Improve existing documentation
- Add examples and tutorials
- Fix typos and clarify instructions

### Decision Graph
- Add new model recommendations
- Update existing model information
- Improve categorization logic

## Code of Conduct

This project is committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and constructive in all interactions.

## Questions?

Feel free to open an issue for questions, suggestions, or bug reports.