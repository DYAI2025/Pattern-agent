/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import {
  initializeScenarioRun,
  ingestSimulationData,
  runNormalizationPipeline
} from "../miroshark/orchestrator.js";
import {
  readStore,
  getScenarioRun,
  getRawExportForRun
} from "../persistence/store.js";
import { validateSafetyGuards } from "../safety/guards.js";

const router = express.Router();

/**
 * GET /api/pattern-amp/runs
 * Return a list of all scenario runs stored in the database.
 */
router.get("/runs", (req, res) => {
  try {
    const store = readStore();
    res.json(store.scenario_runs);
  } catch (error) {
    res.status(500).json({ error: "Failed to read database store" });
  }
});

/**
 * POST /api/pattern-amp/runs
 * Initiates a new run (live simulation or prepared export ingestion).
 */
router.post("/runs", (req, res) => {
  try {
    const { userId, mode, sourceMode, triggerSource, runStrategy, limits } = req.body;

    if (!runStrategy) {
      return res.status(400).json({ error: "Missing required parameter: runStrategy" });
    }

    const { run, warnings } = initializeScenarioRun({
      userId: userId || "anonymous",
      mode: mode || "current_pattern_field",
      sourceMode: sourceMode || "hypotheses_only",
      triggerSource: triggerSource || "manual",
      runStrategy,
      limits
    });

    res.status(201).json({ run, warnings });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to initialize run" });
  }
});

/**
 * POST /api/pattern-amp/runs/:id/ingest
 * Ingests MiroShark simulation export payload (reports, actions, or predictions).
 */
router.post("/runs/:id/ingest", (req, res) => {
  try {
    const runId = req.params.id;
    const { sourceType, rawPayload, rawText } = req.body;

    if (!sourceType) {
      return res.status(400).json({ error: "Missing required parameter: sourceType" });
    }

    // Safety checks for forbidden clinical/diagnostic statements (REQ-S-001)
    const textToCheck = JSON.stringify(rawPayload || "") + " " + (rawText || "");
    const safety = validateSafetyGuards(textToCheck);
    if (!safety.isValid) {
      return res.status(400).json({
        error: "Payload violated safety limits: diagnostic or predictive absolute claims detected.",
        blockedPhrases: safety.errorPhrases
      });
    }

    const rawExport = ingestSimulationData(runId, {
      sourceType,
      rawPayload,
      rawText
    });

    res.status(200).json({ status: "success", rawExportId: rawExport.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Ingest failed" });
  }
});

/**
 * POST /api/pattern-amp/runs/:id/normalize
 * Triggers the extraction modules to build Dialogue & Branches.
 */
router.post("/runs/:id/normalize", (req, res) => {
  try {
    const runId = req.params.id;
    const result = runNormalizationPipeline(runId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Normalization pipeline failed" });
  }
});

/**
 * GET /api/pattern-amp/runs/:id
 * Fetches basic summary and metadata of a run.
 */
router.get("/runs/:id", (req, res) => {
  try {
    const run = getScenarioRun(req.params.id);
    if (!run) {
      return res.status(404).json({ error: `Run with ID ${req.params.id} not found.` });
    }
    res.json(run);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pattern-amp/runs/:id/dialogue
 * Returns the synthesized PatternDialogueV1 structure.
 */
router.get("/runs/:id/dialogue", (req, res) => {
  try {
    const store = readStore();
    const dialogue = store.pattern_dialogues.find(d => d.sourceRunId === req.params.id);
    if (!dialogue) {
      return res.status(404).json({ error: "Dialogue not yet synthesized/normalized for this run." });
    }
    res.json(dialogue);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pattern-amp/runs/:id/branches
 * Returns ScenarioBranchV1[] for the current run.
 */
router.get("/runs/:id/branches", (req, res) => {
  try {
    const store = readStore();
    // Filter scenario branches matching current run
    const branches = store.scenario_branches.filter(b => b.id.includes(req.params.id));
    if (branches.length === 0) {
      return res.status(404).json({ error: "Branches not yet Derived for this run." });
    }
    res.json(branches);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pattern-amp/runs/:id/graph
 * Returns Nodes and Edges GraphDTO.
 */
router.get("/runs/:id/graph", (req, res) => {
  try {
    const store = readStore();
    const nodes = store.scenario_graph_nodes.filter(n => n.id.includes(req.params.id) || n.type === "actor" || n.type === "hypothesis");
    const edges = store.scenario_graph_edges.filter(e => e.id.includes(req.params.id) || e.type === "supports" || e.type === "contradicts");

    if (nodes.length === 0) {
      return res.status(404).json({ error: "Graph Projection not yet derived for this run." });
    }

    res.json({ nodes, edges });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
