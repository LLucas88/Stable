# Sentiment Analysis Methodology

NLP sentiment classification approach and model selection for social media text.

## Model Selection

### Primary model: cardiffnlp/twitter-roberta-base-sentiment-latest

A RoBERTa-base model fine-tuned on approximately 124 million tweets and then
fine-tuned for sentiment analysis on the TweetEval benchmark.

| Property           | Value                                           |
|--------------------|-------------------------------------------------|
| Architecture       | RoBERTa-base (125M parameters)                  |
| Training data      | 124M tweets (pre-training) + TweetEval (fine-tuning) |
| Output classes     | Negative (0), Neutral (1), Positive (2)         |
| Benchmark F1       | ~0.72 on TweetEval sentiment                    |
| Max sequence length| 512 tokens                                      |
| Inference speed    | ~50 texts/second on CPU, ~500/second on GPU     |

### Why this model

- Pre-trained on social media text, so it handles informal language, hashtags,
  mentions, emojis, and abbreviations natively.
- Three-class output (positive/neutral/negative) aligns with standard social
  listening taxonomy.
- Small enough for CPU inference in batch pipelines; GPU optional.
- Open-source and commercially usable (MIT license).

### Alternative models

| Model                                        | Use Case                          | Trade-off              |
|----------------------------------------------|-----------------------------------|------------------------|
| `cardiffnlp/twitter-roberta-base-emotion`    | Emotion detection (joy, anger, etc.) | More granular but different task |
| `nlptown/bert-base-multilingual-uncased-sentiment` | Multilingual sentiment   | Lower accuracy on English |
| `distilbert-base-uncased-finetuned-sst-2-english` | Binary sentiment (pos/neg) | No neutral class       |
| OpenAI / Anthropic API                       | Complex nuance, sarcasm detection | Higher cost, API dependency |

## Classification Pipeline

### Step 1: Text preprocessing

1. Remove URLs (replace with `[URL]` token).
2. Normalize @mentions to `@user` to avoid model bias toward specific accounts.
3. Preserve emojis; the model was trained with emoji context.
4. Truncate to 512 tokens (applies to <0.5% of social media posts).
5. Handle encoding issues (smart quotes, unicode normalization).

### Step 2: Inference

1. Tokenize text using the model's AutoTokenizer.
2. Run forward pass through the model.
3. Apply softmax to logits to obtain per-class probabilities.
4. Assign the class with the highest probability as the label.
5. Use the probability of the assigned class as the confidence score.

### Step 3: Post-processing

1. Apply a confidence threshold (default 0.6). Below the threshold, label
   as "uncertain" and route to human review queue.
2. For texts classified as negative with confidence > 0.85, flag as
   candidates for crisis signal evaluation.
3. Aggregate per-post sentiment into daily brand sentiment scores using
   volume-weighted averages.

## Scoring Schema

### Per-mention output

| Field              | Type    | Description                                     |
|--------------------|---------|-------------------------------------------------|
| mention_id         | string  | Unique identifier for the mention               |
| text               | string  | Original mention text                           |
| platform           | string  | Source platform                                 |
| sentiment_label    | string  | positive / neutral / negative / uncertain       |
| sentiment_score    | float   | Probability of assigned class (0.0-1.0)         |
| negative_prob      | float   | Probability of negative class                   |
| neutral_prob       | float   | Probability of neutral class                    |
| positive_prob      | float   | Probability of positive class                   |
| timestamp          | datetime| When the mention was posted                     |

### Aggregate scoring

Daily brand sentiment index:

```
sentiment_index = (positive_count - negative_count) / total_count
```

Range: -1.0 (all negative) to +1.0 (all positive).

Weighted sentiment index (accounts for confidence):

```
weighted_index = sum(score * direction) / total_count
```

Where `direction` is +1 for positive, 0 for neutral, -1 for negative,
and `score` is the confidence probability.

## Crisis Signal Detection

### Rolling baseline

Compute a 28-day rolling mean and standard deviation of daily negative
mention volume.

### Alert threshold

Trigger a crisis alert when:

```
daily_negative_count > rolling_mean + (threshold_multiplier * rolling_std)
```

Default `threshold_multiplier` = 3.0 (configurable).

### Alert severity levels

| Level    | Condition                        | Response                              |
|----------|----------------------------------|---------------------------------------|
| Watch    | > 2x std above mean              | Log and monitor next 24 hours         |
| Warning  | > 3x std above mean              | Notify stakeholders, prepare response |
| Critical | > 5x std above mean OR trending  | Immediate escalation, crisis protocol |

### Crisis context enrichment

When an alert fires:

1. Extract the top 5 most-engaged negative mentions.
2. Identify common themes using keyword extraction (TF-IDF).
3. Determine affected platforms and geographic concentration.
4. Check for correlation with news events or competitor activity.

## Model Evaluation and Monitoring

### Initial validation

Before deploying on a new client's data:

1. Manually label 200 random mentions from the client's social data.
2. Run the model on the labeled set.
3. Require F1 > 0.75 across all three classes to proceed.
4. If F1 is below threshold, consider few-shot fine-tuning or model swap.

### Ongoing monitoring

- Track weekly sentiment distribution. A sudden shift in the neutral-to-
  positive ratio (without corresponding business events) may indicate
  model drift.
- Re-validate quarterly with 100 freshly labeled mentions.
- Log all uncertain classifications for periodic human review and model
  improvement.

## Limitations

- Sarcasm and irony detection remains a challenge; the model may misclassify
  sarcastic positive text as genuinely positive.
- Financial services jargon (e.g., "bearish," "short") can be misinterpreted
  as negative sentiment without domain context.
- Multilingual mentions require a separate model or translation pipeline.
- The model does not capture sentiment toward specific aspects (e.g., positive
  about product, negative about support). Aspect-based sentiment requires
  additional modeling.
