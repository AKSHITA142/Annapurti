# FoodRescue-AI: Project Context

## Project Description
FoodRescue-AI (AnnaPurti) is an intelligent surplus food redistribution platform operating in urban environments (Ahmedabad pilot). The platform bridges food donors (restaurants, caterers, banquet halls, supermarkets) and food receivers (verified NGOs, community kitchens, shelters, and verified individuals). 

The core technological contribution is a hand-written Constraint Satisfaction Problem (CSP) allocation solver combined with vehicle routing optimization (A* and heuristics) with time windows, capacity limits, and strict perishable food safety constraints.

## 1. Locked Decisions

**In MVP scope:** providers and receivers (NGOs and verified individuals), listings, partial multi-receiver requests, transactional reservation, category-based safety rules, CSP allocation, routing with time windows and capacity, allocation-routing feedback loop, failure ladder, explain view, simulation, baseline comparison, impact dashboard, and the six agreed extras.

**Simplified for MVP:** one delivery type is fully implemented (sender-managed vehicle fleet). Self-collection is implemented as a simple mode (receiver travels to pickup, same feasibility check). Independent delivery partners are represented as simulated vehicles in a pool that accept or reject automatically by rule. Payments are simulated. Traffic is a labelled multiplier (low 1.0, medium 1.3, high 1.7). Verification is a boolean flag set by the admin.

**Future scope (write in report, do not build):** real payments, live traffic, WhatsApp, forecasting, sensors, multi-city.

**Fixes adopted from the design review (all implemented):**

| # | Fix | Where |
|---|---|---|
| 1 | Scope cut to an MVP | This plan |
| 2 | A* used for graph shortest path and for small-instance optimal routing; insertion plus 2-opt for larger ordering | Phase 4 |
| 3 | Primary solver is backtracking (MRV, degree, forward checking, AC-3 on binary constraints); min-conflicts is the fallback | Phase 3 |
| 4 | Failure ladder for no-feasible, no-show, expiry, partner cancel | Phase 5 |
| 5 | Safety deadlines come from a category rule table; sender cannot exceed it | Phase 2 |
| 6 | Quantities discretized into lots | Phase 1 and 3 |
| 7 | Objective formally defined (lexicographic safety and quantity, then weighted score) | Phase 3 |
| 8 | Evaluation with baselines, metrics and seeded scenarios | Phase 6 |
| 9 | Postgres row locking; feasibility badge on city-wide discovery; labelled travel-time source | Phases 1, 8, 2 |

## 2. Timeline and Cut Order

| Day | Date | Phases | Priority |
|---|---|---|---|
| 1 | Fri 30 Oct | 0, 1 | Must |
| 2 | Sat 31 Oct | 2, 3 (start) | Must |
| 3 | Sun 1 Nov | 3 (finish), 4 | Must |
| 4 | Mon 2 Nov | 5, 6 | Must |
| 5 | Tue 3 Nov | 7, 8 (donor and NGO screens) | Must |
| 6 | Wed 4 Nov | 8 (admin explain view), 9 | Should |
| 7 | Thu 5 Nov | 10 (Docker, README, report, demo) | Must |
| Buffer | Fri 6 Nov | Fixes, rehearsal | Buffer |

**Cut order if you fall behind (cut from the top first):** QR tracking, what-if UI (keep the script), plain-language intake, fairness UI, impact dashboard charts (keep the numbers), self-collection mode, simulated annealing (already optional). **Never cut:** reservation concurrency, safety rules, CSP solver, routing validator, decision log, evaluation.

## 3. Repository Structure

```
foodrescue-ai/
  PROJECT_CONTEXT.md
  RULES.md
  docker-compose.yml
  backend/
    app/
      main.py
      config.py
      db.py
      models/        # SQLAlchemy models
      schemas/       # Pydantic schemas
      services/      # inventory, safety, allocation_service, routing_service, tracking
      api/           # routers: listings, requests, allocations, admin, sim, impact
      solver/
        csp.py            # backtracking, MRV, degree, forward checking
        ac3.py
        min_conflicts.py
        objective.py
        astar.py          # graph A* and route-state A*
        routing.py        # insertion, 2-opt, relocate
        validator.py      # deadlines, capacity, time windows, precedence
        feedback_loop.py  # allocate -> route -> validate -> repair
        explain.py
      sim/
        generator.py      # seeded scenarios
        traffic.py
    tests/
    alembic/
  evaluation/
    baselines.py      # nearest-first, FCFS, optional OR-Tools CP-SAT
    run_experiments.py
    results/
  frontend/
    src/ (donor/, ngo/, admin/, components/, api/)
  docs/
```

