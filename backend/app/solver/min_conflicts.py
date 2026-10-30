import random
from typing import Any, Callable, Dict, List, Optional, Set, Tuple


class MinConflictsSolver:
    @staticmethod
    def solve(
        variables: List[int],
        domains: Dict[int, List[Any]],
        conflict_counter: Callable[[Dict[int, Any]], int],
        variable_conflict_counter: Callable[[int, Any, Dict[int, Any]], int],
        hard_constraint_validator: Callable[[Dict[int, Any]], bool],
        max_steps: int = 500,
        seed: Optional[int] = 42,
    ) -> Dict[int, Any]:
        """
        Executes Min-Conflicts local search as fallback solver.
        
        Args:
            variables: List of request variable IDs.
            domains: Dict of pruned valid options per variable.
            conflict_counter: Total conflict count for an assignment.
            variable_conflict_counter: Number of conflicts if var is assigned val.
            hard_constraint_validator: Validates if an assignment satisfies all hard constraints.
            max_steps: Max iterations for local search.
            seed: Explicit seed for reproducible randomness.
            
        Returns:
            A hard-feasible assignment dict {var_id: chosen_option}.
        """
        rng = random.Random(seed)

        # 1. Start with greedy initial assignment (choose domain value with fewest initial conflicts)
        current_assignment: Dict[int, Any] = {}
        for var in variables:
            var_domain = domains.get(var, [])
            if not var_domain:
                current_assignment[var] = None
                continue

            # Greedy pick: choose option that minimises conflicts with already assigned
            best_val = var_domain[0]
            best_conflicts = float("inf")
            for val in var_domain:
                c = variable_conflict_counter(var, val, current_assignment)
                if c < best_conflicts:
                    best_conflicts = c
                    best_val = val
            current_assignment[var] = best_val

        # 2. Local search loop
        for step in range(max_steps):
            total_conflicts = conflict_counter(current_assignment)
            if total_conflicts == 0:
                break

            # Find all conflicted variables
            conflicted_vars = [
                v
                for v in variables
                if variable_conflict_counter(v, current_assignment[v], current_assignment) > 0
            ]
            if not conflicted_vars:
                break

            # Pick a conflicted variable at random
            var = rng.choice(conflicted_vars)
            var_domain = domains.get(var, [])

            # Choose value from its domain that minimises conflicts
            min_val = current_assignment[var]
            min_c = float("inf")
            candidate_vals = []

            for val in var_domain:
                c = variable_conflict_counter(var, val, current_assignment)
                if c < min_c:
                    min_c = c
                    candidate_vals = [val]
                elif c == min_c:
                    candidate_vals.append(val)

            current_assignment[var] = rng.choice(candidate_vals)

        # 3. Hard-feasibility repair step:
        # If any hard constraint remains violated, unallocate the offending variables
        # so the output is GUARANTEED to be 100% hard-feasible.
        for var in variables:
            if current_assignment[var] is not None:
                if variable_conflict_counter(var, current_assignment[var], current_assignment) > 0:
                    current_assignment[var] = None

        assert hard_constraint_validator(current_assignment), (
            "Min-conflicts fallback must guarantee a hard-feasible solution"
        )

        return current_assignment
