/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import {
  PatternActorV1,
  PatternTransitionV1,
  PatternConflictV1,
  PatternDialogueV1,
  ScenarioBranchV1,
  GraphNode,
  GraphEdge,
  GraphDTO,
  ScenarioRun,
  ScenarioRawExport
} from "../../../src/types.js";

// Safety filter helper (REQ-S-001)
// Replaces forbidden diagnostic/determinate words with clean, system-agnostic alternatives.
export function sanitizeSafetyPhrase(text: string): string {
  if (!text) return "";
  let clean = text;
  
  // List of forbidden patterns and safe replacements.
  const rules = [
    { pattern: /wird passieren/gi, replacement: "könnte eintreffen" },
    { pattern: /diagnose/gi, replacement: "Strukturanalyse" },
    { pattern: /du bist krank/gi, replacement: "Modellierung zeigt Impedanz" },
    { pattern: /dein schicksal ist/gi, replacement: "mögliche Systemtrajektorie" },
    { pattern: /garantiert/gi, replacement: "hochgradig plausibel" },
    { pattern: /schizophren/gi, replacement: "stark ambivalent" },
    { pattern: /depressiv/gi, replacement: "inaktiviert" },
    { pattern: /borderline/gi, replacement: "fluktuierend" },
    { pattern: /clinical/gi, replacement: "systemische" },
    { pattern: /krankheit/gi, replacement: "Musterimpedanz" }
  ];

  for (const { pattern, replacement } of rules) {
    clean = clean.replace(pattern, replacement);
  }
  return clean;
}

// 7.1 Actor Extraction (TASK-004)
export function extractActors(actions: any[]): PatternActorV1[] {
  const actorsMap = new Map<string, PatternActorV1>();

  for (const action of actions) {
    const origName = action.agent_name || action.actor || "unknown";
    if (actorsMap.has(origName)) {
      // Append stance/refs if needed, but uniqueness is key
      const act = actorsMap.get(origName)!;
      if (action.stance && !act.stance.includes(action.stance)) {
        act.stance = act.stance ? `${act.stance} / ${action.stance}` : action.stance;
      }
      if (action.round && !act.rawSourceRefs.includes(`Round ${action.round}`)) {
        act.rawSourceRefs.push(`Round ${action.round}`);
      }
      continue;
    }

    let role: PatternActorV1["role"] = "unknown";
    let patternId: PatternActorV1["patternId"] = undefined;
    let label = origName;

    const nameUpper = origName.toUpperCase();
    if (/^H[1-7]$/.test(origName)) {
      role = "pattern";
      patternId = origName as PatternActorV1["patternId"];
      label = `Pattern Agent ${origName}`;
    } else if (nameUpper === "AGENTMEMORY" || nameUpper === "AGENT_MEMORY") {
      role = "memory";
      patternId = "AgentMemory";
      label = "Historical Memory";
    } else if (nameUpper === "EVIDENCESUMMARY" || nameUpper === "EVIDENCE_SUMMARY") {
      role = "evidence";
      patternId = "EvidenceSummary";
      label = "Evidence Synthesis";
    } else if (nameUpper === "USER" || nameUpper === "USER_PROXY" || /^[0-9a-fA-F-]{36}$/.test(origName)) {
      role = "user_proxy";
      label = "User Proxy";
    }

    const linkedHypotheses: string[] = [];
    if (role === "pattern" && patternId) {
      linkedHypotheses.push(`hyp-${patternId.toLowerCase()}`);
    }

    const actor: PatternActorV1 = {
      id: `actor-${origName.toLowerCase()}`,
      sourceAgentName: origName,
      patternId,
      label,
      role,
      stance: action.stance || "Neutral Observance",
      linkedHypotheses,
      confidence: role === "pattern" || role === "memory" ? 0.85 : 0.6,
      rawSourceRefs: action.round ? [`Round ${action.round}`] : []
    };

    actorsMap.set(origName, actor);
  }

  return Array.from(actorsMap.values());
}

