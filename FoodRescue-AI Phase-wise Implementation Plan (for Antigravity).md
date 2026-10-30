# FoodRescue-AI: Phase-wise Implementation Plan

*MVP build plan for Antigravity. Stack: Python, FastAPI, PostgreSQL, React/TypeScript. Prepared 30 Oct 2026.*

## 0. How to use this plan with Antigravity

1. Create the repo and add two files first: `PROJECT_CONTEXT.md` (paste Sections 1 to 3 of this plan plus your FoodRescue-AI project description) and `RULES.md` (paste the rules below). Point the agent at both at the start of every task.
2. One phase = one agent task. Paste the "Prompt" block of the phase, let the agent produce its plan first, review it, then let it execute.
3. A phase is finished only when its **Acceptance checks** pass (tests green, endpoint works, screen loads). Commit after each phase with the message `phase-N: done`.
4. Never start the next phase on a red test suite. If a phase overruns, cut from the "Cut order" list in Section 2, not from the solver or the evaluation.

**RULES.md (paste as is):**

- Python 3.11, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL 16, pytest. Frontend: React + TypeScript + Vite + Tailwind + react-leaflet + Recharts.
- The CSP solver and routing code are hand-written in pure Python (no solver library). OR-Tools is allowed only inside `evaluation/` as a comparison baseline.
- Food safety is a hard constraint. No code path may relax a deadline to make a route or allocation work.
- Every solver decision (accept, reject, reassign) must write a row to `decision_log` with a machine-readable reason code and a human-readable sentence.
- All randomness uses an explicit seed. All simulated data (traffic, payments, NGOs, vehicles) is labelled `simulated` in the UI and the report.
- Type hints everywhere. Each module gets unit tests. No business logic inside API route functions; routes call services.
- Keep functions small and name constraints explicitly (one function per constraint).

## 1. Locked decisions

**In MVP scope:** providers and receivers (NGOs and verified individuals), listings, partial multi-receiver requests, transactional reservation, category-based safety rules, CSP allocation, routing with time windows and capacity, allocation-routing feedback loop, failure ladder, explain view, simulation, baseline comparison, impact dashboard, and the six agreed extras.

**Simplified for MVP:** one delivery type is fully implemented (sender-managed vehicle fleet). Self-collection is implemented as a simple mode (receiver travels to pickup, same feasibility check). Independent delivery partners are represented as simulated vehicles in a pool that accept or reject automatically by rule. Payments are simulated. Traffic is a labelled multiplier (low 1.0, medium 1.3, high 1.7). Verification is a boolean flag set by the admin.

**Future scope (write in report, do not build):** real payments, live traffic, WhatsApp, forecasting, sensors, multi-city.

**Fixes adopted from the design review (all implemented):**

| # | Fix | Where |
| --- | --- | --- |
| 1 | Scope cut to an MVP | This plan |
| 2 | A\* used for graph shortest path and for small-instance optimal routing; insertion plus 2-opt for larger ordering | Phase 4 |
| 3 | Primary solver is backtracking (MRV, degree, forward checking, AC-3 on binary constraints); min-conflicts is the fallback | Phase 3 |
| 4 | Failure ladder for no-feasible, no-show, expiry, partner cancel | Phase 5 |
| 5 | Safety deadlines come from a category rule table; sender cannot exceed it | Phase 2 |
| 6 | Quantities discretized into lots | Phase 1 and 3 |
| 7 | Objective formally defined (lexicographic safety and quantity, then weighted score) | Phase 3 |
| 8 | Evaluation with baselines, metrics and seeded scenarios | Phase 6 |
| 9 | Postgres row locking; feasibility badge on city-wide discovery; labelled travel-time source | Phases 1, 8, 2 |

## 2. Timeline and cut order

Final submission is the first week of November (confirm the exact date with your faculty). Working back from that:

| Day | Date | Phases | Priority |
| --- | --- | --- | --- |
| 1 | Fri 30 Oct | 0, 1 | Must |
| 2 | Sat 31 Oct | 2, 3 (start) | Must |
| 3 | Sun 1 Nov | 3 (finish), 4 | Must |
| 4 | Mon 2 Nov | 5, 6 | Must |
| 5 | Tue 3 Nov | 7, 8 (donor and NGO screens) | Must |
| 6 | Wed 4 Nov | 8 (admin explain view), 9 | Should |
| 7 | Thu 5 Nov | 10 (Docker, README, report, demo) | Must |
| Buffer | Fri 6 Nov | Fixes, rehearsal | Buffer |

