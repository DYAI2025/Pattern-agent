/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pattern Actor definition (REQ-F-002)
export type PatternActorV1 = {
  id: string;
  sourceAgentName: string;
  patternId?: "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "H7" | "AgentMemory" | "EvidenceSummary";
  label: string;
  role: "pattern" | "memory" | "evidence" | "user_proxy" | "observer" | "unknown";
  stance: string;
  linkedHypotheses: string[];
  confidence: number;
  rawSourceRefs: string[];
};

// Pattern Transition definition (REQ-F-003)
export type PatternTransitionV1 = {
  id: string;
  actorId: string;
  fromRound: number | null;
  toRound: number | null;
  beforeState: string;
  trigger: string;
  afterState: string;
  selfExplanation: string;
  externalChallenge: string | null;
  patternMeaning: string;
  relatedHypothesisIds: string[];
  confidence: number;
  notToInfer: string[];
};

// Pattern Conflict definition (REQ-F-004)
export type PatternConflictV1 = {
  id: string;
  actorA: string; // Actor ID or Name
  actorB: string; // Actor ID or Name
  conflictType: "contradiction" | "reframe" | "amplification" | "stabilization" | "challenge";
  claimA: string;
  claimB: string;
  usefulTension: string;
  relatedHypothesisIds: string[];
  confidence: number;
};

// Pattern Dialogue definition (REQ-F-002 bis REQ-F-006)
export type PatternDialogueV1 = {
  simulationId: string;
  userId: string;
  sourceRunId: string;
  actors: PatternActorV1[];
  transitions: PatternTransitionV1[];
  conflicts: PatternConflictV1[];
  synthesis: {
    title: string;
    summary: string;
    keyDynamic: string;
    openQuestion: string;
    notToInfer: string[];
  };
  dataQuality: {
    status: "complete" | "partial" | "failed_but_usable";
    actionCount: number;
    roundsCompleted: number;
    sourceWarnings: string[];
  };
};

// Scenario Branch definition (REQ-F-005)
export type ScenarioBranchV1 = {
  id: string;
  title: string;
  summary: string;
  tendencyType: "amplification" | "interruption" | "stabilization" | "integration" | "contradiction" | "drift" | "recalibration";
  confidence: number;
  probabilityWeight: number | null;
  horizonRelevance: "now" | "7_days" | "30_days" | "unknown";
  relatedHypothesisIds: string[];
  sourceWeights: Record<string, number>;
  coherenceDelta: number;
  tensionDelta: number;
  notToInfer: string[];
  reflectiveQuestion: string;
  whyAppears: string;
  whatResonates: string;
  whereFriction: string;
  increaseCoherence: string;
  epistemicLabels: string[];
  visualState: Record<string, unknown>;
};

// Database Model representations
export type ScenarioRun = {
  id: string; // uuid pk
  user_id: string;
  trigger_source: string; // "manual", etc.
  status: "queued" | "running" | "completed" | "failed" | "partial_usable";
  miroshark_simulation_id: string;
  rounds_requested: number;
  rounds_completed: number;
  actions_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string; // ISO date
  updated_at: string; // ISO date
  completed_at: string | null; // ISO date
};

export type ScenarioRawExport = {
  id: string; // uuid pk
  scenario_run_id: string; // fk
  source_type: "miroshark_json" | "influence_report" | "prediction_report" | "deep_insight" | "manual_dialogue";
  raw_payload: Record<string, any>;
  raw_text: string | null;
  created_at: string;
};

// Graph Projection Node and Edge representations (REQ-F-005)
export type GraphNode = {
  id: string;
  label: string;
  type: "actor" | "hypothesis" | "transition" | "conflict" | "branch";
  properties: Record<string, any>;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "supports" | "contradicts" | "reframes" | "amplifies" | "interrupts" | "stabilizes";
  properties: Record<string, any>;
};

export type GraphDTO = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

// PatternAmp API interfaces
export type CreateRunRequest = {
  userId: string;
  mode: string; // "current_pattern_field"
  sourceMode: string; // "hypotheses_only"
  triggerSource: string; // "manual", etc
  runStrategy: "miroshark_live" | "ingest_existing_export";
  limits?: {
    maxRounds?: number;
    maxTokens?: number;
    enabledPlatforms?: string[];
  };
};

export type IngestExportRequest = {
  sourceType: "miroshark_json" | "influence_report" | "prediction_report" | "deep_insight" | "manual_dialogue";
  rawPayload?: Record<string, any>;
  rawText?: string;
};
