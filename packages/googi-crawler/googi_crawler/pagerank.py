import logging

logger = logging.getLogger("googi_crawler.pagerank")

def compute_pagerank(
    link_graph: dict[str, list[str]],
    damping_factor: float = 0.85,
    max_iterations: int = 30,
    tolerance: float = 1e-6,
) -> dict[str, float]:
    """
    Computes PageRank authority score for nodes in a directed graph using power iteration.

    :param link_graph: A dictionary mapping page URLs to a list of target out-link URLs.
    :param damping_factor: Probability of continuing to follow links.
    :param max_iterations: Maximum power iterations.
    :param tolerance: Score difference threshold for early convergence.
    :return: A dictionary mapping page URLs to their PageRank scores (summing to 1.0).
    """
    all_pages = set(link_graph.keys())
    # Add target out-link pages that are not explicitly keys in link_graph to make the graph closed
    for targets in link_graph.values():
        for target in targets:
            all_pages.add(target)

    num_pages = len(all_pages)
    if num_pages == 0:
        return {}

    # Initialize uniform PageRank score
    ranks = {page: 1.0 / num_pages for page in all_pages}

    # Pre-build in-links map
    in_links: dict[str, list[str]] = {page: [] for page in all_pages}
    out_degrees: dict[str, int] = {page: 0 for page in all_pages}

    for page, targets in link_graph.items():
        # Clean targets to only include pages in our active universe
        valid_targets = [t for t in targets if t in all_pages]
        out_degrees[page] = len(valid_targets)
        for target in valid_targets:
            in_links[target].append(page)

    # Power Iteration Loop
    for iteration in range(1, max_iterations + 1):
        new_ranks = {}
        
        # Calculate dangling node PageRank contribution (redistributed equally to all pages)
        dangling_sum = sum(ranks[p] for p in all_pages if out_degrees[p] == 0)
        dangling_contribution = dangling_sum / num_pages

        # Calculate PageRank for each page
        for page in all_pages:
            link_sum = 0.0
            for inbound in in_links[page]:
                link_sum += ranks[inbound] / out_degrees[inbound]
            
            # PageRank formula: (1 - d)/N + d * (sum(PR(in)/deg(in)) + dangling_contribution)
            new_ranks[page] = ((1.0 - damping_factor) / num_pages) + damping_factor * (
                link_sum + dangling_contribution
            )

        # Check early convergence (L1 norm of differences)
        diff = sum(abs(new_ranks[page] - ranks[page]) for page in all_pages)
        ranks = new_ranks

        logger.debug(f"Iteration {iteration}: L1 diff = {diff:.8f}")
        if diff < tolerance:
            logger.info(f"PageRank converged after {iteration} iterations (L1 diff: {diff:.8f}).")
            break
    else:
        logger.warning(f"PageRank reached max iterations ({max_iterations}) without converging.")

    return ranks
