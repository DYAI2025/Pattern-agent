/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GraphNode, GraphEdge, GraphDTO } from "../types.js";
import { Network, ZoomIn, ZoomOut, RefreshCw, Layers, X, Eye, Terminal, Info, Database } from "lucide-react";

interface GraphVisualizerProps {
  graph: GraphDTO;
  onSelectNode?: (node: GraphNode) => void;
}

export default function GraphVisualizer({ graph, onSelectNode }: GraphVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 350 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const formatPropertyName = (key: string) => {
    // Convert camelCase or snake_case to human readable capitalized spaced words
    const spaced = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).trim();
  };

  const renderPropertyValue = (key: string, value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-slate-600 italic text-[11px]">None</span>;
    }

    if (typeof value === "boolean") {
      return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
          value ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/40" : "bg-rose-950/40 text-rose-400 border border-rose-900/40"
        }`}>
          {value ? "TRUE" : "FALSE"}
        </span>
      );
    }

    if (typeof value === "number") {
      const isPercentage = key.toLowerCase().includes("confidence") || key.toLowerCase().includes("weight") || key.toLowerCase().includes("delta");
      if (isPercentage && value >= 0 && value <= 1) {
        const percentageValue = Math.round(value * 100);
        const barsCount = Math.round(value * 10);
        const filledBar = "█".repeat(barsCount);
        const emptyBar = "░".repeat(10 - barsCount);
        return (
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-slate-400">Score Range:</span>
              <span className="text-indigo-400 font-bold">{percentageValue}%</span>
            </div>
            <div className="font-mono text-[11px] tracking-tight select-none">
              <span className="text-indigo-500">{filledBar}</span>
              <span className="text-slate-800">{emptyBar}</span>
            </div>
          </div>
        );
      }
      return <span className="font-mono text-xs font-semibold text-slate-300">{value}</span>;
    }

    if (typeof value === "string") {
      if (value.length > 50) {
        return (
          <p className="text-xs text-slate-300 leading-relaxed italic bg-slate-950/60 p-2 rounded border border-slate-900/60 font-sans block w-full whitespace-pre-wrap">
            &ldquo;{value}&rdquo;
          </p>
        );
      }
      return <span className="text-xs text-slate-200 leading-relaxed font-sans">{value}</span>;
    }

    if (typeof value === "object") {
      return (
        <pre className="text-[10px] font-mono text-slate-300 bg-slate-950 p-2 rounded overflow-x-auto border border-slate-900 w-full max-w-full">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }

    return <span className="text-xs text-slate-200 font-sans">{String(value)}</span>;
  };

  // Resize handler
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: Math.max(400, entry.contentRect.width),
          height: Math.max(300, entry.contentRect.height || 350)
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute neat layered coordinates based on node type
  // Horizontal layout: Actors (Left) -> Hypotheses (Mid-Left) -> Transitions (Center) -> Branches (Right)
  const positionedNodes = useMemo(() => {
    const { width, height } = dimensions;
    const paddingX = 60;
    const paddingY = 40;

    // Separate nodes by type
    const actorsList = graph.nodes.filter(n => n.type === "actor");
    const hypothesesList = graph.nodes.filter(n => n.type === "hypothesis");
    const transitionsList = graph.nodes.filter(n => n.type === "transition");
    const branchesList = graph.nodes.filter(n => n.type === "branch");

    const columns: Record<string, GraphNode[]> = {
      actor: actorsList,
      hypothesis: hypothesesList,
      transition: transitionsList,
      branch: branchesList
    };

    const typeToColIndex: Record<string, number> = {
      actor: 0,
      hypothesis: 1,
      transition: 2,
      branch: 3
    };

    const totalCols = 4;
    const colWidth = (width - paddingX * 2) / (totalCols - 1);

    const positions: Record<string, { x: number; y: number }> = {};

    graph.nodes.forEach((node) => {
      const colIndex = typeToColIndex[node.type] !== undefined ? typeToColIndex[node.type] : 2;
      const colNodes = columns[node.type] || [node];
      const nodeIndex = colNodes.findIndex(n => n.id === node.id);

      const x = paddingX + colIndex * colWidth;
      
      // Vertical spreading
      let y = height / 2;
      if (colNodes.length > 1) {
        const spacingY = (height - paddingY * 2) / (colNodes.length - 1);
        y = paddingY + nodeIndex * spacingY;
      }

      positions[node.id] = { x, y };
    });

    return positions;
  }, [graph, dimensions]);

  const getNodeColor = (type: string) => {
    switch (type) {
      case "actor": return { bg: "#3b82f6", border: "#60a5fa", text: "#93c5fd" }; // Blue
      case "hypothesis": return { bg: "#8b5cf6", border: "#a78bfa", text: "#c084fc" }; // Purple
      case "transition": return { bg: "#f59e0b", border: "#fbbf24", text: "#fde047" }; // Amber
      case "branch": return { bg: "#10b981", border: "#34d399", text: "#6ee7b7" }; // Emerald
      default: return { bg: "#64748b", border: "#94a3b8", text: "#cbd5e1" };
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f172a]/80 border border-slate-800 rounded-xl p-4 overflow-hidden shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-indigo-400" />
          <h3 className="font-display font-semibold text-sm text-slate-200 uppercase tracking-wider">System Projection Graph</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Interactive Flow
          </span>
        </div>
      </div>

      {/* Main Content Pane: Graph Canvas + Inspector Sidebar */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden">
        {/* Left Pane: Network Graph Canvas */}
        <div ref={containerRef} className="relative flex-1 min-h-[250px] bg-[#0a0f1d] rounded-lg border border-slate-900 overflow-hidden">
          <svg
            width={dimensions.width}
            height={dimensions.height}
            className="absolute inset-0 select-none"
          >
            {/* SVG Arrow Marker definitions */}
            <defs>
              <marker id="arrow-supports" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
              </marker>
              <marker id="arrow-contradicts" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
              </marker>
              <marker id="arrow-reframe" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#fbbf24" />
              </marker>
              <marker id="arrow-amplifies" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#a78bfa" />
              </marker>
              <marker id="arrow-stabilizes" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#34d399" />
              </marker>
            </defs>

            {/* Grid Background */}
            <g opacity="0.04">
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </g>

            {/* Draw Edges */}
            {graph.edges.map((edge) => {
              const fromPos = positionedNodes[edge.source];
              const toPos = positionedNodes[edge.target];
              if (!fromPos || !toPos) return null;

              const isHovered = hoveredEdge === edge.id || hoveredNode === edge.source || hoveredNode === edge.target;
              const markerId = `arrow-${edge.type}`;

              // Style based on type
              let strokeColor = "#334155";
              if (edge.type === "supports") strokeColor = "#3b82f6";
              else if (edge.type === "contradicts") strokeColor = "#ef4444";
              else if (edge.type === "reframes") strokeColor = "#fbbf24";
              else if (edge.type === "amplifies") strokeColor = "#a78bfa";
              else if (edge.type === "stabilizes") strokeColor = "#34d399";

              return (
                <g
                  key={edge.id}
                  onMouseEnter={() => setHoveredEdge(edge.id)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  className="cursor-pointer transition-all duration-300"
                >
                  {/* Wide invisible path for easier hovering */}
                  <path
                    d={`M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="10"
                  />
                  
                  {/* Actual Edge */}
                  <path
                    d={`M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isHovered ? 2.5 : 1}
                    opacity={isHovered ? 0.9 : 0.4}
                    strokeDasharray={edge.type === "reframes" || edge.type === "contradicts" ? "4,4" : undefined}
                    markerEnd={`url(#${markerId})`}
                  />

                  {/* Edge Type Tag on Hover */}
                  {isHovered && (
                    <g transform={`translate(${(fromPos.x + toPos.x) / 2}, ${(fromPos.y + toPos.y) / 2})`}>
                      <rect
                        x="-40"
                        y="-11"
                        width="80"
                        height="18"
                        rx="4"
                        fill="#0f172a"
                        stroke={strokeColor}
                        strokeWidth="1"
                        opacity="0.95"
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#e2e8f0"
                        fontSize="9"
                        fontFamily="var(--font-mono)"
                        fontWeight="500"
                      >
                        {edge.type.toUpperCase()}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Draw Nodes */}
            {graph.nodes.map((node) => {
              const pos = positionedNodes[node.id];
              if (!pos) return null;

              const isHovered = hoveredNode === node.id;
              const isSelected = selectedNodeId === node.id;
              const colors = getNodeColor(node.type);

              const radius = node.type === "actor" ? 12 : node.type === "branch" ? 10 : 8;

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => {
                    setSelectedNodeId(isSelected ? null : node.id);
                    if (onSelectNode) onSelectNode(node);
                  }}
                  className="cursor-pointer"
                >
                  {/* Hover Aura */}
                  <circle
                    r={radius + 6}
                    fill={colors.bg}
                    opacity={isHovered ? 0.25 : 0}
                    className="transition-all duration-350"
                  />

                  {/* Main Node Body */}
                  <circle
                    r={radius}
                    fill={colors.bg}
                    stroke={colors.border}
                    strokeWidth={isSelected ? 3 : 1.5}
                  />

                  {/* Node Label Text */}
                  <text
                    y={node.type === "actor" || node.type === "branch" ? -20 : 18}
                    textAnchor="middle"
                    fill={isSelected ? "#ffffff" : isHovered ? colors.text : "#94a3b8"}
                    fontSize="10"
                    fontFamily={node.type === "hypothesis" ? "var(--font-mono)" : "var(--font-sans)"}
                    fontWeight={node.type === "actor" || isSelected ? "600" : "500"}
                    className="transition-colors duration-250 drop-shadow-md"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Column Labels */}
          <div className="absolute top-2 inset-x-0 flex justify-between px-14 pointer-events-none select-none">
            <span className="text-[10px] font-mono font-medium text-blue-500 uppercase tracking-widest bg-blue-950/40 px-2 py-0.5 rounded border border-blue-900/30">Actors</span>
            <span className="text-[10px] font-mono font-medium text-purple-400 uppercase tracking-widest bg-purple-950/40 px-2 py-0.5 rounded border border-purple-900/30">Hypotheses</span>
            <span className="text-[10px] font-mono font-medium text-amber-500 uppercase tracking-widest bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/30">Pivots</span>
            <span className="text-[10px] font-mono font-medium text-emerald-400 uppercase tracking-widest bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/30">Branches</span>
          </div>
        </div>

        {/* Right Pane: Animated Node Inspector Sidebar */}
        <AnimatePresence>
          {selectedNodeId && (() => {
            const node = graph.nodes.find(n => n.id === selectedNodeId);
            if (!node) return null;
            const propertiesArr = Object.entries(node.properties || {});
            return (
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="w-full md:w-80 shrink-0 bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 overflow-y-auto flex flex-col gap-3.5 max-h-full select-text shadow-2xl relative"
              >
                {/* Close Button */}
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="absolute top-3.5 right-3.5 text-slate-400 hover:text-white hover:bg-slate-800/80 p-1 rounded-full transition-all cursor-pointer"
                  title="Close Inspector"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Sidebar Header */}
                <div className="flex items-center gap-1.5 shrink-0 border-b border-slate-800 pb-2.5">
                  <Eye className="w-4 h-4 text-indigo-400" />
                  <h4 className="font-display font-semibold text-xs text-slate-200 uppercase tracking-widest">Node Inspector</h4>
                </div>

                {/* Node Metadata Header */}
                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-900 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
                      node.type === "actor" ? "bg-blue-950/40 text-blue-400 border-blue-900/40" :
                      node.type === "hypothesis" ? "bg-purple-950/40 text-purple-400 border-purple-900/40" :
                      node.type === "transition" ? "bg-amber-950/40 text-amber-400 border-amber-900/40" :
                      node.type === "branch" ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40" :
                      "bg-slate-900 text-slate-400 border border-slate-800"
                    }`}>
                      {node.type}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 font-medium">ID: {node.id}</span>
                  </div>
                  <h3 className="font-display font-bold text-sm text-white mt-1 leading-snug">{node.label}</h3>
                </div>

                {/* Properties list */}
                <div className="flex flex-col gap-3">
                  <span className="text-[9px] font-mono uppercase text-slate-400 tracking-wider font-semibold">Properties Map ({propertiesArr.length})</span>
                  
                  {propertiesArr.length === 0 ? (
                    <div className="text-center py-4 bg-slate-950/30 border border-slate-900 rounded-lg">
                      <span className="text-[10px] font-mono text-slate-600 block">NO PROPERTIES LOADED</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {propertiesArr.map(([key, val]) => (
                        <div key={key} className="bg-slate-950/40 border border-slate-900/60 hover:border-slate-800 p-2.5 rounded-lg flex flex-col gap-1.5 transition-colors">
                          <span className="text-[10px] font-mono font-medium text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-0.5 w-max">
                            {formatPropertyName(key)}
                          </span>
                          <div className="w-full text-left">
                            {renderPropertyValue(key, val)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Raw JSON expander */}
                <div className="mt-2 border-t border-slate-800 pt-3 flex flex-col gap-2 shrink-0">
                  <details className="group">
                    <summary className="flex items-center justify-between text-[10px] font-mono text-slate-500 hover:text-slate-300 cursor-pointer list-none select-none">
                      <span className="flex items-center gap-1">
                        <Terminal className="w-3" />
                        RAW JSON PAYLOAD
                      </span>
                      <span className="transition-transform group-open:rotate-180 block">&darr;</span>
                    </summary>
                    <div className="mt-2 text-[10px] font-mono bg-slate-950 border border-slate-900 text-indigo-300 p-2 rounded overflow-x-auto max-h-[140px] leading-relaxed">
                      <pre>{JSON.stringify(node, null, 2)}</pre>
                    </div>
                  </details>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>
    </div>
  );
}
