# Discovery: PatternAmp Backend Boundaries

## Architecture and File System Layout
Since the starting repository contains only raw React + Vite scaffolding, all backend components will be established in a robust, server-side TypeScript architecture integrated into the Express server.

### 1. File Structure
The project will follow a modular layouts at the root:
- `/server.ts` - Main Express server and Vite middleware coordinator.
- `/server/patternamp/` - Root of PatternAmp backend business logic.
  - `runs/` - Run state model and orchestrator.
  - `seed/` - Input builders (e.g., Scenario Seed).
  - `miroshark/` - Client wrapper, export ingestion.
  - `normalize/` - High-quality parsing and normalizer logic (Actors, Transitions, Conflicts, Synthesis).
  - `persistence/` - Data storage adapters utilizing structured, concurrent JSON storage (`/server/db/patternamp-store.json`).
  - `api/` - Routing logic and endpoints mapped to `/api/pattern-amp/*`.
  - `safety/` - Run guards, PII redaction, claim guards, and cost limits.
- `/tests/` - High-fidelity test suite using Node's native test runner (`node:test`) and custom assertions.
  - `/tests/fixtures/` - Golden mock simulation runs representing `sim_b59480b6bbf9`.

### 2. Physical Database Scheme
We implement a robust, lightweight, structured relational-emulated persistence layer in `/server/db/patternamp-store.json`. This avoids tricky binary dependencies of SQLite or database connection overhead, while fully isolating:
- `scenario_runs` (including status, requested/completed rounds, error details)
- `scenario_raw_exports` (storing the raw JSON payload and reports)
- `pattern_actors` (extracted actors with linkedHypotheses and patternId mappings)
- `pattern_transitions` (transitions tracking states, triggers, explanations)
- `pattern_conflicts` (conflicts showing contradictions, amplification, tensions)
- `scenario_branches` (extracted scenario trajectories and the necessary `notToInfer` fields)

### 3. API Endpoints Plan
- `POST /api/pattern-amp/runs`: Configures and starts a Run (either live simulation or ingesting an existing export).
- `POST /api/pattern-amp/runs/:id/ingest`: Accepts a raw MiroShark JSON export, influence reports, or manual dialogue files.
- `POST /api/pattern-amp/runs/:id/normalize`: Performs full multi-step extraction/synthesis, generating `PatternDialogueV1` and `ScenarioBranchV1`.
- `GET /api/pattern-amp/runs/:id`: Fetches high-level run metadata.
- `GET /api/pattern-amp/runs/:id/dialogue`: Fetches the normalized pattern dialogue.
- `GET /api/pattern-amp/runs/:id/branches`: Fetches extracted branches with strict `notToInfer` rules.
- `GET /api/pattern-amp/runs/:id/graph`: Project nodes and edges for dynamic visualization.

### 4. Integration Strategy and Cost Control
All Gemini requests will utilize `@google/genai` on `'gemini-3.5-flash'` to leverage reasoning while conforming to strict cost and token boundaries.
We configure hard defaults:
- Default `maxRounds` locked to 8, absolute hard ceiling at 12.
- Default token size locked to 2048, absolute hard ceiling at 3072.
- Polymarket platform explicitly disabled to guarantee focused reasoning and prevent billing spikes.
