# Clustering Guide Reference

## Overview

Behavioral clustering groups customers by observed patterns in engagement,
browsing, purchasing, and channel usage. Unlike rule-based RFM segmentation,
clustering discovers natural groupings in the data.

## Feature Scaling

### Why Scaling Matters

Distance-based algorithms (K-Means, DBSCAN) are sensitive to feature magnitude.
A feature measured in thousands (e.g., revenue) will dominate one measured in
single digits (e.g., sessions per week) unless both are normalized.

### StandardScaler (Recommended Default)

- Transforms each feature to zero mean and unit variance.
- Use for K-Means and DBSCAN as the default scaler.
- Sensitive to outliers — consider `RobustScaler` if the data contains extreme values.

```python
from sklearn.preprocessing import StandardScaler
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
```

### RobustScaler (Outlier-Heavy Data)

- Uses median and IQR instead of mean and standard deviation.
- Preferred when > 5% of values are outliers.

### MinMaxScaler (Bounded Features)

- Rescales to [0, 1]. Useful when features must remain non-negative.
- Not recommended for clustering unless all features share similar distributions.

## Dimensionality Reduction

### PCA Before Clustering

- When the feature set exceeds 10 dimensions, apply PCA to reduce noise.
- Retain components explaining >= 95% cumulative variance.
- PCA also aids visualization (2D/3D scatter plots of clusters).

```python
from sklearn.decomposition import PCA
pca = PCA(n_components=0.95, random_state=42)
X_reduced = pca.fit_transform(X_scaled)
```

## K-Means Clustering

### Algorithm Summary

1. Initialize k centroids (use `k-means++` for stable initialization).
2. Assign each point to the nearest centroid.
3. Recompute centroids as the mean of assigned points.
4. Repeat until convergence.

### Selecting Optimal k

**Elbow Method**

- Run K-Means for k in [2, 10].
- Plot inertia (within-cluster sum of squares) vs. k.
- The "elbow" — the point where inertia reduction slows — suggests optimal k.

**Silhouette Score Confirmation**

- Compute silhouette score for each k.
- Select k that maximizes silhouette score, provided it exceeds 0.3.
- If no k produces silhouette > 0.3, the data may not have clear cluster structure;
  report this finding and fall back to RFM segmentation.

```python
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

best_k, best_score = 2, -1
for k in range(2, 11):
    model = KMeans(n_clusters=k, init="k-means++", n_init=10, random_state=42)
    labels = model.fit_predict(X_scaled)
    score = silhouette_score(X_scaled, labels)
    if score > best_score:
        best_k, best_score = k, score
```

### Configuration Defaults

| Parameter | Value | Rationale |
|---|---|---|
| `init` | `k-means++` | Faster convergence, more stable results |
| `n_init` | 10 | Run 10 initializations, keep best |
| `max_iter` | 300 | Default; increase for very large datasets |
| `random_state` | 42 | Reproducibility |

## DBSCAN Clustering

### Algorithm Summary

Density-Based Spatial Clustering of Applications with Noise. Groups together
points that are closely packed and marks outliers as noise.

### Key Parameters

| Parameter | Description | Estimation Strategy |
|---|---|---|
| `eps` | Maximum distance between neighbors | k-distance plot elbow |
| `min_samples` | Minimum points to form a dense region | 1% of dataset size, minimum 5 |

### Epsilon Estimation via k-Distance Plot

1. For each point, compute the distance to its k-th nearest neighbor
   (k = 2 * number of features).
2. Sort distances in ascending order and plot.
3. The elbow in the plot indicates a suitable epsilon value.

```python
from sklearn.neighbors import NearestNeighbors
import numpy as np

k = 2 * X_scaled.shape[1]
nbrs = NearestNeighbors(n_neighbors=k).fit(X_scaled)
distances, _ = nbrs.kneighbors(X_scaled)
k_distances = np.sort(distances[:, -1])
# Plot k_distances; the elbow point is the candidate eps
```

### min_samples Heuristic

- `min_samples = max(5, int(0.01 * len(X)))` — ensures clusters have
  meaningful density.
- Increase for noisier data; decrease for small datasets.

### Handling Noise Points

- DBSCAN assigns label -1 to noise points.
- Report the noise percentage. If > 30%, epsilon may be too small.
- Noise points can be post-assigned to the nearest cluster centroid or
  flagged as outliers for manual review.

### Silhouette Evaluation

- Compute silhouette score excluding noise points (label != -1).
- If fewer than 2 clusters are found, DBSCAN has failed to find structure;
  fall back to K-Means.

## Feature Engineering Best Practices

### Recommended Behavioral Features

| Feature | Source | Calculation |
|---|---|---|
| Session frequency | Behavioral events | Sessions per week/month |
| Avg page depth | Behavioral events | Pages viewed per session |
| Content affinity | Behavioral events | Proportion of views per category |
| Channel preference | Behavioral events | Primary traffic source distribution |
| Engagement recency | Behavioral events | Days since last session |
| Purchase frequency | Transactions | Orders per month |
| Avg order value | Transactions | Mean transaction amount |
| Product diversity | Transactions | Unique product categories purchased |

### Feature Selection

- Remove features with near-zero variance (threshold: variance < 0.01 after scaling).
- Check for high multicollinearity (correlation > 0.9); drop one of correlated pairs.
- Use domain knowledge to include features relevant to the business question.

## Cluster Interpretation

After fitting, interpret clusters by examining feature centroids:

1. Compute mean feature values per cluster.
2. Identify the top 2-3 distinguishing features for each cluster.
3. Assign business-friendly labels (e.g., "Power Users," "Casual Browsers,"
   "Deal Seekers").
4. Validate labels with domain stakeholders before using in downstream targeting.

## Validation Checklist

- [ ] All features scaled before clustering.
- [ ] Silhouette score reported and exceeds 0.3 (K-Means).
- [ ] Noise percentage reported (DBSCAN).
- [ ] Cluster sizes are reasonable (no cluster < 1% of data unless justified).
- [ ] Random seed set for reproducibility.
- [ ] PCA variance explained documented if dimensionality reduction used.
