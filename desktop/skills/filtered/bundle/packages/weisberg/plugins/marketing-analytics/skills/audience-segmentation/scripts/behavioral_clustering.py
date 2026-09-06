"""Behavioral Clustering Module

Performs feature engineering from raw behavioral event data, applies
StandardScaler normalization and optional PCA dimensionality reduction,
runs K-Means and DBSCAN clustering with automated hyperparameter
optimization, and produces interpretable cluster profiles.

Usage:
    from scripts.behavioral_clustering import (
        engineer_features,
        scale_features,
        find_optimal_k,
        run_kmeans,
        estimate_dbscan_eps,
        run_dbscan,
    )

Dependencies:
    pandas, numpy, scikit-learn
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------

DEFAULT_RANDOM_STATE: int = 42
DEFAULT_K_RANGE: tuple[int, int] = (2, 11)  # exclusive upper bound
DEFAULT_MIN_SILHOUETTE: float = 0.3
DEFAULT_PCA_VARIANCE_THRESHOLD: float = 0.95
DEFAULT_DBSCAN_MIN_SAMPLES_RATIO: float = 0.01
DEFAULT_DBSCAN_MIN_SAMPLES_FLOOR: int = 5


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------


def load_behavioral_events(
    filepath: str | Path,
    user_id_column: str = "user_id",
    event_column: str = "event",
    timestamp_column: str = "timestamp",
) -> pd.DataFrame:
    """Load and validate behavioral event data from a CSV file.

    Parameters
    ----------
    filepath : str or Path
        Path to the behavioral events CSV file.
    user_id_column : str
        Name of the user identifier column.
    event_column : str
        Name of the event type column.
    timestamp_column : str
        Name of the timestamp column.

    Returns
    -------
    pd.DataFrame
        Validated event DataFrame with parsed timestamps.

    Raises
    ------
    FileNotFoundError
        If the events file does not exist.
    ValueError
        If required columns are missing.
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"Events file not found: {filepath}")

    df = pd.read_csv(filepath)

    required_columns = {user_id_column, event_column, timestamp_column}
    missing = required_columns - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df[timestamp_column] = pd.to_datetime(df[timestamp_column])
    logger.info(
        "Loaded %d events for %d users",
        len(df),
        df[user_id_column].nunique(),
    )
    return df


def engineer_features(
    events: pd.DataFrame,
    user_id_column: str = "user_id",
    event_column: str = "event",
    timestamp_column: str = "timestamp",
) -> pd.DataFrame:
    """Derive clustering features from raw behavioral events.

    Computed features per user:
    - session_frequency: Average sessions per week
    - avg_page_depth: Average pages viewed per session
    - content_affinity_*: Proportion of views per content category
    - channel_preference_*: Distribution across traffic sources
    - engagement_recency: Days since the most recent event
    - engagement_intensity: Total events in the analysis window

    Parameters
    ----------
    events : pd.DataFrame
        Raw behavioral event data.
    user_id_column : str
        Name of the user identifier column.
    event_column : str
        Name of the event type column.
    timestamp_column : str
        Name of the timestamp column.

    Returns
    -------
    pd.DataFrame
        User-level feature matrix indexed by user_id.
    """
    df = events.copy()
    df[timestamp_column] = pd.to_datetime(df[timestamp_column])
    reference_date = df[timestamp_column].max()

    # --- Engagement recency & intensity ---
    user_agg = df.groupby(user_id_column).agg(
        engagement_recency=(
            timestamp_column,
            lambda x: (reference_date - x.max()).days,
        ),
        engagement_intensity=(event_column, "count"),
        first_event=(timestamp_column, "min"),
        last_event=(timestamp_column, "max"),
    )

    # --- Session frequency: approximate sessions per week ---
    # Active span in weeks (minimum 1 week to avoid division by zero)
    active_span_weeks = ((user_agg["last_event"] - user_agg["first_event"]).dt.total_seconds() / (7 * 24 * 3600)).clip(
        lower=1.0
    )
    # Approximate sessions as distinct event-days
    sessions_per_user = df.assign(_date=df[timestamp_column].dt.date).groupby(user_id_column)["_date"].nunique()
    user_agg = user_agg.join(sessions_per_user.rename("_n_sessions"))
    user_agg["session_frequency"] = user_agg["_n_sessions"] / active_span_weeks

    # --- Average page depth: events per session-day ---
    user_agg["avg_page_depth"] = user_agg["engagement_intensity"] / user_agg["_n_sessions"]

    # --- Content affinity: proportion of events per event type ---
    event_counts = df.groupby([user_id_column, event_column]).size().unstack(fill_value=0)
    event_proportions = event_counts.div(event_counts.sum(axis=1), axis=0)
    event_proportions.columns = [f"content_affinity_{col}" for col in event_proportions.columns]
    user_agg = user_agg.join(event_proportions)

    # --- Channel preference (if 'channel' column exists) ---
    if "channel" in df.columns:
        channel_counts = df.groupby([user_id_column, "channel"]).size().unstack(fill_value=0)
        channel_proportions = channel_counts.div(channel_counts.sum(axis=1), axis=0)
        channel_proportions.columns = [f"channel_preference_{col}" for col in channel_proportions.columns]
        user_agg = user_agg.join(channel_proportions)

    # Drop helper columns
    user_agg = user_agg.drop(columns=["first_event", "last_event", "_n_sessions"], errors="ignore")

    # Fill any remaining NaN (e.g. users with a single event type) with 0
    user_agg = user_agg.fillna(0.0)

    logger.info("Engineered %d features for %d users", user_agg.shape[1], len(user_agg))
    return user_agg


