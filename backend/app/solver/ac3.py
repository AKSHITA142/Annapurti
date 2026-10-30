from collections import deque
from typing import Any, Callable, Dict, List, Optional, Set, Tuple


class AC3Solver:
    @staticmethod
    def run_ac3(
        variables: List[int],
        domains: Dict[int, List[Any]],
        binary_constraint_checker: Callable[[int, Any, int, Any], bool],
        neighbors: Dict[int, Set[int]],
    ) -> Tuple[bool, Dict[int, List[Any]], List[Tuple[int, Any, str]]]:
        """
        Executes the AC-3 algorithm to enforce arc consistency on binary constraints.
        
        Args:
            variables: List of variable IDs.
            domains: Dict mapping variable ID to list of domain options.
            binary_constraint_checker: Function (var_i, val_i, var_j, val_j) -> bool.
            neighbors: Dict mapping variable ID to set of neighboring variable IDs.
            
        Returns:
            (is_consistent, pruned_domains, pruned_records)
            where pruned_records is a list of (var_id, val, reason_code).
        """
        queue = deque()
        pruned_records: List[Tuple[int, Any, str]] = []

        # Initialize queue with all directed arcs (Xi, Xj)
        for xi in variables:
            for xj in neighbors.get(xi, set()):
                if xi != xj:
                    queue.append((xi, xj))

        while queue:
            xi, xj = queue.popleft()
            revised, pruned_values = AC3Solver._revise(
                xi, xj, domains, binary_constraint_checker
            )
            if revised:
                for val in pruned_values:
                    pruned_records.append((xi, val, "AC3_BINARY_INCONSISTENCY"))

                # If domain of Xi is emptied, problem is inconsistent
                if not domains[xi]:
                    return False, domains, pruned_records

                # Enqueue all neighbors Xk of Xi (except Xj)
                for xk in neighbors.get(xi, set()):
                    if xk != xj:
                        queue.append((xk, xi))

        return True, domains, pruned_records

    @staticmethod
    def _revise(
        xi: int,
        xj: int,
        domains: Dict[int, List[Any]],
        binary_constraint_checker: Callable[[int, Any, int, Any], bool],
    ) -> Tuple[bool, List[Any]]:
        """
        Revises domain of Xi with respect to Xj.
        Returns (revised_boolean, list_of_removed_values).
        """
        revised = False
        pruned: List[Any] = []
        new_domain: List[Any] = []

        for x_val in domains[xi]:
            # None (unallocated option) is always pairwise consistent with any choice
            if x_val is None or (hasattr(x_val, "is_unallocated") and x_val.is_unallocated):
                new_domain.append(x_val)
                continue

            # Check if there exists at least one y in domain of Xj that satisfies binary constraint
            has_support = False
            for y_val in domains[xj]:
                if y_val is None or (hasattr(y_val, "is_unallocated") and y_val.is_unallocated):
                    # Unallocated fallback always supports any option
                    has_support = True
                    break

                if binary_constraint_checker(xi, x_val, xj, y_val):
                    has_support = True
                    break

            if has_support:
                new_domain.append(x_val)
            else:
                pruned.append(x_val)
                revised = True

        domains[xi] = new_domain
        return revised, pruned
