# User Guide

## Quick Start

1. Open the [AI Model Advisor](https://ismaelmartinez.github.io/ai-model-advisor)
2. Describe your task (e.g., "classify customer support tickets by urgency")
3. Review the recommendations

## Tips for Better Results

Be specific about:
- **Task type**: classify, detect, generate, predict
- **Data type**: text, images, audio, time series
- **Context**: what you're trying to achieve

**Good**: "Detect objects in security camera footage"  
**Too vague**: "Image stuff"

## Understanding Recommendations

Models are ranked by efficiency (smaller first):

| Tier | Size | Best for |
|------|------|----------|
| Lightweight | ≤500MB | Edge, mobile, browser |
| Standard | ≤4GB | Cloud, consumer GPU |
| Advanced | ≤20GB | Dedicated GPU |

Models are ranked by efficiency — smaller, greener models appear first.

### Environmental Impact

- 🌱 **Low**: Runs on edge devices, minimal power
- ⚡ **Medium**: Cloud/server deployment
- 🔥 **High**: Requires dedicated hardware

## About Smaller Models

Lightweight models are often specialized for specific tasks. A table detection model won't do general object detection. Always verify the model fits your exact use case.

## Offline Use

Works offline after the first visit (PWA). Your queries stay private and run locally in your browser.

## Keyboard Shortcuts

- **Tab**: Navigate between elements
- **Enter**: Submit or select
- **Ctrl+Enter**: Quick submit
