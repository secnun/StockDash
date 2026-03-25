"""Clustering service for optimizer parameter diversity.

Uses K-Means clustering to select diverse representative strategies
from optimization results.
"""

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import MinMaxScaler


def cluster_and_select_representatives(
    results: list[dict],
    target_total: int = 70,
    min_results_for_clustering: int = 20,
    guaranteed_top_n: int = 30,
    pool_multiplier: int = 5,
) -> list[dict]:
    """
    Cluster results by parameters and select best representative from each cluster.

    Uses Score-Gate + adaptive K approach:
    - Top guaranteed_top_n results are unconditionally included
    - Only the top pool (diversity_slots * pool_multiplier) are considered for clustering
    - K is automatically determined based on pool size

    Args:
        results: List of optimizer results, each with 'params' and 'composite_score'
        target_total: Target total number of results to return
        min_results_for_clustering: Minimum results needed to apply clustering
        guaranteed_top_n: Number of top results to guarantee by score
        pool_multiplier: Pool size = diversity_slots * pool_multiplier

    Returns:
        List of representative results (guaranteed top-N + cluster representatives)
    """
    if len(results) < min_results_for_clustering:
        return results[:target_total]

    # Step 1: Guarantee top-N results by score
    top_guaranteed = results[:guaranteed_top_n]
    remaining = results[guaranteed_top_n:]

    if not remaining:
        return top_guaranteed

    # Step 2: Score-Gate — limit clustering pool to top candidates only
    diversity_slots = target_total - guaranteed_top_n
    if diversity_slots <= 0:
        return top_guaranteed[:target_total]

    pool_size = min(len(remaining), diversity_slots * pool_multiplier)
    pool = remaining[:pool_size]

    # Step 3: Adaptive K — determine cluster count from pool size
    actual_k = min(diversity_slots, max(5, len(pool) // 10))

    # Extract numeric parameter values (skip string params like stopLossDayBuy)
    param_keys = sorted(
        k for k in pool[0]["params"].keys()
        if isinstance(pool[0]["params"].get(k), (int, float))
    )
    if not param_keys:
        return (top_guaranteed + pool[:diversity_slots])[:target_total]
    param_matrix = np.array([
        [float(result["params"].get(key, 0)) for key in param_keys]
        for result in pool
    ])

    # Normalize parameters (min-max scaling)
    scaler = MinMaxScaler()
    normalized_params = scaler.fit_transform(param_matrix)

    # K-Means clustering
    kmeans = KMeans(n_clusters=actual_k, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(normalized_params)

    # Build set of guaranteed param tuples for deduplication
    guaranteed_param_set = set()
    for r in top_guaranteed:
        key = tuple(sorted(r["params"].items()))
        guaranteed_param_set.add(key)

    # Select best representative from each cluster (skip if already in top-N)
    representatives: list[dict] = []
    for cluster_id in range(actual_k):
        cluster_indices = np.where(cluster_labels == cluster_id)[0]
        if len(cluster_indices) == 0:
            continue

        # Get results in this cluster, sorted by composite_score
        cluster_results = [(idx, pool[idx]) for idx in cluster_indices]
        cluster_results.sort(key=lambda x: x[1].get("composite_score", 0), reverse=True)

        # Select the best one that is not already guaranteed
        for _, result in cluster_results:
            key = tuple(sorted(result["params"].items()))
            if key not in guaranteed_param_set:
                representatives.append(result)
                break

    # Step 4: Combine and sort by composite_score
    combined = top_guaranteed + representatives
    combined.sort(key=lambda x: x.get("composite_score", 0), reverse=True)

    return combined
