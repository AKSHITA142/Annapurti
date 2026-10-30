# Development Rules for FoodRescue-AI

- Python 3.11, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL 16, pytest. Frontend: React + TypeScript + Vite + Tailwind + react-leaflet + Recharts.
- The CSP solver and routing code are hand-written in pure Python (no solver library). OR-Tools is allowed only inside `evaluation/` as a comparison baseline.
- Food safety is a hard constraint. No code path may relax a deadline to make a route or allocation work.
- Every solver decision (accept, reject, reassign) must write a row to `decision_log` with a machine-readable reason code and a human-readable sentence.
- All randomness uses an explicit seed. All simulated data (traffic, payments, NGOs, vehicles) is labelled `simulated` in the UI and the report.
- Type hints everywhere. Each module gets unit tests. No business logic inside API route functions; routes call services.
- Keep functions small and name constraints explicitly (one function per constraint).

