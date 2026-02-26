"""Clustering service for optimizer parameter diversity.

Uses K-Means clustering to select diverse representative strategies
from optimization results.
"""

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import MinMaxScaler


def cluster_and_select_representatives(
    results: list[dict],
    n_clusters: int = 10,
    min_results_for_clustering: int = 20,
    guaranteed_top_n: int = 0,
) -> list[dict]:
    """
    Cluster results by parameters and select best representative from each cluster.

    When guaranteed_top_n > 0, the top N results by score are unconditionally included,
    then clustering is applied to the remaining results for diversity.

    Args:
        results: List of optimizer results, each with 'params' and 'composite_score'
        n_clusters: Target number of clusters (will be reduced if fewer results)
        min_results_for_clustering: Minimum results needed to apply clustering
        guaranteed_top_n: Number of top results to guarantee by score (0 = disabled)

    Returns:
        List of representative results (guaranteed top-N + cluster representatives)
    """
    if len(results) < min_results_for_clustering:
        return results[: n_clusters + guaranteed_top_n]

    # Step 1: Guarantee top-N results by score
    top_guaranteed = results[:guaranteed_top_n] if guaranteed_top_n > 0 else []
    remaining = results[guaranteed_top_n:] if guaranteed_top_n > 0 else results

    if not remaining:
        return top_guaranteed

    # Step 2: Cluster the remaining results
    # Extract numeric parameter values
    param_keys = sorted(remaining[0]["params"].keys())
    param_matrix = np.array([
        [result["params"].get(key, 0) for key in param_keys]
        for result in remaining
    ])

    # Normalize parameters (min-max scaling)
    scaler = MinMaxScaler()
    normalized_params = scaler.fit_transform(param_matrix)

    # Determine actual cluster count
    actual_clusters = min(n_clusters, len(remaining))

    # K-Means clustering
    kmeans = KMeans(n_clusters=actual_clusters, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(normalized_params)

    # Build set of guaranteed param tuples for deduplication
    guaranteed_param_set = set()
    for r in top_guaranteed:
        key = tuple(sorted(r["params"].items()))
        guaranteed_param_set.add(key)

    # Select best representative from each cluster (skip if already in top-N)
    representatives: list[dict] = []
    for cluster_id in range(actual_clusters):
        cluster_indices = np.where(cluster_labels == cluster_id)[0]
        if len(cluster_indices) == 0:
            continue

        # Get results in this cluster, sorted by composite_score
        cluster_results = [(idx, remaining[idx]) for idx in cluster_indices]
        cluster_results.sort(key=lambda x: x[1].get("composite_score", 0), reverse=True)

        # Select the best one that is not already guaranteed
        for _, result in cluster_results:
            key = tuple(sorted(result["params"].items()))
            if key not in guaranteed_param_set:
                representatives.append(result)
                break

    # Step 3: Combine and sort by composite_score
    combined = top_guaranteed + representatives
    combined.sort(key=lambda x: x.get("composite_score", 0), reverse=True)

    return combined


def sort_with_all_positive_priority(results: list[dict]) -> list[dict]:
    """
    Sort results with all_positive strategies first, then by composite_score.

    Args:
        results: List of optimizer results

    Returns:
        Sorted list with all_positive=True first, then by composite_score descending
    """
    def sort_key(result: dict) -> tuple:
        all_positive = result.get("all_positive", False)
        composite_score = result.get("composite_score", 0)
        # True (1) > False (0), so negate for descending
        return (not all_positive, -composite_score)

    return sorted(results, key=sort_key)


def add_all_positive_flag(results: list[dict]) -> list[dict]:
    """
    Add all_positive flag to each result based on yearly returns.

    Args:
        results: List of optimizer results with yearly_results

    Returns:
        Same results with all_positive field added
    """
    for result in results:
        yearly_results = result.get("yearly_results", [])
        if yearly_results:
            all_positive = all(yr.get("total_return", 0) > 0 for yr in yearly_results)
        else:
            all_positive = False
        result["all_positive"] = all_positive

    return results