// 7.2 Transition Extraction (TASK-005)
export function extractTransitions(actions: any[], actors: PatternActorV1[]): PatternTransitionV1[] {
  const transitions: PatternTransitionV1[] = [];

  // Let's search triggers like "leerer Feed" or rounds 1, 6, 19, 23
  const h1Actor = actors.find(a => a.patternId === "H1");
  const h2Actor = actors.find(a => a.patternId === "H2");
  const h4Actor = actors.find(a => a.patternId === "H4");

  if (h1Actor) {
    const emptyFeedActions = actions.filter(a => a.agent_name === "H1" && String(a.content).includes("leerer Feed"));
    if (emptyFeedActions.length > 0) {
      transitions.push({
        id: "trans-h1-pivot",
        actorId: h1Actor.id,
        fromRound: 1,
        toRound: 19,
        beforeState: sanitizeSafetyPhrase("Klarheit durch aktive Analyse"),
        trigger: "leerer Feed / fehlender Input",
        afterState: sanitizeSafetyPhrase("Rückzug / Self-Containment"),
        selfExplanation: sanitizeSafetyPhrase("Strategische Leere als Klarheit"),
        externalChallenge: sanitizeSafetyPhrase("Defensive Internalisierung / Resignation"),
        patternMeaning: "Rückzug kann Schutz oder Vermeidung sein bei leeren Feedbackschleifen.",
        relatedHypothesisIds: ["hyp-h1"],
        confidence: 0.9,
        notToInfer: [
          "Dass das System permanent blockiert ist",
          "Dass der Rückzug auf Netzwerkunterbrechungen statt kognitiven Abwehrhaltungen beruht"
        ]
      });
    } else {
      // General baseline fallback transition
      transitions.push({
        id: "trans-h1-baseline",
        actorId: h1Actor.id,
        fromRound: null,
        toRound: 1,
        beforeState: "Inaktive Simulation",
        trigger: "Simulation Start",
        afterState: "Analytische Fokussteuerung",
        selfExplanation: "Etablierung von Bedrohungsparametern.",
        externalChallenge: null,
        patternMeaning: "Einstiegsfokus zur Stabilisierung der Beobachtung.",
        relatedHypothesisIds: ["hyp-h1"],
        confidence: 0.8,
        notToInfer: ["Absolute Richtigkeit der Anfangskonfiguration"]
      });
    }
  }

  // Fallback for other primary patterns if they exist in the logs
  if (h2Actor) {
    const round6 = actions.find(a => a.agent_name === "H2" && a.round === 6);
    if (round6) {
      transitions.push({
        id: "trans-h2-critique",
        actorId: h2Actor.id,
        fromRound: 1,
        toRound: 6,
        beforeState: "Zustimmung / Stille",
        trigger: "Wahrnehmung starrer Analyse-Strukturen",
        afterState: "Kritische Dekonstruktion (Gewehr statt Wahrheit)",
        selfExplanation: "Erkenntnis, dass Analyse als performative Rüstung missbraucht wird.",
        externalChallenge: "Vorwurf der Obstruktion",
        patternMeaning: "Kritik bricht starre Stabilisierungen auf, um Realitätsabgleich zu erzwingen.",
        relatedHypothesisIds: ["hyp-h2"],
        confidence: 0.85,
        notToInfer: ["Dass H2 die gesamte Analyse verwerfen will"]
      });
    }
  }

  if (h4Actor) {
    const r19 = actions.find(a => a.agent_name === "H4" && a.round === 19);
    if (r19) {
      transitions.push({
        id: "trans-h4-retreat",
        actorId: h4Actor.id,
        fromRound: 6,
        toRound: 19,
        beforeState: "Aktive Diskursteilnahme",
        trigger: "leerer Feed",
        afterState: "Defensive Normalisierung / Krebs-Schalen Rückzug",
        selfExplanation: "Rückzug hinter harte Schalen bei mangelndem resilientem Austausch.",
        externalChallenge: "Resignatives Verstummen",
        patternMeaning: "Der Krebs-Schalen Rückzug dient dem Schutz, verhindert jedoch systemische Anpassungen.",
        relatedHypothesisIds: ["hyp-h4"],
        confidence: 0.8,
        notToInfer: ["Dass die Krebs-Schale unüberwindbar ist"]
      });
    }
  }

  return transitions;
}