**Cut order if you fall behind (cut from the top first):** QR tracking, what-if UI (keep the script), plain-language intake, fairness UI, impact dashboard charts (keep the numbers), self-collection mode, simulated annealing (already optional). **Never cut:** reservation concurrency, safety rules, CSP solver, routing validator, decision log, evaluation.

## 3. Repository structure

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

## Phase 0: Project setup

**Goal:** a repo where backend, database and frontend all start with one command.

**Tasks**

- Create the folder structure above, `pyproject.toml` (or `requirements.txt`), Vite React-TS app, Tailwind.
- `docker-compose.yml` with three services: `db` (postgres:16), `backend` (uvicorn, reload), `frontend` (vite dev).
- FastAPI app with `/health`, config from environment variables, CORS for the frontend.
- SQLAlchemy engine/session, Alembic initialised.

**Prompt for Antigravity:**

> Read PROJECT\_CONTEXT.md and RULES.md. Scaffold the repository exactly as in the structure section. Add docker-compose with Postgres 16, a FastAPI backend and a Vite React TypeScript frontend with Tailwind. Add a /health endpoint, config via env vars, SQLAlchemy session setup and Alembic. Make `docker compose up` start everything. Show your plan before coding.

**Acceptance checks:** `docker compose up` works; `GET /health` returns ok; frontend page loads and calls `/health`; `pytest` runs (even with one dummy test).

## Phase 1: Data model and concurrency-safe inventory

**Goal:** the database and reservation logic that guarantees no overselling.

**Entities (tables)**

- `users` (role: provider, ngo, volunteer, admin; verified flag; city; lat, lng).
- `receiver_profiles` (accepted categories, daily intake capacity in lots, remaining capacity, operating hours, vehicle flag).
- `food_listings` (provider\_id, name, category, veg flag, unit, `lot_size`, `total_lots`, `available_lots`, `reserved_lots`, `collected_lots`, `delivered_lots`, prepared\_at, `safe_deadline` (computed, see Phase 2), storage\_requirement, pickup\_lat, pickup\_lng, pickup\_window\_start, pickup\_window\_end, delivery\_mode\_offered, delivery\_contribution\_type (free, fixed, negotiable), contribution\_amount, status).
- `donation_requests` (listing\_id, receiver\_id, requested\_lots, status: pending, reserved, allocated, rejected, cancelled, expired, completed; reservation\_expires\_at).
- `vehicles` (owner\_id, type, capacity\_lots, service\_radius\_km, available\_from, available\_to, lat, lng, is\_simulated).
- `delivery_jobs` (request\_ids, vehicle\_id, route JSON, planned times, status, otp\_code).
- `delivery_confirmations` and `utilization_reports` (kept separate).
- `decision_log` (id, created\_at, entity\_type, entity\_id, step, decision, reason\_code, message, payload JSON).

**Inventory rules**

- Invariant: `available + reserved + collected + delivered + released_or_discarded = total` (add a `closed_lots` column for discarded/expired).
- `reserve(listing_id, request_id, lots)` runs in one transaction: `SELECT ... FOR UPDATE` on the listing row, check `available_lots >= lots`, move lots from available to reserved, set `reservation_expires_at`.
- `release(request_id)` returns lots to available only if `now < safe_deadline`; otherwise moves them to `closed_lots` and logs the reason.
- A background task (APScheduler or a simple loop) expires stale reservations.

**Prompt for Antigravity:**

> Implement the SQLAlchemy models and Alembic migration for the tables in Phase 1 of the plan. Implement an inventory service with reserve, release, confirm\_collected and confirm\_delivered, using SELECT FOR UPDATE inside a transaction, enforcing the quantity invariant, and releasing lots back to available only before safe\_deadline. Add a reservation-expiry job. Write pytest tests including a concurrency test: 20 threads each requesting 10 lots from a listing with 100 lots must end with exactly 100 lots reserved and no negative quantities.

**Acceptance checks:** invariant test passes after random operation sequences (property-style test with a seed); the 20-thread test passes repeatedly (run it 10 times); expiry returns lots only before the safe deadline.

## Phase 2: Food safety rules and travel-time layer

**Goal:** make "safe deadline" and "travel time" concrete, deterministic and honest.

**Safety rule table** (`safety_rules.py`, configurable). The values below are placeholders for the demo; verify them against FSSAI or other published food-safety guidance before you quote them in the report and cite the source there.