def remove_low_variance_features(
    feature_matrix: pd.DataFrame,
    variance_threshold: float = 0.01,
) -> pd.DataFrame:
    """Remove features with near-zero variance after scaling.

    Parameters
    ----------
    feature_matrix : pd.DataFrame
        User-level feature matrix.
    variance_threshold : float
        Minimum variance to retain a feature.

    Returns
    -------
    pd.DataFrame
        Filtered feature matrix with low-variance columns removed.
    """
    variances = feature_matrix.var()
    keep_cols = variances[variances >= variance_threshold].index.tolist()
    dropped = set(feature_matrix.columns) - set(keep_cols)

    if dropped:
        logger.info("Removed %d low-variance features: %s", len(dropped), dropped)

    return feature_matrix[keep_cols]


# ---------------------------------------------------------------------------
# Scaling and dimensionality reduction
# ---------------------------------------------------------------------------


def scale_features(
    feature_matrix: pd.DataFrame,
    method: str = "standard",
) -> tuple[np.ndarray, Any]:
    """Normalize features for distance-based clustering.

    Parameters
    ----------
    feature_matrix : pd.DataFrame
        Raw user-level feature matrix.
    method : str
        Scaling method: 'standard' (StandardScaler), 'robust' (RobustScaler),
        or 'minmax' (MinMaxScaler).

    Returns
    -------
    tuple[np.ndarray, scaler]
        Scaled feature array and fitted scaler object for inverse transforms.

    Raises
    ------
    ValueError
        If method is not one of the supported options.
    """
    from sklearn.preprocessing import MinMaxScaler, RobustScaler, StandardScaler

    scalers = {
        "standard": StandardScaler,
        "robust": RobustScaler,
        "minmax": MinMaxScaler,
    }

    if method not in scalers:
        raise ValueError(f"Unsupported scaling method '{method}'. Choose from: {list(scalers)}")

    scaler = scalers[method]()
    X_scaled = scaler.fit_transform(feature_matrix.values)

    logger.info("Scaled %d features using %s", feature_matrix.shape[1], method)
    return X_scaled, scaler


