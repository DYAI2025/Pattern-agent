/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ScenarioRun,
  ScenarioRawExport,
  CreateRunRequest,
  IngestExportRequest
} from "../../../src/types.js";
import {
  createScenarioRun,
  updateScenarioRun,
  storeRawExport,
  getScenarioRun,
  getRawExportForRun,
  storeNormalizedActors,
  storeNormalizedTransitions,
  storeNormalizedConflicts,
  storePatternDialogue,
  storeScenarioBranches,
  storeGraphProjection
} from "../persistence/store.js";
import { clampMiroSharkRunParameters } from "../safety/guards.js";
import {
  extractActors,
  extractTransitions,
  extractConflicts,
  synthesizeDialogue,
  deriveScenarioBranches,
  projectGraph
} from "../normalize/normalizer.js";

// Utility helper to generate UUID
export function generateUUID(): string {
  return 'xxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Handles initialization of MiroShark Scenario Runs (POST /api/pattern-amp/runs)
 */
export function initializeScenarioRun(req: CreateRunRequest): {
  run: ScenarioRun;
  warnings: string[];
} {
  const { clamped, limits, warnings } = clampMiroSharkRunParameters(req);

  const simulationId = `sim_${generateUUID().substring(0, 12)}`;
  const runId = generateUUID();

  // Create database run entry
  const run = createScenarioRun({
    id: runId,
    user_id: clamped.userId || "anonymous-user",
    trigger_source: clamped.triggerSource || "manual",
    status: clamped.runStrategy === "ingest_existing_export" ? "queued" : "running",
    miroshark_simulation_id: simulationId,
    rounds_requested: limits.maxRounds,
    rounds_completed: clamped.runStrategy === "ingest_existing_export" ? 0 : 0,
    actions_count: 0,
    error_code: null,
    error_message: null,
    completed_at: null
  });

  // If live simulation strategy, spin up asynchronous processing simulation
  if (clamped.runStrategy === "miroshark_live") {
    simulateLiveMiroSharkWorkflow(runId, limits.maxRounds);
  }

  return { run, warnings };
}

/**
 * Ingests external simulation payloads (reports, deep insights, actions)
 */
export function ingestSimulationData(runId: string, ingestReq: IngestExportRequest): ScenarioRawExport {
  const run = getScenarioRun(runId);
  if (!run) {
    throw new Error(`Scenario run not found: ${runId}`);
  }

  const rawExport = storeRawExport({
    id: generateUUID(),
    scenario_run_id: runId,
    source_type: ingestReq.sourceType,
    raw_payload: ingestReq.rawPayload || {},
    raw_text: ingestReq.rawText || null
  });

  // Update scenario run metrics from raw payload if it's the full miroshark_json
  const actionsCount = ingestReq.rawPayload?.actions?.length || ingestReq.rawPayload?.actionsCount || 0;
  const roundsCompleted = ingestReq.rawPayload?.roundsCompleted || ingestReq.rawPayload?.rounds_completed || 1;
  const rawStatus = ingestReq.rawPayload?.status || "completed";

  updateScenarioRun(runId, {
    status: rawStatus === "failed" && actionsCount > 0 ? "partial_usable" : "completed",
    actions_count: actionsCount,
    rounds_completed: roundsCompleted
  });

  return rawExport;
}

/**
 * Normalization pipeline (POST /api/pattern-amp/runs/:id/normalize)
 */
export function runNormalizationPipeline(runId: string): {
  run: ScenarioRun;
  dialogue: any;
  branches: any[];
} {
  const run = getScenarioRun(runId);
  if (!run) {
    throw new Error(`Scenario run not found: ${runId}`);
  }

  const rawExport = getRawExportForRun(runId);
  if (!rawExport) {
    throw new Error(`No raw export found to normalize for run ${runId}`);
  }

  const payload = rawExport.raw_payload || {};
  const actions = payload.actions || [];

  // Step 1: Actor extraction mapping
  const actors = extractActors(actions);
  storeNormalizedActors(runId, actors);

  // Step 2: Transition extraction
  const transitions = extractTransitions(actions, actors);
  storeNormalizedTransitions(transitions);

  // Step 3: Conflict extraction
  const conflicts = extractConflicts(actions, actors);
  storeNormalizedConflicts(conflicts);

  // Step 4: Full dialogue synthesis
  const dialogue = synthesizeDialogue(run, rawExport, actors, transitions, conflicts);
  storePatternDialogue(dialogue);

  // Step 5: Scenario branch derivations
  const branches = deriveScenarioBranches(runId, dialogue);
  storeScenarioBranches(branches);

  // Step 6: Create Graph Projection nodes & edges
  const graph = projectGraph(dialogue, branches);
  storeGraphProjection(graph.nodes, graph.edges);

  // Update run final status
  const finalStatus = run.status === "failed" || run.status === "partial_usable" ? "partial_usable" : "completed";
  const updated = updateScenarioRun(runId, { status: finalStatus });

  return {
    run: updated || run,
    dialogue,
    branches
  };
}

/**
 * Simulates a MiroShark background workflow (simulated external service) (REQ-A-001)
 */
function simulateLiveMiroSharkWorkflow(runId: string, maxRounds: number) {
  setTimeout(() => {
    // Generate simulated actions mimicking the Golden sim_b59480b6bbf9 fixture to make UI rich!
    const simulatedActions = [
      {
        round: 1,
        agent_name: "H1",
        platform: "twitter",
        action_type: "post",
        content: "Entering simulation space. Setting standard pattern observations.",
        stance: "Analytical composure"
      },
      {
        round: 3,
        agent_name: "H2",
        platform: "reddit",
        action_type: "critique",
        content: "H1 starts too rigid. We are designing fortress-like structures rather than mapping actual behaviors.",
        stance: "Deconstructive refinement"
      },
      {
        round: Math.floor(maxRounds / 2),
        agent_name: "H4",
        platform: "twitter",
        action_type: "post",
        content: "leerer Feed / empty queue trigger. We retreat into strategic protective stillness.",
        stance: "Defensive withdrawal"
      },
      {
        round: maxRounds,
        agent_name: "EvidenceSummary",
        platform: "internal",
        action_type: "summary",
        content: "Under conditions of emptiness, search for clarity yields an ambiguity paradox and retreat.",
        stance: "Final synthesis"
      }
    ];

    const mockPayload = {
      simulationId: `sim_${generateUUID().substring(0, 12)}`,
      status: "completed",
      roundsCompleted: maxRounds,
      actionsCount: simulatedActions.length,
      actions: simulatedActions,
      reports: {
        title: "Live Clarity-Ambiguity Loop",
        summary: "Live simulated run demonstrating progressive pattern tightening and defensive retreat in blank feeds.",
        keyDynamic: "Analytical rigidity leading to action paralysis.",
        openQuestion: "Can alternative seeds break the stagnation loops?",
        notToInfer: [
          "That the simulation is absolute",
          "That actual clinical conditions exist in these agent routines"
        ]
      }
    };

    // Auto-ingest simulated output
    storeRawExport({
      id: generateUUID(),
      scenario_run_id: runId,
      source_type: "miroshark_json",
      raw_payload: mockPayload,
      raw_text: "Live simulated MiroShark export text."
    });

    updateScenarioRun(runId, {
      status: "completed",
      actions_count: simulatedActions.length,
      rounds_completed: maxRounds
    });

    // Auto-normalize
    try {
      runNormalizationPipeline(runId);
    } catch (err) {
      console.error("Auto-normalization of live run failed:", err);
    }

  }, 1500); // Small delay to represent background simulation ingestion
}