| Category | Max safe window after preparation (minutes) | Needs temperature control |
| --- | --- | --- |
| cooked\_hot | 240 | no (must stay hot or be consumed within window) |
| cooked\_chilled | 480 | yes |
| raw\_refrigerated | 720 | yes |
| sealed\_packaged | per-product use-by, capped at 10080 | no |

- `safe_deadline = prepared_at + min(sender_declared_window, category_max_window)`. The sender can shorten but never extend.
- Temperature-controlled categories require a vehicle flag `has_cold_storage`; vehicles without it are filtered out for those listings.
- Journey check: `arrival_at_receiver = depart + travel_to_pickup + load_time + travel_to_receiver + handover_time` must be `<= safe_deadline`. Load time (10 min) and handover time (5 min) are config values.

**Travel-time layer** (`services/travel.py`)

- Build a graph with OSMnx for Ahmedabad if the network is available (cache to disk as GraphML), otherwise a fallback synthetic grid graph. Fallback in code: if OSMnx fails, use haversine distance times 1.3 road factor at 30 km/h.
- `travel_minutes(a, b, traffic_level)` returns minutes; results are cached in a distance matrix per scenario.
- Traffic level is an explicit parameter (low, medium, high) applied as a multiplier, labelled simulated in all outputs.

**Prompt for Antigravity:**

> Implement safety\_rules.py with the category table in Phase 2 (configurable via a JSON file), the safe\_deadline computation where the sender can only shorten the window, and the journey feasibility function. Implement travel.py with an OSMnx road graph loader (cached), a haversine fallback, a traffic multiplier, and a cached distance-matrix builder. Add unit tests for: sender cannot extend the window, cold-chain listings reject vehicles without cold storage, journey check fails exactly at the deadline boundary, fallback is used when OSMnx is unavailable.

**Acceptance checks:** all tests pass; a listing created via the service gets a computed `safe_deadline`; travel\_minutes returns consistent values for the same input and changes with traffic level.

## Phase 3: CSP allocation engine (the core)

**Goal:** a hand-written solver that assigns requests to feasible delivery arrangements.

**Formulation (write this in the report too)**

- **Variables:** one per pending request `r`.
- **Domain of `r`:** a set of options `(lots, mode, resource)` where `lots` in `{lot_size multiples up to requested_lots}`, `mode` in `{self_collect, sender_vehicle, simulated_partner}`, and `resource` is a vehicle (or none for self-collect). The domain also contains a `None` value (unallocated) that is allowed but penalised.
- **Unary constraints (prune the domain first):** category accepted by receiver; receiver operating hours cover arrival time; pickup window respected; cold-chain vehicle for temperature-controlled food; vehicle capacity at least `lots`; journey meets safe deadline; vehicle service radius (sender vehicles only).
- **Binary constraints (used by AC-3):** two requests assigned to the same vehicle must not overlap in time unless they fit one route (checked with a quick two-stop feasibility test); two requests from the same listing must not both claim lots beyond what pair-wise remains.
- **Global constraints (handled by forward checking with running totals):** sum of allocated lots per listing is at most `available_lots`; per-receiver intake is at most remaining capacity; per-vehicle total load is at most capacity.
- **Search:** backtracking with MRV (fewest remaining values first), degree heuristic as tie-breaker, forward checking after each assignment, AC-3 once at the start and after each assignment if time permits. Value ordering by the objective score.
- **Fallback:** if backtracking exceeds a node or time limit (configurable, default 2 seconds), run min-conflicts starting from a greedy assignment, then re-validate with the hard constraints.
- **Objective (`objective.py`):** compare solutions lexicographically on (1) hard-feasible only, (2) maximise total safely allocated lots, (3) minimise spoiled or unallocated lots. Break remaining ties with a weighted cost: `cost = 1.0 * total_distance_km + 0.5 * total_delivery_cost_inr + 20 * fairness_penalty - 0.2 * resource_utilisation`. Fairness penalty is the variance of served fraction among receivers with equal declared priority. Weights live in a config file and are reported in the evaluation.
- **Decision log:** record each pruned value with a reason code (e.g. `SAFETY_DEADLINE`, `CAPACITY`, `HOURS_CLOSED`, `CATEGORY_REJECTED`, `INVENTORY_EXHAUSTED`) and each backtrack.

**Prompt for Antigravity:**

