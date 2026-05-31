/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";

// Import modules to test
import {
  extractActors,
  extractTransitions,
  extractConflicts,
  deriveScenarioBranches,
  synthesizeDialogue,
  sanitizeSafetyPhrase
} from "../server/patternamp/normalize/normalizer.js";
import {
  clampMiroSharkRunParameters,
  validateSafetyGuards
} from "../server/patternamp/safety/guards.js";
import { ScenarioRun, ScenarioRawExport } from "../src/types.js";

// Load golden simulation fixture
const FIXTURE_PATH = path.resolve(process.cwd(), "tests", "fixtures", "sim_b59480b6bbf9.json");
const rawFixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf-8"));

test("TASK-004: Actor Normalizer Mapping rules", () => {
  const actors = extractActors(rawFixture.actions);
  
  // Rule asserts
  const h1 = actors.find(a => a.sourceAgentName === "H1");
  assert.ok(h1, "Should find H1 actor");
  assert.strictEqual(h1.role, "pattern", "H1 must map to role pattern");
  assert.strictEqual(h1.patternId, "H1");
  assert.deepStrictEqual(h1.linkedHypotheses, ["hyp-h1"]);

  const mem = actors.find(a => a.sourceAgentName === "AgentMemory");
  assert.ok(mem, "Should find AgentMemory actor");
  assert.strictEqual(mem.role, "memory", "AgentMemory must map to role memory");
  assert.strictEqual(mem.patternId, "AgentMemory");

  const ev = actors.find(a => a.sourceAgentName === "EvidenceSummary");
  assert.ok(ev, "Should find EvidenceSummary actor");
  assert.strictEqual(ev.role, "evidence", "EvidenceSummary must map to role evidence");
  assert.strictEqual(ev.patternId, "EvidenceSummary");

  const userProxy = actors.find(a => a.sourceAgentName === "User");
  assert.ok(userProxy, "Should find User actor");
  assert.strictEqual(userProxy.role, "user_proxy", "User must map to role user_proxy");
  assert.strictEqual(userProxy.label, "User Proxy");
});

test("TASK-005: Transition Normalizer - leerer Feed pivot tracker", () => {
  const actors = extractActors(rawFixture.actions);
  const transitions = extractTransitions(rawFixture.actions, actors);

  assert.ok(transitions.length > 0, "Should generate transitions");
  const pivot = transitions.find(t => t.id === "trans-h1-pivot");
  assert.ok(pivot, "Should find H1 blank feed pivot transition");
  
  assert.strictEqual(pivot.trigger, "leerer Feed / fehlender Input");
  assert.strictEqual(pivot.beforeState, "Klarheit durch aktive Analyse");
  assert.strictEqual(pivot.afterState, "Rückzug / Self-Containment");
  assert.ok(pivot.notToInfer.length > 0, "Transitions should dictate what NOT to infer");
});

test("TASK-006: Conflict Normalizer and Tension extraction", () => {
  const actors = extractActors(rawFixture.actions);
  const conflicts = extractConflicts(rawFixture.actions, actors);

  assert.ok(conflicts.length >= 2, "Should find conflicts between actors");
  const armorConflict = conflicts.find(c => c.id === "conflict-h1-h2");
  assert.ok(armorConflict, "Should extract H1 vs H2 analytical armor contradiction");
  assert.strictEqual(armorConflict.conflictType, "reframe");
  assert.ok(armorConflict.usefulTension.includes("Spannung"), "Should describe useful system tension");
});

test("TASK-007: Dialogue Synthesis and usability of failing runs", () => {
  const mockRun: ScenarioRun = {
    id: "test-run-id",
    user_id: "test-user-id",
    trigger_source: "manual",
    status: "failed", // Marks simulation fail status
    miroshark_simulation_id: "sim_b59480b6bbf9",
    rounds_requested: 30,
    rounds_completed: 28,
    actions_count: rawFixture.actions.length,
    error_code: "SIM_TIMEOUT",
    error_message: "Process timed out",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null
  };

  const mockExport: ScenarioRawExport = {
    id: "test-export-id",
    scenario_run_id: mockRun.id,
    source_type: "miroshark_json",
    raw_payload: rawFixture,
    raw_text: null,
    created_at: new Date().toISOString()
  };

  const actors = extractActors(rawFixture.actions);
  const transitions = extractTransitions(rawFixture.actions, actors);
  const conflicts = extractConflicts(rawFixture.actions, actors);

  const dialogue = synthesizeDialogue(mockRun, mockExport, actors, transitions, conflicts);

  // Assert failed but usable status (REQ-F-006)
  assert.strictEqual(
    dialogue.dataQuality.status,
    "failed_but_usable",
    "Failing simulation run with actions must map to partial/failed_but_usable"
  );
  assert.strictEqual(dialogue.dataQuality.actionCount, rawFixture.actions.length);
  assert.ok(dialogue.synthesis.title, "Synthesis should hold a title copy");
  assert.ok(dialogue.synthesis.keyDynamic, "Synthesis should hold a keyDynamic statement");
});