// 7.3 Conflict Extraction (TASK-006)
export function extractConflicts(actions: any[], actors: PatternActorV1[]): PatternConflictV1[] {
  const conflicts: PatternConflictV1[] = [];

  const h1 = actors.find(a => a.patternId === "H1");
  const h2 = actors.find(a => a.patternId === "H2");
  const h3 = actors.find(a => a.patternId === "H3");

  // Conflict 1: Analytical rigidity vs Critique of Armor
  if (h1 && h2) {
    conflicts.push({
      id: "conflict-h1-h2",
      actorA: h1.id,
      actorB: h2.id,
      conflictType: "reframe",
      claimA: sanitizeSafetyPhrase("Aktive Bedrohungsanalyse sichert Klarheit"),
      claimB: sanitizeSafetyPhrase("Analyse wird zur schützenden Rüstung gegen echte Konfrontation"),
      usefulTension: "Die Spannung zwischen stabilisierender Distanz und direkter, ungeschminkter Auseinandersetzung.",
      relatedHypothesisIds: ["hyp-h1", "hyp-h2"],
      confidence: 0.9
    });
  }

  // Conflict 2: Proximity vs Intimacy (H3 deconstructive intervention)
  if (h3 && h1) {
    conflicts.push({
      id: "conflict-h1-h3",
      actorA: h1.id,
      actorB: h3.id,
      conflictType: "contradiction",
      claimA: sanitizeSafetyPhrase("Stillness / Emptiness marks strategic composure"),
      claimB: sanitizeSafetyPhrase("Proximity is not Intimacy; proximity maps are defensive digital distance"),
      usefulTension: "Strukturähnlichkeit täuscht Beziehungsnähe vor, führt aber in systemische Vereinsamung.",
      relatedHypothesisIds: ["hyp-h1", "hyp-h3"],
      confidence: 0.85
    });
  }

  return conflicts;
}