def apply_pca(
    X_scaled: np.ndarray,
    variance_threshold: float = DEFAULT_PCA_VARIANCE_THRESHOLD,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> tuple[np.ndarray, Any]:
    """Apply PCA dimensionality reduction, retaining a target variance ratio.

    Parameters
    ----------
    X_scaled : np.ndarray
        Scaled feature matrix.
    variance_threshold : float
        Minimum cumulative explained variance to retain (default 0.95).
    random_state : int
        Random seed for reproducibility.

    Returns
    -------
    tuple[np.ndarray, PCA]
        Reduced feature array and fitted PCA object.
    """
    from sklearn.decomposition import PCA

    pca = PCA(n_components=variance_threshold, random_state=random_state)
    X_reduced = pca.fit_transform(X_scaled)

    logger.info(
        "PCA reduced %d -> %d components (%.1f%% variance explained)",
        X_scaled.shape[1],
        X_reduced.shape[1],
        pca.explained_variance_ratio_.sum() * 100,
    )
    return X_reduced, pca


# ---------------------------------------------------------------------------
# K-Means clustering
# ---------------------------------------------------------------------------


def find_optimal_k(
    X: np.ndarray,
    k_range: tuple[int, int] = DEFAULT_K_RANGE,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> dict[str, Any]:
    """Determine the optimal number of clusters via elbow + silhouette methods.

    Parameters
    ----------
    X : np.ndarray
        Scaled (and optionally PCA-reduced) feature matrix.
    k_range : tuple[int, int]
        Inclusive lower and exclusive upper bound for k values to test.
    random_state : int
        Random seed for reproducibility.

    Returns
    -------
    dict
        Keys:
        - 'optimal_k' (int): Selected cluster count.
        - 'silhouette_scores' (dict[int, float]): Score per k tested.
        - 'inertias' (dict[int, float]): Inertia per k tested.
        - 'best_silhouette' (float): Silhouette score at optimal_k.
    """
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score

    silhouette_scores: dict[int, float] = {}
    inertias: dict[int, float] = {}
    best_k = k_range[0]
    best_score = -1.0

    for k in range(k_range[0], k_range[1]):
        model = KMeans(
            n_clusters=k,
            init="k-means++",
            n_init=10,
            max_iter=300,
            random_state=random_state,
        )
        labels = model.fit_predict(X)
        score = silhouette_score(X, labels)
        silhouette_scores[k] = float(score)
        inertias[k] = float(model.inertia_)

        logger.debug("k=%d  silhouette=%.4f  inertia=%.2f", k, score, model.inertia_)

        if score > best_score:
            best_k = k
            best_score = score

    if best_score < DEFAULT_MIN_SILHOUETTE:
        logger.warning(
            "Best silhouette score %.4f is below threshold %.2f; data may not have clear cluster structure",
            best_score,
            DEFAULT_MIN_SILHOUETTE,
        )

    logger.info("Optimal k=%d with silhouette=%.4f", best_k, best_score)
    return {
        "optimal_k": best_k,
        "silhouette_scores": silhouette_scores,
        "inertias": inertias,
        "best_silhouette": best_score,
    }


def run_kmeans(
    X: np.ndarray,
    n_clusters: int,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> tuple[np.ndarray, Any]:
    """Fit K-Means clustering with the specified number of clusters.

    Parameters
    ----------
    X : np.ndarray
        Scaled feature matrix.
    n_clusters : int
        Number of clusters.
    random_state : int
        Random seed for reproducibility.

    Returns
    -------
    tuple[np.ndarray, KMeans]
        Cluster label array and fitted KMeans model.
    """
    from sklearn.cluster import KMeans

    model = KMeans(
        n_clusters=n_clusters,
        init="k-means++",
        n_init=10,
        max_iter=300,
        random_state=random_state,
    )
    labels = model.fit_predict(X)

    logger.info("K-Means fitted with %d clusters", n_clusters)
    return labels, model


# ---------------------------------------------------------------------------
# DBSCAN clustering
# ---------------------------------------------------------------------------


def estimate_dbscan_eps(
    X: np.ndarray,
    k_multiplier: int = 2,
) -> float:
    """Estimate DBSCAN epsilon parameter via k-distance plot analysis.

    Parameters
    ----------
    X : np.ndarray
        Scaled feature matrix.
    k_multiplier : int
        Multiplier for the number of features to determine k in k-distance
        (default: k = 2 * n_features).

    Returns
    -------
    float
        Estimated epsilon value based on the k-distance elbow.
    """
    from sklearn.neighbors import NearestNeighbors

    n_features = X.shape[1]
    k = max(2, k_multiplier * n_features)
    # Ensure k does not exceed n_samples - 1
    k = min(k, X.shape[0] - 1)

    nbrs = NearestNeighbors(n_neighbors=k).fit(X)
    distances, _ = nbrs.kneighbors(X)
    k_distances = np.sort(distances[:, -1])

    # Find elbow using maximum second derivative (curvature)
    if len(k_distances) < 3:
        eps = float(k_distances[-1])
    else:
        # Compute second derivative of the sorted k-distance curve
        d1 = np.diff(k_distances)
        d2 = np.diff(d1)
        elbow_idx = int(np.argmax(d2)) + 1  # offset by 1 due to diff
        eps = float(k_distances[elbow_idx])

    # Sanity: eps should be positive
    eps = max(eps, 1e-6)

    logger.info("Estimated DBSCAN eps=%.4f (k=%d)", eps, k)
    return eps


def run_dbscan(
    X: np.ndarray,
    eps: Optional[float] = None,
    min_samples: Optional[int] = None,
) -> tuple[np.ndarray, Any, dict[str, Any]]:
    """Fit DBSCAN clustering with optional auto-estimated parameters.

    Parameters
    ----------
    X : np.ndarray
        Scaled feature matrix.
    eps : float, optional
        Maximum distance between neighbors. If None, estimated via k-distance.
    min_samples : int, optional
        Minimum points to form a dense region. If None, uses 1% of dataset
        size with a floor of 5.

    Returns
    -------
    tuple[np.ndarray, DBSCAN, dict]
        - Cluster label array (-1 for noise points).
        - Fitted DBSCAN model.
        - Diagnostics dict with keys: 'n_clusters', 'noise_count',
          'noise_pct', 'silhouette' (excluding noise).
    """
    from sklearn.cluster import DBSCAN
    from sklearn.metrics import silhouette_score

    if eps is None:
        eps = estimate_dbscan_eps(X)

    if min_samples is None:
        min_samples = max(
            DEFAULT_DBSCAN_MIN_SAMPLES_FLOOR,
            int(DEFAULT_DBSCAN_MIN_SAMPLES_RATIO * len(X)),
        )

    model = DBSCAN(eps=eps, min_samples=min_samples)
    labels = model.fit_predict(X)

    n_clusters = len(set(labels) - {-1})
    noise_count = int((labels == -1).sum())
    noise_pct = noise_count / len(labels) * 100 if len(labels) > 0 else 0.0

    # Compute silhouette excluding noise, only if >= 2 clusters exist
    sil_score = None
    non_noise_mask = labels != -1
    if n_clusters >= 2 and non_noise_mask.sum() > n_clusters:
        sil_score = float(silhouette_score(X[non_noise_mask], labels[non_noise_mask]))

    diagnostics: dict[str, Any] = {
        "n_clusters": n_clusters,
        "noise_count": noise_count,
        "noise_pct": round(noise_pct, 2),
        "silhouette": sil_score,
    }

    if noise_pct > 30:
        logger.warning("DBSCAN noise percentage %.1f%% is high; consider increasing eps", noise_pct)
    if n_clusters < 2:
        logger.warning("DBSCAN found %d cluster(s); consider falling back to K-Means", n_clusters)

    logger.info(
        "DBSCAN: %d clusters, %d noise points (%.1f%%)",
        n_clusters,
        noise_count,
        noise_pct,
    )
    return labels, model, diagnostics


# ---------------------------------------------------------------------------
# Cluster profiling
# ---------------------------------------------------------------------------


def profile_clusters(
    feature_matrix: pd.DataFrame,
    labels: np.ndarray,
    feature_names: Optional[list[str]] = None,
) -> pd.DataFrame:
    """Generate descriptive profiles for each cluster.

    Parameters
    ----------
    feature_matrix : pd.DataFrame
        Original (unscaled) user-level feature matrix.
    labels : np.ndarray
        Cluster assignments per user.
    feature_names : list of str, optional
        Feature names for readability. Defaults to DataFrame column names.

    Returns
    -------
    pd.DataFrame
        Per-cluster profile with mean, median, and std of each feature,
        plus cluster size and percentage.
    """
    if feature_names is None:
        feature_names = list(feature_matrix.columns)

    df = feature_matrix.copy()
    df.columns = feature_names
    df = df.copy()
    df["cluster"] = labels

    total = len(df)
    profiles_list = []

    for cluster_id in sorted(df["cluster"].unique()):
        cluster_data = df[df["cluster"] == cluster_id].drop(columns=["cluster"])
        size = len(cluster_data)

        stats: dict[str, Any] = {
            "cluster": cluster_id,
            "size": size,
            "pct": round(size / total * 100, 2),
        }
        for feat in feature_names:
            stats[f"{feat}_mean"] = round(float(cluster_data[feat].mean()), 4)
            stats[f"{feat}_median"] = round(float(cluster_data[feat].median()), 4)
            stats[f"{feat}_std"] = round(float(cluster_data[feat].std()), 4)

        profiles_list.append(stats)

    profiles = pd.DataFrame(profiles_list).set_index("cluster")
    logger.info("Profiled %d clusters", len(profiles))
    return profiles


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------


def run_clustering_pipeline(
    events_path: str | Path,
    output_dir: str | Path,
    method: str = "kmeans",
    scaling: str = "standard",
    use_pca: bool = True,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> dict[str, Any]:
    """Execute the full behavioral clustering pipeline.

    Steps:
    1. Load behavioral events
    2. Engineer features
    3. Remove low-variance features
    4. Scale features
    5. Optionally apply PCA
    6. Run clustering (K-Means or DBSCAN)
    7. Profile clusters
    8. Save results

    Parameters
    ----------
    events_path : str or Path
        Path to the behavioral events CSV file.
    output_dir : str or Path
        Directory to write output files.
    method : str
        Clustering method: 'kmeans' or 'dbscan'.
    scaling : str
        Feature scaling method: 'standard', 'robust', or 'minmax'.
    use_pca : bool
        Whether to apply PCA dimensionality reduction.
    random_state : int
        Random seed for reproducibility.

    Returns
    -------
    dict
        Pipeline results including labels, profiles, and diagnostics.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load events
    events = load_behavioral_events(events_path)

    # 2. Engineer features
    feature_matrix = engineer_features(events)

    # 3. Remove low-variance features
    feature_matrix = remove_low_variance_features(feature_matrix)

    # 4. Scale features
    X_scaled, scaler = scale_features(feature_matrix, method=scaling)

    # 5. Optionally apply PCA
    pca_model = None
    X_cluster = X_scaled
    if use_pca and X_scaled.shape[1] > 2:
        X_cluster, pca_model = apply_pca(X_cluster, random_state=random_state)

    # 6. Cluster
    diagnostics: dict[str, Any] = {}
    if method == "kmeans":
        opt = find_optimal_k(X_cluster, random_state=random_state)
        labels, model = run_kmeans(X_cluster, n_clusters=opt["optimal_k"], random_state=random_state)
        diagnostics.update(opt)
    elif method == "dbscan":
        labels, model, dbscan_diag = run_dbscan(X_cluster)
        diagnostics.update(dbscan_diag)
    else:
        raise ValueError(f"Unsupported clustering method '{method}'. Use 'kmeans' or 'dbscan'.")

    # 7. Profile clusters
    profiles = profile_clusters(feature_matrix, labels)

    # 8. Save results
    assignments = feature_matrix.copy()
    assignments["cluster"] = labels
    assignments.to_csv(output_dir / "cluster_assignments.csv")
    profiles.to_csv(output_dir / "cluster_profiles.csv")

    logger.info("Clustering pipeline complete. Results saved to %s", output_dir)

    return {
        "labels": labels,
        "profiles": profiles,
        "diagnostics": diagnostics,
        "model": model,
        "scaler": scaler,
        "pca": pca_model,
    }