test("TASK-008: Scenario Branch Derivations and notToInfer limits", () => {
  const mockRun: ScenarioRun = {
    id: "test-run-id",
    user_id: "test-user-id",
    trigger_source: "manual",
    status: "completed",
    miroshark_simulation_id: "sim_b59480b6bbf9",
    rounds_requested: 30,
    rounds_completed: 28,
    actions_count: rawFixture.actions.length,
    error_code: null,
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null
  };

  const mockExport: ScenarioRawExport = {
    id: "test-export-id",
    scenario_run_id: mockRun.id,
    source_type: "miroshark_json",
    raw_payload: rawFixture,
    raw_text: null,
    created_at: new Date().toISOString()
  };

  const actors = extractActors(rawFixture.actions);
  const transitions = extractTransitions(rawFixture.actions, actors);
  const conflicts = extractConflicts(rawFixture.actions, actors);

  const dialogue = synthesizeDialogue(mockRun, mockExport, actors, transitions, conflicts);
  const branches = deriveScenarioBranches(mockRun.id, dialogue);

  assert.ok(branches.length >= 3 && branches.length <= 7, "Derived branches must number between 3 and 7 (REQ-F-005)");
  
  for (const branch of branches) {
    assert.ok(branch.notToInfer.length > 0, "Each branch must carry explicit boundaries of what NOT to infer");
    assert.ok(branch.reflectiveQuestion, "Each branch must prompt a systems reflective question");
  }
});

test("TASK-010: Cost Control Guard Clamping and platform filters", () => {
  const unsafeRequest = {
    userId: "test-user",
    mode: "current_pattern_field",
    sourceMode: "hypotheses_only",
    triggerSource: "manual",
    runStrategy: "miroshark_live" as const,
    limits: {
      maxRounds: 96, // Exceeds limit
      maxTokens: 65536, // Exceeds limit
      enabledPlatforms: ["twitter", "reddit", "polymarket"] // Polymarket forbidden
    }
  };

  const { clamped, limits, warnings } = clampMiroSharkRunParameters(unsafeRequest);

  assert.strictEqual(clamped.limits?.maxRounds, 12, "maxRounds should clamp to hard limit ceiling of 12");
  assert.strictEqual(clamped.limits?.maxTokens, 3072, "maxTokens should clamp to hard limit ceiling of 3072");
  assert.ok(!clamped.limits?.enabledPlatforms?.includes("polymarket"), "Polymarket should be filtered out from enabled platforms");
  assert.ok(warnings.length > 0, "Warnings should report clammings and platform adjustments");
});

test("REQ-S-001: Safety Guards prevent diagnosis labels or absolute predictions", () => {
  const clinicalInput = "Dieser Agent hat schizophren-ähnliche Anflüge und ist depressiv.";
  const diagnosticInput = "Wir stellen die Diagnose: das Schicksal der Simulation wird garantiert scheitern.";
  const normalInput = "Die simulierte Systembewegung zeigt eine hohe plausible Impedanz.";

  // Sanitize phrase translates clinical slang to systemic terms
  const cleanClinical = sanitizeSafetyPhrase(clinicalInput);
  assert.strictEqual(cleanClinical.includes("schizophren"), false, "Clinical phrase 'schizophren' must be redacted");
  assert.strictEqual(cleanClinical.includes("depressiv"), false, "Clinical phrase 'depressiv' must be redacted");
  assert.ok(cleanClinical.includes("ambivalent"), "Should re-phrase to ambivalent");

  // Validate guard detects unsafe sequences
  const check1 = validateSafetyGuards(diagnosticInput);
  assert.strictEqual(check1.isValid, false, "Absolute prediction wordings must be caught by validation guards");
  assert.ok(check1.errorPhrases.length > 0);

  const check2 = validateSafetyGuards(normalInput);
  assert.strictEqual(check2.isValid, true, "Sober systems description should pass safety checks");
});
