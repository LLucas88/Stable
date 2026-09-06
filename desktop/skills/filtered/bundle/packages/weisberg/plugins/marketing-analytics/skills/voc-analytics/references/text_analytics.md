# Text Analytics Reference

Theme extraction prompting patterns and sentiment scoring approach for
open-text survey responses.

## Theme Extraction Approach

### Overview

Theme extraction uses LLM-based categorization (Claude API with structured
output) rather than traditional NLP topic models (LDA, NMF). This provides
more interpretable, actionable themes and handles the short, noisy nature of
survey verbatims better than statistical topic models.

### Predefined Theme Taxonomy

Start with a predefined taxonomy based on the business context. Example for
a financial services firm:

```
- Product Quality: features, functionality, reliability, performance
- Customer Service: responsiveness, helpfulness, resolution, agent knowledge
- Pricing & Value: fees, pricing fairness, value for money, billing
- Digital Experience: website usability, app experience, online tools
- Onboarding: account setup, initial experience, documentation
- Communication: email clarity, notification relevance, update frequency
- Trust & Security: data protection, fraud prevention, transparency
- Speed & Efficiency: processing time, wait times, turnaround
```

The taxonomy should be customized per organization. Allow 8-15 top-level
themes for manageability.

### Emergent Theme Discovery

In addition to predefined themes, the LLM should identify new themes not
covered by the taxonomy. The prompt instructs the model to flag responses
that do not fit existing categories and propose new theme labels.

Emergent themes are reviewed periodically and either incorporated into the
taxonomy or discarded if they represent noise.

### Prompting Pattern for Theme Extraction

**System prompt:**

```
You are a customer feedback analyst. Your task is to categorize open-text
survey responses into themes and assess sentiment.

You will receive a batch of customer responses. For each response, output
a JSON object with the following fields:
- respondent_id: the ID of the respondent
- themes: array of theme objects, each with:
  - theme_name: string matching a predefined theme OR a new emergent theme
  - is_predefined: boolean indicating if the theme is from the predefined list
  - confidence: float 0.0-1.0 indicating classification confidence
- sentiment: object with:
  - polarity: one of "positive", "neutral", "negative"
  - intensity: float 0.0-1.0 (0 = barely detectable, 1 = very strong)
- language: ISO 639-1 code of the detected language
```

**User prompt template:**

```
Predefined themes: {theme_taxonomy}

Classify the following survey responses. Each response may belong to
multiple themes. If a response does not fit any predefined theme, create
a new theme name that is concise and descriptive.

Responses:
{batch_of_responses}

Return a JSON array of classification objects.
```

### Batching Strategy

- Process responses in batches of 20-50 to balance throughput with context
  window usage.
- Include the full theme taxonomy in each batch to maintain consistency.
- For very large datasets (10,000+ responses), process in parallel batches
  and reconcile emergent themes across batches in a consolidation pass.

### Quality Assurance

- On the first batch, manually review classifications for a random sample
  of 20 responses to verify theme alignment.
- Track inter-batch consistency: if the same response text appears in
  multiple surveys, it should receive the same classification.
- Target 85%+ agreement with human-labeled categories on a validation set
  of 200 responses.

## Sentiment Scoring Approach

### Classification Schema

| Polarity | Intensity Range | Example                                    |
| :------- | :-------------- | :----------------------------------------- |
| Positive | 0.8-1.0         | "Absolutely love this product!"            |
| Positive | 0.5-0.7         | "Pretty good overall, happy with it"       |
| Positive | 0.1-0.4         | "It's fine, does what it needs to"         |
| Neutral  | 0.0-1.0         | "I used the product" (factual, no opinion) |
| Negative | 0.1-0.4         | "Could be a bit better"                    |
| Negative | 0.5-0.7         | "Disappointed with the service"            |
| Negative | 0.8-1.0         | "Terrible experience, canceling my account"|

### Handling Edge Cases

- **Mixed sentiment:** When a response contains both positive and negative
  elements, assign the dominant polarity and note the mixed nature in the
  output. Example: "The product is great but customer service was awful" ->
  negative (dominant), intensity 0.6, mixed=true.

- **Sarcasm and irony:** Instruct the LLM to interpret intended sentiment
  rather than literal text. "Oh great, another outage" -> negative.

- **Empty or uninformative responses:** Classify as neutral with intensity
  0.0. Examples: "N/A", "no comment", single-character responses.

- **Non-English responses:** Detect language and classify in the original
  language. The LLM should handle major languages without translation.

### Sentiment Aggregation

For reporting aggregate sentiment across a theme or segment:

```
Sentiment Score = (count_positive - count_negative) / total_responses
```

This yields a score from -1.0 (all negative) to +1.0 (all positive),
analogous to NPS but for unstructured text.

**Weighted variant:**

```
Weighted Sentiment = sum(polarity_sign * intensity) / total_responses
```

Where `polarity_sign` is +1 for positive, 0 for neutral, -1 for negative.

## Theme-Sentiment Matrix

Combine theme extraction and sentiment scoring into a matrix for dashboard
visualization:

```
             | Positive | Neutral | Negative | Net Sentiment |
Product      |    45    |   12    |    8     |     +0.57     |
Service      |    20    |    5    |   30     |     -0.18     |
Pricing      |    10    |    8    |   25     |     -0.35     |
Digital UX   |    35    |   15    |   12     |     +0.37     |
```

This matrix enables quick identification of which themes are driving
positive vs. negative sentiment and should be a primary output artifact.

## Multilingual Considerations

- Detect language per response using the LLM's built-in language detection.
- Classify in the original language; do not translate before classification.
- Report theme frequencies by language to identify language-specific issues.
- Ensure the predefined theme taxonomy uses language-neutral concepts that
  map across languages.

## Structured Output Format

### Per-Response Output

```json
{
  "respondent_id": "R12345",
  "response_text": "The mobile app is great but transfers take too long",
  "themes": [
    {
      "theme_name": "Digital Experience",
      "is_predefined": true,
      "confidence": 0.92
    },
    {
      "theme_name": "Speed & Efficiency",
      "is_predefined": true,
      "confidence": 0.88
    }
  ],
  "sentiment": {
    "polarity": "negative",
    "intensity": 0.5,
    "mixed": true
  },
  "language": "en"
}
```

### Aggregated Output

```json
{
  "period": "2026-Q1",
  "total_responses": 1250,
  "theme_summary": [
    {
      "theme_name": "Digital Experience",
      "count": 342,
      "pct_of_responses": 27.4,
      "net_sentiment": 0.37,
      "trend_vs_prior": "+3.2pp"
    }
  ],
  "emergent_themes": [
    {
      "theme_name": "AI Chat Support",
      "count": 45,
      "first_detected": "2026-01-15"
    }
  ]
}
```