> Implement the CSP solver in backend/app/solver per Phase 3: domain generation with unary pruning, backtracking with MRV, degree tie-break and forward checking, AC-3 on the binary constraints, a min-conflicts fallback triggered by a node/time limit, and the lexicographic-then-weighted objective in objective.py with weights from a config file. Every pruning and backtrack writes a decision\_log record with a reason code. Do not use any solver library. Write tests for: no listing is ever over-allocated, a request that violates the safety deadline never appears in the output, MRV reduces nodes visited versus naive ordering on a seeded scenario, min-conflicts fallback returns a hard-feasible solution, deterministic output for the same seed.

**Acceptance checks:** all hard-constraint tests pass; on 10 seeded scenarios the solver never returns an infeasible assignment; node-count comparison with and without MRV and forward checking is recorded for the report.

## Phase 4: Routing engine

**Goal:** valid, efficient routes for vehicles that carry several pickups and deliveries.

**Components**

- **Graph A\* (`astar.py`):** shortest path between two points on the road graph with a haversine heuristic (admissible). Used to fill the distance matrix when real graph data is used.
- **Route-state A\* for small instances (up to 6 stops):** state = (current stop, set of visited stops, current time, current load); cost = elapsed time; heuristic = minimum outgoing edge cost summed over unvisited stops (admissible); precedence (pickup before its delivery), capacity and deadlines are checked when expanding. This gives provably optimal routes and doubles as a correctness reference for the heuristics below.
- **Larger instances (`routing.py`):** cheapest insertion respecting precedence, then 2-opt, relocate and swap local search, each move re-validated. Simulated annealing is optional and off by default.
- **Validator (`validator.py`):** walks a route and checks capacity at every step, pickup-before-delivery, pickup windows, receiver hours, each food item's safe deadline at its handover time, and cold-chain flags. Returns a list of violations, each naming the conflicting request ids.

**Prompt for Antigravity:**

> Implement astar.py (graph A\* with haversine heuristic and route-state A\* for up to 6 stops with an admissible heuristic), routing.py (cheapest insertion with precedence, 2-opt, relocate, swap, optional simulated annealing disabled by default) and validator.py that returns structured violations naming the request ids involved. Write tests: A\* equals brute-force on random instances of up to 5 stops; heuristic routes are never infeasible according to the validator; the validator catches a deadline miss, a capacity overflow and a precedence violation.

**Acceptance checks:** A\* and brute force agree on 50 seeded instances; heuristic route cost is within a measured percentage of optimal on small instances (record this number); validator tests pass.

## Phase 5: Allocation-routing feedback loop and failure ladder

**Goal:** never confirm an allocation that cannot actually be delivered, and always have a defined fallback.

**Loop (`feedback_loop.py`):** allocate (Phase 3) then route per vehicle (Phase 4) then validate. If violations exist, take the conflicting request ids, mark the offending option as forbidden for those requests (a learned nogood), re-run allocation for only the affected requests, and re-route. Stop after a configurable number of repair rounds (default 5).

**Failure ladder** (applied in this order for any request that ends up infeasible, each step logged):

1. Offer a smaller partial quantity (fewer lots).
2. Try another delivery mode (self-collect, other vehicle).
3. Try another eligible receiver for the same lots.
4. Relist the leftover lots as available, and flag the listing as urgent in the admin view if the deadline is under 60 minutes.
5. Escalate to the admin with a clear reason code.

**Operational failure rules**

- **Receiver no-show:** if pickup is not confirmed by the end of the pickup window plus a grace period, the reservation expires, lots return to available only if still before the safe deadline, and the ladder runs.
- **Reservation expiry mid-plan:** the validator re-checks inventory before dispatch; an expired reservation triggers a repair round.
- **Vehicle cancel before pickup:** re-offer the job to the next eligible vehicle (re-run allocation for that job only).
- **Vehicle cancel after pickup:** do not reassign automatically; mark the job `recovery_needed`, find the nearest feasible handover point or vehicle, validate the remaining journey against the deadline, otherwise escalate and close the lots as spoiled in the log.
- **Urgent dispatch:** when a listing is created with a deadline under 90 minutes, try inserting its requests into existing routes first (cheapest insertion), and only re-optimise affected vehicles if insertion fails. Committed jobs (already collected) are never moved.

**Prompt for Antigravity:**

