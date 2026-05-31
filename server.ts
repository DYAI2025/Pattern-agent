/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import apiRouter from "./server/patternamp/api/routes.js";
import { readStore, writeStore, createScenarioRun, storeRawExport } from "./server/patternamp/persistence/store.js";
import { runNormalizationPipeline } from "./server/patternamp/miroshark/orchestrator.js";

// Load environment variables
import dotenv from "dotenv";
dotenv.config();

const PORT = 3000;

async function bootstrapGoldenFixture() {
  try {
    const store = readStore();
    const goldenId = "sim_b59480b6bbf9";
    const runId = "golden-run-fixture-uuid";

    // If already bootstrapped, skip
    if (store.scenario_runs.some(r => r.miroshark_simulation_id === goldenId || r.id === runId)) {
      console.log("Golden simulation fixture already bootstrapped.");
      return;
    }

    const fixturePath = path.resolve(process.cwd(), "tests", "fixtures", `${goldenId}.json`);
    if (!fs.existsSync(fixturePath)) {
      console.error("Golden fixture file not found, skipping bootstrap.");
      return;
    }

    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    // 1. Create a partial failed scenario run
    createScenarioRun({
      id: runId,
      user_id: "Ben.Poersch@gmail.com",
      trigger_source: "manual",
      status: "failed", // Marks failed at round 28
      miroshark_simulation_id: goldenId,
      rounds_requested: 30,
      rounds_completed: 28,
      actions_count: fixtureData.actions.length,
      error_code: "SIM_TIMEOUT",
      error_message: "Simulation stopped early in round 28 to enforce cost and token controls.",
      completed_at: null
    });

    // 2. Persist the raw export payload
    storeRawExport({
      id: "golden-export-uuid",
      scenario_run_id: runId,
      source_type: "miroshark_json",
      raw_payload: fixtureData,
      raw_text: "Golden seed simulation representing clarity-seeking ambiguity loop."
    });

    // 3. Trigger normalizations
    runNormalizationPipeline(runId);
    console.log("Successfully bootstrapped and normalized Golden simulation run fixture.");

  } catch (error) {
    console.error("Failed to bootstrap Golden test run fixture on server startup:", error);
  }
}

async function startServer() {
  const app = express();
  
  // JSON body parser with comfortable size limits for exports
  app.use(express.json({ limit: "15mb" }));

  // Bootstrap data
  await bootstrapGoldenFixture();

  // PatternAmp API Router
  app.use("/api/pattern-amp", apiRouter);

  // Health endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PatternAmp application backend running at http://localhost:${PORT}`);
  });
}

startServer();