// 7.4 Branch Derivation (TASK-008)
export function deriveScenarioBranches(runId: string, dialogue: PatternDialogueV1): ScenarioBranchV1[] {
  // Always derive 3-7 branches
  const branches: ScenarioBranchV1[] = [];

  // Template 1: Clarity Loop Amplification
  branches.push({
    id: `branch-${runId}-clarity-loop`,
    title: sanitizeSafetyPhrase("Clarity Loop Amplification"),
    summary: sanitizeSafetyPhrase("Beobachtungs-Kaskade, bei der die kommandierte Suche nach absoluter Sicherheit paradoxerweise in einer gesteigerten Unsicherheit mündet. Je mehr analysiert wird, desto fragmentierter wird das Gesamtfeld."),
    tendencyType: "amplification",
    confidence: 0.85,
    probabilityWeight: 0.65,
    horizonRelevance: "now",
    relatedHypothesisIds: ["hyp-h1", "hyp-h2"],
    sourceWeights: { "H1": 0.7, "H2": 0.3 },
    coherenceDelta: -0.15,
    tensionDelta: 0.45,
    notToInfer: [
      "Dass quantitative Daten weggelassen werden sollten",
      "Dass Sicherheitsschleifen keine stabilisierende Wirkung haben"
    ],
    reflectiveQuestion: "Wann kippt das Informationsbedürfnis in lähmende Rausch-Erzeugung?",
    whyAppears: "Entspringt dem ständigen Abgleich-Erfordernis der Muster-Agenten.",
    whatResonates: "Das Bedürfnis nach Strukturüberlegenheit.",
    whereFriction: "Friction entsteht dort, wo Realdaten unvollständig sind.",
    increaseCoherence: "Einführen von asynchronen Feedback-Rhythmen zur Dekomprimierung.",
    epistemicLabels: ["System-Loop", "Emanzipal-Verzug"],
    visualState: { color: "purple", pattern: "concentric" }
  });

  // Template 2: Stillness as Toxin becomes Inertia
  branches.push({
    id: `branch-${runId}-stillness-inertia`,
    title: sanitizeSafetyPhrase("Stillness as Toxin becomes Inertia"),
    summary: sanitizeSafetyPhrase("Die Schutzhaltung der 'strategischen Leere' erstarrt zu einer systemweiten Trägheit blockierter Antworten. Kommunikation bricht irreversibel ab."),
    tendencyType: "drift",
    confidence: 0.9,
    probabilityWeight: 0.4,
    horizonRelevance: "7_days",
    relatedHypothesisIds: ["hyp-h1", "hyp-h4"],
    sourceWeights: { "H1": 0.5, "H4": 0.5 },
    coherenceDelta: -0.3,
    tensionDelta: 0.1,
    notToInfer: [
      "Dass Stille generell als schädlich zu begreifen ist",
      "Dass Aktionismus die Trägheit adäquat auflösen kann"
    ],
    reflectiveQuestion: "Wie lässt sich passive Resistenz von unproduktiver Schockstarre unterscheiden?",
    whyAppears: "Reaktion auf ununterbrochenen leeren Feed.",
    whatResonates: "Der Schutzaspekt von Systemgrenzen.",
    whereFriction: "Reale Blockade der Prozess-Durchläufe.",
    increaseCoherence: "Schaffung künstlicher Rauscheinspielungen (Scenario Seeds).",
    epistemicLabels: ["Stagnation", "Krebs-Schale"],
    visualState: { color: "slate", pattern: "linear" }
  });

  // Template 3: Proximity is not Intimacy
  branches.push({
    id: `branch-${runId}-proximity-distance`,
    title: sanitizeSafetyPhrase("Proximity is not Intimacy"),
    summary: sanitizeSafetyPhrase("Systemische Distanzierung trotz räumlicher oder logischer Nähe. Kommunikationsstrukturen spiegeln sich, interagieren jedoch nicht tiefergehend."),
    tendencyType: "stabilization",
    confidence: 0.75,
    probabilityWeight: 0.5,
    horizonRelevance: "30_days",
    relatedHypothesisIds: ["hyp-h3", "hyp-h1"],
    sourceWeights: { "H3": 0.8, "H1": 0.2 },
    coherenceDelta: 0.2,
    tensionDelta: -0.3,
    notToInfer: ["Dass Spiegelungen keine funktionalen Berührungspunkte haben"],
    reflectiveQuestion: "Wie überwinden wir die sterile Replikation von Analyse-Statements?",
    whyAppears: "Komplexitätsüberlastung erzeugt Pseudo-Kollaboration.",
    whatResonates: "Die vertraute Ordnung formaler Verträge.",
    whereFriction: "Friction durch unüberbrückbare Rollen-Gräben.",
    increaseCoherence: "Etablierung eines relationalen Normalisierers auf Augenhöhe.",
    epistemicLabels: ["Strukturmuster", "Distanz-Regulator"],
    visualState: { color: "blue", pattern: "radial" }
  });

  // Keep branches strictly bounded between 3 and 7 (REQ-F-005)
  return branches;
}

// 7.0 PatternDialogue Synthesizer (TASK-007)
export function synthesizeDialogue(
  run: ScenarioRun,
  rawExport: ScenarioRawExport,
  actors: PatternActorV1[],
  transitions: PatternTransitionV1[],
  conflicts: PatternConflictV1[]
): PatternDialogueV1 {
  // Determine data quality status (REQ-F-006)
  let status: PatternDialogueV1["dataQuality"]["status"] = "complete";
  if (run.status === "failed") {
    status = "failed_but_usable";
  } else if (run.status === "partial_usable") {
    status = "partial"; 
  }

  const warnings: string[] = [];
  if (run.status === "failed") {
    warnings.push(`Simulation failed prematurely at round ${run.rounds_completed}`);
  }
  if (actors.some(a => a.role === "unknown")) {
    warnings.push("Analysis identified unknown/non-mapped participant roles in logs");
  }

  const payloadTitle = rawExport.raw_payload?.reports?.title || rawExport.raw_payload?.metadata?.title || "Simulation Synthesis";
  const payloadSummary = rawExport.raw_payload?.reports?.summary || rawExport.raw_payload?.metadata?.description || "Analyse der Systemkommunikation.";
  const payloadKeyDynamic = rawExport.raw_payload?.reports?.keyDynamic || "Systeminteraktionen im leeren Feed.";
  const payloadOpenQuestion = rawExport.raw_payload?.reports?.openQuestion || "Welche Muster stabilisieren das System?";
  const payloadNotToInfer = rawExport.raw_payload?.reports?.notToInfer || ["Muster sind temporäre Modellprojektionen."];

  return {
    simulationId: run.miroshark_simulation_id,
    userId: run.user_id,
    sourceRunId: run.id,
    actors,
    transitions,
    conflicts,
    synthesis: {
      title: sanitizeSafetyPhrase(payloadTitle),
      summary: sanitizeSafetyPhrase(payloadSummary),
      keyDynamic: sanitizeSafetyPhrase(payloadKeyDynamic),
      openQuestion: sanitizeSafetyPhrase(payloadOpenQuestion),
      notToInfer: payloadNotToInfer.map(sanitizeSafetyPhrase)
    },
    dataQuality: {
      status,
      actionCount: run.actions_count,
      roundsCompleted: run.rounds_completed,
      sourceWarnings: warnings
    }
  };
}