> Implement feedback\_loop.py with the repair loop (nogood learning, max rounds from config) and a failure\_ladder service with the five steps and the operational failure rules in Phase 5. Add an `/simulate/event` endpoint that accepts events (vehicle\_cancel\_before\_pickup, vehicle\_cancel\_after\_pickup, receiver\_no\_show, reservation\_expired, new\_urgent\_listing, traffic\_change) and runs the right replanning. Every step writes decision\_log. Tests: a scenario where two assignments individually pass but jointly miss a deadline is repaired; each ladder step is reached by a crafted scenario; committed deliveries are never reassigned.

**Acceptance checks:** each failure rule has a passing test; final plans always pass the validator; unresolved cases end in an explicit escalation record, never a silent drop.

## Phase 6: Simulation and evaluation

**Goal:** the evidence that your solver is better than simple approaches (this is what your faculty and interviewers will look at).

**Simulator (`sim/generator.py`):** seeded scenario generator with parameters: number of listings, requests, receivers, vehicles, category mix, deadline tightness, traffic level, city area. Preset sizes: small (3 listings, 8 requests, 3 vehicles), medium (10, 40, 8), large (30, 150, 20). Include a "stress" preset with tight deadlines and scarce vehicles.

**Baselines (`evaluation/baselines.py`):**

- B1: nearest-receiver-first greedy.
- B2: first-come-first-served.
- B3 (optional): OR-Tools CP-SAT on the same instance, only in `evaluation/`, to show how close your hand-written solver gets.

**Metrics:** lots safely delivered, percentage of lots allocated, spoilage rate (lots closed past deadline), total distance, total delivery time, number of deadline violations (must be 0 for your solver), solve time, fairness (variance of served fraction), nodes visited.

**Experiments:** run each preset with 20 seeds per method, report mean and standard deviation in a results table and 2 or 3 charts. Add the what-if stress script: sweep traffic (low, medium, high), vehicle count, and deadline tightness and plot food saved.

**Prompt for Antigravity:**

> Implement the seeded scenario generator with small, medium, large and stress presets, the baselines B1 and B2 (and B3 with OR-Tools if installable), and run\_experiments.py that runs every method on 20 seeds per preset, validates every plan with the validator, and writes CSV results plus matplotlib charts into evaluation/results. Include the what-if sweep. Print a summary table.

**Acceptance checks:** one command reproduces all results; your solver has zero deadline violations on every run; results CSV and charts exist and are referenced in the report.

## Phase 7: API layer

**Goal:** clean REST endpoints over the services.

**Endpoints (minimum):**

- Auth-lite: `POST /auth/login` returning a role token (simple signed token is fine for the MVP; verification is an admin flag).
- Listings: `POST /listings`, `GET /listings?city=&category=` (each item includes a **feasibility badge** for the logged-in receiver: feasible, tight, or infeasible, computed with the Phase 2 journey check), `GET /listings/{id}`, `PATCH /listings/{id}`.
- Requests: `POST /requests` (reserves immediately), `DELETE /requests/{id}`, `GET /requests/mine`.
- Allocation: `POST /allocate/run` (batch dispatch for a listing or all pending), `GET /allocations/{id}`.
- Delivery: `POST /jobs/{id}/collected`, `POST /jobs/{id}/delivered` (needs OTP), `POST /jobs/{id}/utilization`.
- Admin: `GET /admin/decisions?entity=` (explain view feed), `GET /admin/overview`, `POST /sim/scenario`, `POST /sim/event`.
- Impact: `GET /impact/summary` (published, reserved, delivered, reported distributed, utilisation percentage, estimated people served, CO2 estimate with the stated assumption).

**Prompt for Antigravity:**

> Implement the REST API in app/api per Phase 7 using the existing services (no business logic in routes). Add Pydantic schemas, role-based dependency checks, OpenAPI docs, and the feasibility badge on GET /listings. Add API tests with httpx for the happy path and for the oversell, wrong role and expired-reservation cases.

**Acceptance checks:** `/docs` shows all endpoints; API tests pass; the double-request scenario through the API returns exactly one success when only one request can fit.

## Phase 8: Frontend

**Goal:** simple screens that make the solver visible in a demo.

**Screens**

- **Donor:** create listing form (category, quantity, preparation time, pickup window, delivery contribution), my listings with live **spoilage countdown**, incoming requests, delivery status, utilisation reports.
- **NGO / volunteer:** browse listings in my city with feasibility badges, request lots, my requests and status, tracking page, confirm receipt with OTP, submit utilisation report with optional photo.
- **Admin explain view (most important screen):** pick a listing or allocation and see the ordered decision log as a timeline (pruned options with reason codes, chosen assignment, repair rounds, route on a map with time windows, vehicles). Include filters by reason code.
- **Map component:** react-leaflet showing donors, NGOs, vehicles, and the planned route polyline with time labels.
- **Impact dashboard:** Recharts cards and charts using `/impact/summary`.
- Label every simulated element with a small "simulated" tag.

