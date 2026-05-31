/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ScenarioRun,
  PatternDialogueV1,
  ScenarioBranchV1,
  GraphDTO,
  CreateRunRequest
} from "./types.js";
import GraphVisualizer from "./components/GraphVisualizer.js";
import {
  Activity,
  Play,
  UploadCloud,
  FileText,
  TrendingUp,
  GitBranch,
  CheckCircle,
  AlertOctagon,
  HelpCircle,
  AlertTriangle,
  Info,
  Maximize2,
  Users,
  Shuffle,
  ShieldCheck,
  Code
} from "lucide-react";

export default function App() {
  // DB & Active state
  const [runs, setRuns] = useState<ScenarioRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState<ScenarioRun | null>(null);
  const [dialogue, setDialogue] = useState<PatternDialogueV1 | null>(null);
  const [branches, setBranches] = useState<ScenarioBranchV1[]>([]);
  const [graph, setGraph] = useState<GraphDTO | null>(null);

  // Statuses
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingActiveRun, setLoadingActiveRun] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [normalizing, setNormalizing] = useState(false);

  // Simulation Trigger Form State
  const [maxRounds, setMaxRounds] = useState<number>(8);
  const [maxTokens, setMaxTokens] = useState<number>(2048);
  const [platforms, setPlatforms] = useState({
    twitter: true,
    reddit: true,
    polymarket: false // Polymarket is cost-guarded
  });

  // Manual Ingestion Input Box
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [rawPayloadInput, setRawPayloadInput] = useState("");
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);

  // Fetch initial list of all runs
  const fetchRunsList = async (selectLatest = false) => {
    try {
      setLoadingRuns(true);
      const res = await fetch("/api/pattern-amp/runs");
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
        if (data.length > 0 && (!selectedRunId || selectLatest)) {
          // Select golden run by default or latest index
          const golden = data.find((r: any) => r.miroshark_simulation_id === "sim_b59480b6bbf9");
          const targetId = golden ? golden.id : data[data.length - 1].id;
          setSelectedRunId(targetId);
        }
      }
    } catch (err) {
      console.error("Error fetching runs:", err);
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    fetchRunsList();
  }, []);

  // Fetch all detailed schemas for selected active run
  const fetchActiveRunDetails = async (runId: string) => {
    try {
      setLoadingActiveRun(true);
      
      // Fetch metadata
      const resMetadata = await fetch(`/api/pattern-amp/runs/${runId}`);
      if (resMetadata.ok) {
        const meta = await resMetadata.json();
        setCurrentRun(meta);
      }

      // Fetch synthesized pattern dialogue
      const resDialogue = await fetch(`/api/pattern-amp/runs/${runId}/dialogue`);
      if (resDialogue.ok) {
        const dial = await resDialogue.json();
        setDialogue(dial);
      } else {
        setDialogue(null);
      }

      // Fetch derived scenario branches
      const resBranches = await fetch(`/api/pattern-amp/runs/${runId}/branches`);
      if (resBranches.ok) {
        const br = await resBranches.json();
        setBranches(br);
      } else {
        setBranches([]);
      }

      // Fetch graph projection DTO
      const resGraph = await fetch(`/api/pattern-amp/runs/${runId}/graph`);
      if (resGraph.ok) {
        const gr = await resGraph.json();
        setGraph(gr);
      } else {
        setGraph(null);
      }

    } catch (err) {
      console.error("Error loading active run schemas:", err);
    } finally {
      setLoadingActiveRun(false);
    }
  };

  useEffect(() => {
    if (selectedRunId) {
      fetchActiveRunDetails(selectedRunId);
    }
  }, [selectedRunId]);

  // Launch simulated live MiroShark Run (POST /api/pattern-amp/runs)
  const handleTriggerLiveRun = async () => {
    try {
      setSimulationRunning(true);
      
      const payload: CreateRunRequest = {
        userId: "Ben.Poersch@gmail.com",
        mode: "current_pattern_field",
        sourceMode: "hypotheses_only",
        triggerSource: "manual",
        runStrategy: "miroshark_live",
        limits: {
          maxRounds,
          maxTokens,
          enabledPlatforms: Object.keys(platforms).filter(k => platforms[k as keyof typeof platforms])
        }
      };

      const res = await fetch("/api/pattern-amp/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const newRun = data.run;
        
        // Add new run into list as "running"
        setRuns((prev) => [newRun, ...prev]);
        setSelectedRunId(newRun.id);

        // Periodically poll for the live simulator to write mock actions & auto-normalize
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          const pingRes = await fetch(`/api/pattern-amp/runs/${newRun.id}`);
          if (pingRes.ok) {
            const updated = await pingRes.json();
            if (updated.status === "completed" || updated.status === "failed" || updated.status === "partial_usable") {
              clearInterval(interval);
              setSimulationRunning(false);
              fetchRunsList();
              setSelectedRunId(newRun.id);
              fetchActiveRunDetails(newRun.id);
            }
          }
          if (attempts > 12) {
            clearInterval(interval);
            setSimulationRunning(false);
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Live run dispatch error:", err);
      setSimulationRunning(false);
    }
  };

  // Submit copy-pasted MiroShark Simulation JSON export (POST /runs/:id/ingest)
  const handleManualIngestSubmit = async () => {
    try {
      setIngestError(null);
      setIngesting(true);
      
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(rawPayloadInput);
      } catch (err) {
        throw new Error("Invalid JSON structure. Please verify the brackets and comma placements.");
      }

      // Step 1: Initialize a queued ingestion run
      const initRes = await fetch("/api/pattern-amp/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "Ben.Poersch@gmail.com",
          mode: "current_pattern_field",
          sourceMode: "hypotheses_only",
          triggerSource: "manual",
          runStrategy: "ingest_existing_export"
        })
      });

      if (!initRes.ok) throw new Error("Failed to initialize system ingestion record");
      const initData = await initRes.json();
      const newRunId = initData.run.id;

      // Step 2: Inject raw export JSON
      const ingestRes = await fetch(`/api/pattern-amp/runs/${newRunId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "miroshark_json",
          rawPayload: parsedPayload
        })
      });

      if (!ingestRes.ok) {
        const errorJson = await ingestRes.json();
        throw new Error(errorJson.error || "Ingest rejected by database guards.");
      }

      // Step 3: Normalize
      setNormalizing(true);
      const normRes = await fetch(`/api/pattern-amp/runs/${newRunId}/normalize`, {
        method: "POST"
      });

      if (!normRes.ok) throw new Error("Automatic Normalization failed.");

      // Success
      setRawPayloadInput("");
      setShowIngestModal(false);
      fetchRunsList();
      setSelectedRunId(newRunId);
      
    } catch (err: any) {
      setIngestError(err.message || "An unexpected error occurred during ingestion");
    } finally {
      setIngesting(false);
      setNormalizing(false);
    }
  };

  // Trigger manual Normalization pipeline
  const handleTriggerNormalize = async () => {
    if (!selectedRunId) return;
    try {
      setNormalizing(true);
      const res = await fetch(`/api/pattern-amp/runs/${selectedRunId}/normalize`, {
        method: "POST"
      });
      if (res.ok) {
        fetchActiveRunDetails(selectedRunId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setNormalizing(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-100 p-4 lg:p-6 font-sans">
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/35">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-white">PatternAmp Backend</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wide font-medium">
            MiroShark Simulation translation Layer &mdash; Agentic Patterns, Dialogue, &amp; Trajectory Maps
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Active run selector */}
          <div className="flex flex-col">
            <label className="text-[10px] font-mono font-medium uppercase text-slate-400 tracking-wider mb-1">Active Scenario Run</label>
            <select
              value={selectedRunId || ""}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg text-xs py-1.5 px-3 min-w-[200px] outline-none text-slate-200 focus:border-indigo-500 font-mono transition-colors"
            >
              {loadingRuns ? (
                <option>Loading historical runs...</option>
              ) : runs.length === 0 ? (
                <option>No runs recorded</option>
              ) : (
                runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.miroshark_simulation_id} ({r.rounds_completed} Rds &mdash; {r.status})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            onClick={() => setShowIngestModal(true)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-850 cursor-pointer text-slate-200 border border-slate-800 font-medium py-1.5 px-3 rounded-lg text-xs mt-4 transition-colors font-sans self-end"
          >
            <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
            Ingest JSON Export
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Controls & Run Summary (Width 4/12) */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          
          {/* 1. DISPATCH / TRIGGER SIMULATOR (Cost Guarded) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-md">
            <h2 className="font-display font-semibold text-sm text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Play className="w-4 h-4 text-indigo-400" />
              Dispatch Social Simulation
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Trigger a live model-simulated run in our sandbox environment with fully enforced cost thresholds.
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span>Max Rounds</span>
                  <span className="text-yellow-500 font-semibold">{maxRounds} <span className="text-[10px] text-slate-500">(Hard Limit: 12)</span></span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="12"
                  value={maxRounds}
                  onChange={(e) => setMaxRounds(Number(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span>Tokens Limit per Call</span>
                  <span className="text-yellow-500 font-semibold">{maxTokens} <span className="text-[10px] text-slate-500">(Hard Limit: 3072)</span></span>
                </div>
                <input
                  type="range"
                  min="512"
                  max="3072"
                  step="256"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-900">
                <span className="text-[10px] font-mono font-medium uppercase text-slate-400 tracking-wider block mb-2">Enabled Platforms</span>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={platforms.twitter}
                      onChange={(e) => setPlatforms({ ...platforms, twitter: e.target.checked })}
                      className="rounded border-slate-800 text-indigo-500 bg-slate-900 font-mono w-3.5 h-3.5"
                    />
                    Twitter / X
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={platforms.reddit}
                      onChange={(e) => setPlatforms({ ...platforms, reddit: e.target.checked })}
                      className="rounded border-slate-800 text-indigo-500 bg-slate-900 font-mono w-3.5 h-3.5"
                    />
                    Reddit Feed
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-500 select-none cursor-not-allowed">
                    <input
                      type="checkbox"
                      disabled
                      checked={platforms.polymarket}
                      className="rounded border-slate-800 text-slate-500 bg-slate-900 font-mono w-3.5 h-3.5"
                    />
                    Polymarket <span className="text-[9px] font-semibold text-amber-500/80 bg-amber-950/30 border border-amber-900/40 px-1 py-0.2 rounded font-mono ml-1">COST-GUARD BLOCKED</span>
                  </label>
                </div>
              </div>

              <button
                onClick={handleTriggerLiveRun}
                disabled={simulationRunning}
                className="w-full bg-indigo-600 hover:bg-slate-300 disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer text-white disabled:cursor-not-allowed font-medium py-2 px-4 rounded-lg text-xs flex items-center justify-center gap-2.5 transition-colors font-sans mt-2"
              >
                {simulationRunning ? (
                  <>
                    <Activity className="w-4 h-4 text-white animate-pulse" />
                    Simulating MiroShark Live...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Boot live simulation run
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 2. INSTANCE STATE SUMMARY */}
          {currentRun && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-md">
              <h2 className="font-display font-semibold text-sm text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
                Metadata &amp; Quality Parameters
              </h2>
              
              <div className="flex flex-col gap-3 font-mono text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-850">
                  <span className="text-slate-400">Run ID</span>
                  <span className="text-slate-200 text-[10px] break-all max-w-[200px] text-right">{currentRun.id}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-850">
                  <span className="text-slate-400">Simulation Alias</span>
                  <span className="text-slate-200 font-semibold">{currentRun.miroshark_simulation_id}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-850">
                  <span className="text-slate-400">Trigger Mode</span>
                  <span className="text-slate-300">{currentRun.trigger_source}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-850">
                  <span className="text-slate-400">Platform Limit</span>
                  <span className="text-slate-400">twitter, reddit</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-850">
                  <span className="text-slate-400">Rounds Requested</span>
                  <span className="text-slate-300">{currentRun.rounds_requested} rds</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-850">
                  <span className="text-slate-400">Rounds Completed</span>
                  <span className="text-slate-300">{currentRun.rounds_completed} rds</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-850">
                  <span className="text-slate-400">Actions Logged</span>
                  <span className="text-yellow-500 font-semibold">{currentRun.actions_count} actions</span>
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">Analysis Status</span>
                  {currentRun.status === "failed" || currentRun.status === "partial_usable" ? (
                    <div className="flex flex-col gap-1 rounded bg-amber-950/20 border border-amber-900/45 p-2 text-amber-300/90">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="text-[10px] font-bold">FAILED BUT USABLE (P0)</span>
                      </div>
                      <p className="text-[10px] font-sans leading-relaxed text-amber-400/85">
                        Simulation crashed/stopped prematurely. However, metadata actions remain fully viable for dialogue translation and branch modeling (REQ-F-006).
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded bg-emerald-950/25 border border-emerald-900/40 p-2 text-emerald-400">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span className="font-bold text-[10px]">ANALYSIS COMPLETED</span>
                    </div>
                  )}
                </div>
              </div>

              {!dialogue && (
                <button
                  onClick={handleTriggerNormalize}
                  disabled={normalizing}
                  className="w-full mt-4 bg-indigo-600 hover:bg-slate-300 disabled:bg-slate-800 disabled:text-slate-400 cursor-pointer font-medium py-1.5 px-3 rounded text-xs transition-colors text-white"
                >
                  {normalizing ? "Normalizing..." : "Normalize actions to Dialogue & Branches"}
                </button>
              )}
            </div>
          )}

          {/* 3. HARD RECONCILIATION NOT-TO-INFER RULES WARNINGS */}
          <div className="bg-rose-950/15 border border-rose-900/35 rounded-xl p-5 shadow-md">
            <h2 className="font-semibold text-xs text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Epistemic Safe-Guards
            </h2>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              To prevent AI-Slop over-generalization and harmful clinical labeling, the dialogue synthesizer evaluates output with the following hard guardlines (REQ-S-001):
            </p>
            <ul className="list-disc pl-4 mt-2 text-[10px] text-slate-400 leading-relaxed font-sans space-y-1.5">
              <li>Absolute predictive wording like <span className="text-rose-400 font-mono">"wird passieren"</span> is mapped down to system potentials (<span className="text-emerald-400 italic">könnte eintreffen</span>).</li>
              <li>Clinical terminology (schizophrenia, depression, syndrome) is strictly prohibited. Modifiers map cleanly to system impedance models.</li>
              <li>Every trajectory trajectory must isolate a dedicated <span className="text-orange-400 font-semibold">what not to infer</span> list.</li>
            </ul>
          </div>
        </section>

        {/* CENTER COLUMN: Pattern Dialogue / Normalized state (Width 5/12) */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          
          {loadingActiveRun ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-10 flex flex-col items-center justify-center gap-4 text-slate-400">
              <Activity className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-sm font-medium font-sans">Translating actions and compiling graph projection schema...</p>
            </div>
          ) : !dialogue ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-10 text-center text-slate-400">
              <AlertOctagon className="w-10 h-10 mx-auto text-amber-500 mb-3" />
              <h3 className="font-display font-semibold text-slate-200 text-sm mb-1 uppercase tracking-wide">Pending Normalization State</h3>
              <p className="text-xs leading-relaxed max-w-sm mx-auto text-slate-500">
                This run contains raw simulated actions but no parsed Dialogue metadata. Trigger normalization to compile actors and branches.
              </p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-6"
            >
              
              {/* HISTORICAL GRAPH COMPONENT (7.5) */}
              {graph && (
                <div className="h-[430px]">
                  <GraphVisualizer graph={graph} />
                </div>
              )}

              {/* DYNAMIC DIALOGUE & SYNTHESIS */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-md">
                <div className="border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-medium text-indigo-400 uppercase tracking-widest bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/30">
                      PatternDialogueV1 Synthesis
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Data Quality: <span className="text-amber-500 font-semibold">{dialogue.dataQuality.status}</span>
                    </span>
                  </div>
                  <h2 className="font-display font-medium text-lg text-white">
                    {dialogue.synthesis.title}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5 font-sans">
                  <div className="bg-slate-950/40 border border-slate-900 rounded-lg p-3.5">
                    <h4 className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1.5 tracking-wider">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      Executive Abstract
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {dialogue.synthesis.summary}
                    </p>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-900 rounded-lg p-3.5">
                    <h4 className="text-[10px] uppercase font-bold text-amber-400 mb-1 flex items-center gap-1.5 tracking-wider">
                      <Shuffle className="w-3.5 h-3.5 text-amber-500" />
                      Key Core Dynamic
                    </h4>
                    <p className="text-xs text-amber-300/90 leading-relaxed">
                      {dialogue.synthesis.keyDynamic}
                    </p>
                  </div>
                </div>

                {/* Synthesis Questions and Limit Statements */}
                <div className="mb-5 bg-slate-950/20 border border-slate-900 p-3.5 rounded-lg">
                  <div className="flex items-start gap-2 mb-3">
                    <HelpCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Open Simulation Question</h4>
                      <p className="text-xs italic text-slate-300 mt-0.5">
                        &quot;{dialogue.synthesis.openQuestion}&quot;
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 pt-2.5 border-t border-slate-900">
                    <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Logical Boundary Limits (What NOT to Infer)</h4>
                      <ul className="list-disc pl-4 mt-1 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
                        {dialogue.synthesis.notToInfer.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* 7.1 Identified Actors and classified roles */}
                <div className="mb-5">
                  <h3 className="text-xs font-mono font-medium text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                    <Users className="w-4 h-4 text-indigo-400" />
                    Identified Actors &amp; classified roles
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dialogue.actors.map((actor) => (
                      <div key={actor.id} className="bg-[#0b0f19] border border-slate-900 rounded-lg p-3 flex flex-col justify-between hover:border-slate-800 transition-all">
                        <div className="flex items-start justify-between mb-1.5">
                          <div>
                            <span className="font-display font-medium text-xs text-white block">{actor.label}</span>
                            <span className="text-[10px] font-mono text-slate-500 font-medium tracking-wide italic">source: {actor.sourceAgentName}</span>
                          </div>
                          
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-[9px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded border ${
                              actor.role === "pattern" ? "bg-blue-950/40 text-blue-400 border-blue-900/40" :
                              actor.role === "memory" ? "bg-purple-900/20 text-purple-400 border-purple-800/40" :
                              actor.role === "evidence" ? "bg-amber-950/30 text-amber-400 border-amber-900/30" :
                              "bg-slate-900 text-slate-400 border-slate-800"
                            }`}>
                              {actor.role}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 font-sans italic bg-slate-950/40 p-1.5 rounded border border-slate-950 mb-2">
                          &ldquo;{actor.stance}&rdquo;
                        </p>

                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-500">Confidence Match</span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1 bg-slate-800 rounded overflow-hidden">
                              <div className="h-full bg-indigo-500" style={{ width: `${actor.confidence * 100}%` }}></div>
                            </div>
                            <span className="text-indigo-400 font-semibold">{Math.round(actor.confidence * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 7.2 Multi-Step State Transitions and Pivots */}
                {dialogue.transitions.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-xs font-mono font-medium text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4 text-amber-500" />
                      Multi-Step State Transitions &amp; Pivots
                    </h3>
                    <div className="flex flex-col gap-4">
                      {dialogue.transitions.map((trans) => (
                        <div key={trans.id} className="bg-[#0b0f19] border border-slate-900 rounded-lg p-4 font-sans">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-1 border-b border-slate-900 pb-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-bold bg-amber-950/40 border border-amber-900/40 text-amber-400 px-1.5 py-0.5 rounded uppercase">Transition Pivot</span>
                              <span className="text-xs font-mono font-medium text-indigo-400">Actor: {trans.actorId.replace("actor-", "").toUpperCase()}</span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-500">Rounds {trans.fromRound || "?"} &rarr; {trans.toRound || "?"}</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center mb-4 bg-slate-950/40 p-3 rounded-lg border border-slate-950 font-mono text-xs">
                            <div className="text-center md:text-left">
                              <span className="text-[9px] block text-slate-500 uppercase tracking-wider mb-0.5">Before State</span>
                              <span className="text-slate-300 font-medium italic">{trans.beforeState}</span>
                            </div>
                            <div className="flex flex-col items-center justify-center border-y md:border-y-0 md:border-x border-slate-900 py-2 md:py-0">
                              <span className="text-[9px] text-amber-500 uppercase tracking-wider font-bold mb-0.5 animate-pulse">Trigger Event</span>
                              <span className="text-amber-400 text-center font-bold">{trans.trigger}</span>
                            </div>
                            <div className="text-center md:text-right">
                              <span className="text-[9px] block text-slate-500 uppercase tracking-wider mb-0.5">After State</span>
                              <span className="text-emerald-400 font-medium italic">{trans.afterState}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mb-3">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Coping Self-Explanation</span>
                              <p className="text-slate-300 leading-relaxed italic bg-slate-900/50 p-2.5 rounded border border-slate-900">
                                &ldquo;{trans.selfExplanation}&rdquo;
                              </p>
                            </div>
                            {trans.externalChallenge && (
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">External Challenge</span>
                                <p className="text-rose-300/90 leading-relaxed italic bg-slate-900/50 p-2.5 rounded border border-slate-900">
                                  &ldquo;{trans.externalChallenge}&rdquo;
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 p-2 bg-indigo-950/10 rounded border border-indigo-950 font-mono text-[11px] text-indigo-400">
                            <Info className="w-3.5 h-3.5" />
                            <span><strong>Pattern Interpretation:</strong> {trans.patternMeaning}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 7.4 DERIVED SCENARIO TRAJECTORY BRANCHES */}
              {branches.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-md">
                  <h3 className="font-display font-medium text-sm text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-indigo-400" />
                    Derived Scenario Trajectory Branches ({branches.length})
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {branches.map((branch, idx) => (
                      <div key={branch.id || idx} className="bg-[#0b0f19] border border-slate-900 rounded-lg p-3.5 flex flex-col justify-between hover:border-slate-800 transition-all font-sans relative overflow-hidden">
                        
                        {/* Visual Accent */}
                        <div className={`absolute top-0 inset-x-0 h-1 ${
                          branch.tendencyType === "amplification" ? "bg-amber-500" :
                          branch.tendencyType === "drift" ? "bg-purple-500" :
                          "bg-blue-500"
                        }`}></div>

                        <div>
                          <div className="flex items-start justify-between min-h-[30px] mb-2 pt-1">
                            <span className="font-display font-bold text-xs text-white pr-2 block leading-snug">
                              {branch.title}
                            </span>
                            <span className="text-[8px] font-mono font-bold bg-slate-900 border border-slate-800 text-indigo-400 px-1 py-0.2 rounded uppercase">
                              {branch.tendencyType}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                            {branch.summary}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 mt-auto border-t border-slate-900/55 pt-3">
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="text-slate-500">Coherence Shift</span>
                            <span className={branch.coherenceDelta < 0 ? "text-rose-400 font-semibold" : "text-emerald-400 font-semibold"}>
                              {branch.coherenceDelta > 0 ? "+" : ""}{Math.round(branch.coherenceDelta * 100)}%
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-[10px] font-mono mb-2">
                            <span className="text-slate-500">Tension Change</span>
                            <span className="text-amber-400 font-semibold">
                              {branch.tensionDelta > 0 ? "+" : ""}{Math.round(branch.tensionDelta * 100)}%
                            </span>
                          </div>

                          <div className="bg-slate-950/40 p-2 rounded text-[9px] border border-slate-950/60 leading-relaxed text-slate-400 mb-2">
                            <span className="font-bold text-[8px] text-rose-400 uppercase tracking-widest block mb-1">Traject Limit (what NOT to infer):</span>
                            &bull; {branch.notToInfer[0] || "None specified"}
                          </div>

                          <div className="p-1.5 bg-indigo-950/20 rounded border border-indigo-950 text-[9px] text-indigo-300 italic text-center">
                            Q: &quot;{branch.reflectiveQuestion}&quot;
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                </div>
              )}

            </motion.div>
          )}

        </section>

      </main>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto border-t border-slate-800 py-6 mt-12 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-slate-500">
        <p>&copy; 2026 Google AI Studio. Full stack sandbox simulation coordinator.</p>
        <span className="flex items-center gap-1">
          <Code className="w-3.5 h-3.5 text-indigo-500" />
          Active Model Aliases: <span className="text-indigo-400 font-semibold">gemini-3.5-flash / tsx backend</span>
        </span>
      </footer>

      {/* MODAL OVERLAY: RAW JSON INGEST (REQ-F-001) */}
      <AnimatePresence>
        {showIngestModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-2xl overflow-hidden font-sans flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-display font-semibold text-sm text-slate-200">Ingest Simulation JSON Export</h3>
                </div>
                <button
                  onClick={() => {
                    setShowIngestModal(false);
                    setIngestError(null);
                  }}
                  className="text-slate-400 hover:text-white font-bold cursor-pointer text-sm"
                >
                  &times;
                </button>
              </div>

              <div className="flex-1 overflow-y-auto mb-4">
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Paste the raw simulation logs representing your MiroShark run actions. The database will persist standard JSON keys cleanly, execute safety-redactions, and trigger normalization.
                </p>

                <textarea
                  value={rawPayloadInput}
                  onChange={(e) => setRawPayloadInput(e.target.value)}
                  placeholder='{"simulationId": "sim_custom_99", "status": "completed", "roundsCompleted": 12, "actions": [{"round": 12, "agent_name": "H1", "content": "leerer Feed encountered. Action pivot triggered.", "stance": "Strategic retreat"}]}'
                  className="w-full h-44 bg-[#0a0f1d] border border-slate-800 rounded-lg p-3 outline-none text-xs font-mono text-indigo-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                ></textarea>

                {ingestError && (
                  <div className="mt-3 p-3 rounded bg-rose-950/20 border border-rose-900/40 text-rose-300 text-xs flex items-start gap-1.5 leading-relaxed">
                    <AlertCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{ingestError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 shrink-0">
                <button
                  onClick={() => setShowIngestModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-800 text-slate-300 hover:text-white cursor-pointer hover:bg-slate-850 text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualIngestSubmit}
                  disabled={ingesting || !rawPayloadInput.trim()}
                  className="bg-indigo-600 hover:bg-slate-300 disabled:bg-slate-800 disabled:text-slate-500 text-white disabled:cursor-not-allowed font-medium py-1.5 px-4 rounded-lg cursor-pointer text-xs transition-colors flex items-center gap-1.5"
                >
                  {ingesting ? (
                    <>
                      <Activity className="w-3.5 h-3.5 animate-spin" />
                      Ingesting &amp; Parsing...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      Submit Ingest Invariant
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Icon helpers to avoid extra dependencies
function AlertCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