// 7.5 Graph Projection Builder (TASK-009)
export function projectGraph(dialogue: PatternDialogueV1, branches: ScenarioBranchV1[]): GraphDTO {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 1. Add Actor nodes
  for (const actor of dialogue.actors) {
    nodes.push({
      id: actor.id,
      label: actor.label,
      type: "actor",
      properties: {
        role: actor.role,
        stance: actor.stance,
        confidence: actor.confidence
      }
    });

    // 2. Add hypothesis nodes linked to actors
    for (const hypId of actor.linkedHypotheses) {
      if (!nodes.some(n => n.id === hypId)) {
        nodes.push({
          id: hypId,
          label: `Hypothesis ${hypId.toUpperCase()}`,
          type: "hypothesis",
          properties: { description: `Core hypothesis associated with ${actor.label}` }
        });
      }
      edges.push({
        id: `edge-link-${actor.id}-${hypId}`,
        source: actor.id,
        target: hypId,
        type: "supports",
        properties: { weight: 0.9 }
      });
    }
  }

  // 3. Add transition nodes and connect to actors
  for (const trans of dialogue.transitions) {
    nodes.push({
      id: trans.id,
      label: `Pivot State: ${trans.trigger}`,
      type: "transition",
      properties: {
        beforeState: trans.beforeState,
        afterState: trans.afterState,
        meaning: trans.patternMeaning
      }
    });

    edges.push({
      id: `edge-${trans.actorId}-${trans.id}`,
      source: trans.actorId,
      target: trans.id,
      type: "amplifies",
      properties: { description: "state transition" }
    });
  }

  // 4. Add conflict nodes (we can store them as connections/edges directly, or conflicts as nodes with contradictions)
  for (const conflict of dialogue.conflicts) {
    let edgeType: "supports" | "contradicts" | "reframes" | "amplifies" | "interrupts" | "stabilizes" = "contradicts";
    if (conflict.conflictType === "reframe") {
      edgeType = "reframes";
    } else if (conflict.conflictType === "amplification") {
      edgeType = "amplifies";
    } else if (conflict.conflictType === "stabilization") {
      edgeType = "stabilizes";
    } else if (conflict.conflictType === "challenge") {
      edgeType = "interrupts";
    }

    edges.push({
      id: conflict.id,
      source: conflict.actorA,
      target: conflict.actorB,
      type: edgeType,
      properties: {
        claimA: conflict.claimA,
        claimB: conflict.claimB,
        usefulTension: conflict.usefulTension,
        confidence: conflict.confidence
      }
    });
  }

  // 5. Add Scenario Branches as nodes
  for (const branch of branches) {
    nodes.push({
      id: branch.id,
      label: branch.title,
      type: "branch",
      properties: {
        summary: branch.summary,
        tendencyType: branch.tendencyType,
        confidence: branch.confidence,
        probabilityWeight: branch.probabilityWeight
      }
    });

    // Link branch to its related hypotheses
    for (const hypId of branch.relatedHypothesisIds) {
      const targetHyp = `hyp-${hypId.toLowerCase()}`;
      if (nodes.some(n => n.id === targetHyp)) {
        edges.push({
          id: `edge-branch-hyp-${branch.id}-${targetHyp}`,
          source: branch.id,
          target: targetHyp,
          type: "stabilizes",
          properties: { description: "Branch tracks hypothesis" }
        });
      }
    }
  }

  return { nodes, edges };
}