**Prompt for Antigravity:**

> Build the React TypeScript frontend per Phase 8 using Tailwind, react-leaflet and Recharts. Pages: donor dashboard, NGO dashboard, admin explain view with decision timeline and route map, impact dashboard. Use the generated API client from the OpenAPI schema. Add a live spoilage countdown component and feasibility badges. Use the browser to test the main flows (create listing, two NGOs request at once, run allocation, view explanation) and fix any issues you find.

**Acceptance checks:** the full demo flow works in the browser without touching Swagger; the admin view clearly shows why a request was accepted or rejected; layout works on a laptop screen.

## Phase 9: Agreed extras

Build these only after Phases 1 to 8 pass.

1. **Spoilage countdown:** already in Phase 8; add colour thresholds (green over 2 h, amber 1 to 2 h, red under 1 h).
2. **Impact dashboard:** finalise numbers; separate "delivered" from "reported distributed"; show the CO2 assumption as text.
3. **Plain-language donor intake:** a text box where the donor types "50 veg biryani boxes made at 1 pm, pickup till 4"; a backend endpoint parses it into the listing form fields (use a small rule-based parser first, optional LLM call behind a flag); the donor must review and confirm before publishing. The sender cannot exceed safety limits regardless of what was parsed.
4. **What-if stress tests:** UI wrapper around the Phase 6 sweep (sliders for traffic, vehicles, deadlines, and a results chart).
5. **NGO fairness priority:** receiver field `priority_class` (e.g. shelter, orphanage, community kitchen) with an admin-set weight used in the fairness term; fairness never overrides safety.
6. **Delivery tracking with OTP/QR:** each job gets a 6-digit OTP and a QR code encoding the job id and OTP; the receiver shows or scans it to confirm delivery; status timeline (assigned, collected, in transit, delivered); simulated vehicle position moving along the route for the demo.

**Prompt for Antigravity (one per extra, run separately):**

> Implement extra N from Phase 9 of the plan. Keep the change isolated, add tests, and do not modify solver hard constraints.

**Acceptance checks:** each extra has a visible demo path and a test; the solver test suite still passes unchanged.

## Phase 10: Packaging, report and demo

**Tasks**

- `docker compose up` brings up everything, with a seed script that loads a demo dataset (fake donors, NGOs, vehicles in Ahmedabad).
- README: setup, architecture diagram, how to run tests and experiments, how to reproduce the results.
- Report sections: problem, related approaches, CSP formulation, routing design, objective and weights, safety rule sources, simulation set-up, results tables and charts, limitations, future scope, ethical and privacy notes (food-donation liability and photo privacy stated as out of scope).
- Demo script (about 7 minutes): (1) donor publishes 150 meals; (2) two NGOs and a volunteer request at once and the reservation holds; (3) run allocation; (4) open the explain view and show one rejected option and one repair round; (5) inject a vehicle cancellation event and show replanning; (6) show the baseline comparison chart; (7) show the impact dashboard.
- Interview talking points: why CSP, why A\* where it is used, why safety is a hard constraint, how oversell is prevented, what the baselines showed.

**Prompt for Antigravity:**

> Write the seed script, README with architecture diagram (Mermaid), and a docs/REPORT\_DRAFT.md that fills the section headings above using the real code and the results in evaluation/results. Then run a clean `docker compose up`, run the whole test suite and the experiments, and list anything that fails.

**Acceptance checks:** a fresh clone runs with one command; test suite is green; results are reproducible; the demo script runs end to end without manual database edits.

## Final checklist

- [ ] 20-thread reservation test passes repeatedly
- [ ] No plan ever violates a safe deadline (validator across all experiment runs)
- [ ] CSP solver hand-written, with MRV, degree, forward checking, AC-3 and min-conflicts fallback
- [ ] A\* used for graph paths and small-instance optimal routes, heuristics for larger routes
- [ ] Failure ladder and all operational failure rules tested
- [ ] Baseline comparison tables and charts generated
- [ ] Explain view shows real decision-log data
- [ ] Everything simulated is labelled as simulated
- [ ] README, report draft and demo script ready
