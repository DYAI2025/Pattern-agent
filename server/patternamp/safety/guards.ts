/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreateRunRequest } from "../../../src/types.js";
import { sanitizeSafetyPhrase } from "../normalize/normalizer.js";

export interface GuardedLimits {
  maxRounds: number;
  maxTokensPerCall: number;
  enabledPlatforms: string[];
  disabledPlatforms: string[];
  runTimeoutSeconds: number;
  idleNoActionTimeoutSeconds: number;
  stopOnCreditError: boolean;
  savePartialOutput: boolean;
}

// 8. Default Run Guard config parameters for cost control
export const DEFAULT_GUARD_CONFIG: GuardedLimits = {
  maxRounds: 8,
  maxTokensPerCall: 2048,
  enabledPlatforms: ["twitter", "reddit"],
  disabledPlatforms: ["polymarket"],
  runTimeoutSeconds: 900,
  idleNoActionTimeoutSeconds: 180,
  stopOnCreditError: true,
  savePartialOutput: true
};

export const HARD_LIMIT_CEILINGS = {
  maxRounds: 12,
  maxTokensPerCall: 3072
};

/**
 * Validates, sanitizes, and clamps client parameters against strict cost-control gates. (REQ-O-001)
 */
export function clampMiroSharkRunParameters(req: CreateRunRequest): {
  clamped: CreateRunRequest;
  limits: GuardedLimits;
  warnings: string[];
} {
  const warnings: string[] = [];
  const clientLimits = req.limits || {};

  // Clamp maxRounds
  let maxRounds = clientLimits.maxRounds !== undefined ? clientLimits.maxRounds : DEFAULT_GUARD_CONFIG.maxRounds;
  if (maxRounds > HARD_LIMIT_CEILINGS.maxRounds) {
    maxRounds = HARD_LIMIT_CEILINGS.maxRounds;
    warnings.push(`maxRounds was clamped from ${clientLimits.maxRounds} to hard limit ceiling ${HARD_LIMIT_CEILINGS.maxRounds}`);
  }

  // Clamp maxTokens
  let maxTokens = clientLimits.maxTokens !== undefined ? clientLimits.maxTokens : DEFAULT_GUARD_CONFIG.maxTokensPerCall;
  if (maxTokens > HARD_LIMIT_CEILINGS.maxTokensPerCall) {
    maxTokens = HARD_LIMIT_CEILINGS.maxTokensPerCall;
    warnings.push(`maxTokens was clamped from ${clientLimits.maxTokens} to hard limit ceiling ${HARD_LIMIT_CEILINGS.maxTokensPerCall}`);
  }

  // Handle platform limitations (Polymarket is strictly disabled, twitter/reddit only by default)
  let requestedPlatforms = clientLimits.enabledPlatforms || DEFAULT_GUARD_CONFIG.enabledPlatforms;
  const filteredPlatforms = requestedPlatforms.filter(p => p.toLowerCase() !== "polymarket");
  
  if (requestedPlatforms.length !== filteredPlatforms.length) {
    warnings.push("Polymarket platform is strictly disabled due to safety and high-cost structures.");
  }

  // Assemble final limits
  const limits: GuardedLimits = {
    maxRounds,
    maxTokensPerCall: maxTokens,
    enabledPlatforms: filteredPlatforms.length > 0 ? filteredPlatforms : DEFAULT_GUARD_CONFIG.enabledPlatforms,
    disabledPlatforms: DEFAULT_GUARD_CONFIG.disabledPlatforms,
    runTimeoutSeconds: DEFAULT_GUARD_CONFIG.runTimeoutSeconds,
    idleNoActionTimeoutSeconds: DEFAULT_GUARD_CONFIG.idleNoActionTimeoutSeconds,
    stopOnCreditError: DEFAULT_GUARD_CONFIG.stopOnCreditError,
    savePartialOutput: DEFAULT_GUARD_CONFIG.savePartialOutput
  };

  // Build sanitized, clamped request payload representation
  const clamped: CreateRunRequest = {
    ...req,
    limits: {
      maxRounds: limits.maxRounds,
      maxTokens: limits.maxTokensPerCall,
      enabledPlatforms: limits.enabledPlatforms
    }
  };

  return {
    clamped,
    limits,
    warnings
  };
}

/**
 * Validates text inputs against safety constraints, ensuring no diagnostic labels are present. (REQ-S-001)
 */
export function validateSafetyGuards(text: string): { isValid: boolean; errorPhrases: string[] } {
  const forbiddenPatterns = [
    /diagnose/i,
    /dein schicksal/i,
    /wird passieren/i,
    /du bist krank/i,
    /garantiert/i,
    /clinical/i,
    /schizophren/i,
    /depressiv/i,
    /borderline/i
  ];

  const found: string[] = [];
  for (const pattern of forbiddenPatterns) {
    const match = text.match(pattern);
    if (match) {
      found.push(match[0]);
    }
  }

  return {
    isValid: found.length === 0,
    errorPhrases: found
  };
}