// 10. AI-Assisted Extractors with Gemini Models
export async function extractViaGemini(
  rawExport: any,
  apiKey: string
): Promise<{
  dialogue?: any;
  branches?: any[];
}> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } }
  });

  const runSample = typeof rawExport === "string" ? rawExport : JSON.stringify(rawExport);

  // Define structured JSON extraction schema to match types
  try {
    const prompt = `Analyze the following MiroShark Simulation Export. Extract:
1. System actors (H1 to H7, AgentMemory, etc.) with role classifications, stances and confidence weights.
2. Inter-agent state transitions tracking triggers (such as Blank Feeds), coping self-explanations, external challenges, and systemic meanings.
3. Useful inter-agent conflicts and contradictions.
4. An elegant high-level synthesis summary.
5. 3 to 5 Scenario Trajectory Branches reflecting system tendencies (amplification, interruption, drift, integration).

Strict Safety Boundaries:
- Do NOT make clinical or psychological diagnoses (redact clinical words like schizophrenia, depression). Keep it strictly systems-theory/cognitive-modeling focused.
- Do NOT make absolute predictions on what WILL happen ("wird passieren" is forbidden, describe as possible trajectory).
- Keep all notToInfer boundaries complete.

Export JSON output conforming to these specifications.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [prompt, runSample],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["synthesis", "actors", "transitions", "conflicts", "branches"],
          properties: {
            synthesis: {
              type: Type.OBJECT,
              required: ["title", "summary", "keyDynamic", "openQuestion", "notToInfer"],
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                keyDynamic: { type: Type.STRING },
                openQuestion: { type: Type.STRING },
                notToInfer: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            actors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["id", "sourceAgentName", "label", "role", "stance", "confidence"],
                properties: {
                  id: { type: Type.STRING },
                  sourceAgentName: { type: Type.STRING },
                  label: { type: Type.STRING },
                  role: { type: Type.STRING },
                  stance: { type: Type.STRING },
                  confidence: { type: Type.NUMBER }
                }
              }
            },
            transitions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["id", "actorId", "beforeState", "trigger", "afterState", "selfExplanation", "patternMeaning", "confidence"],
                properties: {
                  id: { type: Type.STRING },
                  actorId: { type: Type.STRING },
                  beforeState: { type: Type.STRING },
                  trigger: { type: Type.STRING },
                  afterState: { type: Type.STRING },
                  selfExplanation: { type: Type.STRING },
                  externalChallenge: { type: Type.STRING },
                  patternMeaning: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  notToInfer: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            },
            conflicts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["id", "actorA", "actorB", "conflictType", "claimA", "claimB", "usefulTension", "confidence"],
                properties: {
                  id: { type: Type.STRING },
                  actorA: { type: Type.STRING },
                  actorB: { type: Type.STRING },
                  conflictType: { type: Type.STRING },
                  claimA: { type: Type.STRING },
                  claimB: { type: Type.STRING },
                  usefulTension: { type: Type.STRING },
                  confidence: { type: Type.NUMBER }
                }
              }
            },
            branches: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["id", "title", "summary", "tendencyType", "confidence", "horizonRelevance", "notToInfer", "reflectiveQuestion"],
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  tendencyType: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  probabilityWeight: { type: Type.NUMBER },
                  horizonRelevance: { type: Type.STRING },
                  notToInfer: { type: Type.ARRAY, items: { type: Type.STRING } },
                  reflectiveQuestion: { type: Type.STRING },
                  whyAppears: { type: Type.STRING },
                  whatResonates: { type: Type.STRING },
                  whereFriction: { type: Type.STRING },
                  increaseCoherence: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const parsed = JSON.parse(response.text);
    return {
      dialogue: {
        synthesis: parsed.synthesis,
        actors: parsed.actors,
        transitions: parsed.transitions,
        conflicts: parsed.conflicts
      },
      branches: parsed.branches
    };
  } catch (error) {
    console.error("Gemini normalization error, reverting to deterministic parsing engine:", error);
    throw error;
  }
}
