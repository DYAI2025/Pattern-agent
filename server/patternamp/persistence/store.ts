/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  ScenarioRun,
  ScenarioRawExport,
  PatternActorV1,
  PatternTransitionV1,
  PatternConflictV1,
  PatternDialogueV1,
  ScenarioBranchV1,
  GraphNode,
  GraphEdge
} from '../../../src/types.js';

const DB_DIR = path.resolve(process.cwd(), 'server', 'db');
const DB_FILE = path.join(DB_DIR, 'patternamp-store.json');

export interface StoreSchema {
  scenario_runs: ScenarioRun[];
  scenario_raw_exports: ScenarioRawExport[];
  pattern_actors: PatternActorV1[];
  pattern_transitions: PatternTransitionV1[];
  pattern_conflicts: PatternConflictV1[];
  pattern_dialogues: PatternDialogueV1[];
  scenario_branches: ScenarioBranchV1[];
  scenario_graph_nodes: GraphNode[];
  scenario_graph_edges: GraphEdge[];
}

function ensureDbExists() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialData: StoreSchema = {
      scenario_runs: [],
      scenario_raw_exports: [],
      pattern_actors: [],
      pattern_transitions: [],
      pattern_conflicts: [],
      pattern_dialogues: [],
      scenario_branches: [],
      scenario_graph_nodes: [],
      scenario_graph_edges: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

export function readStore(): StoreSchema {
  ensureDbExists();
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data) as StoreSchema;
  } catch (error) {
    console.error('Error reading PatternAmp database file:', error);
    return {
      scenario_runs: [],
      scenario_raw_exports: [],
      pattern_actors: [],
      pattern_transitions: [],
      pattern_conflicts: [],
      pattern_dialogues: [],
      scenario_branches: [],
      scenario_graph_nodes: [],
      scenario_graph_edges: []
    };
  }
}

export function writeStore(store: StoreSchema): void {
  ensureDbExists();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing PatternAmp database file:', error);
  }
}

// Repository operations for scenario_runs
export function createScenarioRun(run: Omit<ScenarioRun, 'created_at' | 'updated_at'>): ScenarioRun {
  const store = readStore();
  const now = new Date().toISOString();
  const newRun: ScenarioRun = {
    ...run,
    created_at: now,
    updated_at: now
  };
  store.scenario_runs.push(newRun);
  writeStore(store);
  return newRun;
}

export function getScenarioRun(id: string): ScenarioRun | null {
  const store = readStore();
  return store.scenario_runs.find(r => r.id === id) || null;
}

export function updateScenarioRun(id: string, updates: Partial<ScenarioRun>): ScenarioRun | null {
  const store = readStore();
  const index = store.scenario_runs.findIndex(r => r.id === id);
  if (index === -1) return null;

  const now = new Date().toISOString();
  const updatedRun = {
    ...store.scenario_runs[index],
    ...updates,
    updated_at: now
  };

  if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'partial_usable') {
    updatedRun.completed_at = now;
  }

  store.scenario_runs[index] = updatedRun;
  writeStore(store);
  return updatedRun;
}

// Repository operations for scenario_raw_exports
export function storeRawExport(exportData: Omit<ScenarioRawExport, 'created_at'>): ScenarioRawExport {
  const store = readStore();
  const now = new Date().toISOString();
  const newExport: ScenarioRawExport = {
    ...exportData,
    created_at: now
  };
  store.scenario_raw_exports.push(newExport);
  writeStore(store);
  return newExport;
}

export function getRawExportForRun(runId: string): ScenarioRawExport | null {
  const store = readStore();
  return store.scenario_raw_exports.find(e => e.scenario_run_id === runId) || null;
}

// Bulk store functions for normalised entities
export function storeNormalizedActors(runId: string, actors: PatternActorV1[]): void {
  const store = readStore();
  // Filter out any existing actors for this simulation run if needed, but since id contains actor identifiers:
  // We'll replace or append based on simulationId. Let's filter out previous actors linked to raw references.
  // Actually, we can store them and link them via simulationId or sourceRunId.
  // To keep it clean, we can save actors in store.pattern_actors.
  store.pattern_actors = store.pattern_actors.filter(a => !actors.some(na => na.id === a.id));
  store.pattern_actors.push(...actors);
  writeStore(store);
}

export function storeNormalizedTransitions(transitions: PatternTransitionV1[]): void {
  const store = readStore();
  store.pattern_transitions = store.pattern_transitions.filter(t => !transitions.some(nt => nt.id === t.id));
  store.pattern_transitions.push(...transitions);
  writeStore(store);
}

export function storeNormalizedConflicts(conflicts: PatternConflictV1[]): void {
  const store = readStore();
  store.pattern_conflicts = store.pattern_conflicts.filter(c => !conflicts.some(nc => nc.id === c.id));
  store.pattern_conflicts.push(...conflicts);
  writeStore(store);
}

export function storePatternDialogue(dialogue: PatternDialogueV1): void {
  const store = readStore();
  store.pattern_dialogues = store.pattern_dialogues.filter(d => d.simulationId !== dialogue.simulationId);
  store.pattern_dialogues.push(dialogue);
  writeStore(store);
}

export function storeScenarioBranches(branches: ScenarioBranchV1[]): void {
  const store = readStore();
  store.scenario_branches = store.scenario_branches.filter(b => !branches.some(nb => nb.id === b.id));
  store.scenario_branches.push(...branches);
  writeStore(store);
}

export function storeGraphProjection(nodes: GraphNode[], edges: GraphEdge[]): void {
  const store = readStore();
  // Clear previous nodes/edges that might be updated
  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeIds = new Set(edges.map(e => e.id));
  
  store.scenario_graph_nodes = store.scenario_graph_nodes.filter(n => !nodeIds.has(n.id));
  store.scenario_graph_edges = store.scenario_graph_edges.filter(e => !edgeIds.has(e.id));
  
  store.scenario_graph_nodes.push(...nodes);
  store.scenario_graph_edges.push(...edges);
  writeStore(store);
}
