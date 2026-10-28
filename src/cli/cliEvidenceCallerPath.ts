import {
  withEvidenceCallerInputPath,
  type Evidence,
} from "../domain/evidence.js";
import type { AnalysisError } from "../domain/analysisErrorBase.js";
import type { Result } from "../domain/result.js";
import { finishAnalysisCommand } from "./finishAnalysisCommand.js";

/** Bind the CLI selection before final cleanup or publication can retain it. */
export const bindCliEvidenceCallerPath =
  (
    callerPath: string,
    run: () => Promise<Result<Evidence, AnalysisError>>,
  ): (() => Promise<Result<Evidence, AnalysisError>>) =>
  async () => {
    const result = await run();
    return result.ok
      ? {
          ok: true,
          value: withEvidenceCallerInputPath(result.value, callerPath),
        }
      : result;
  };

/** Finalize a one-shot file inspection with its original CLI selection. */
export const finishCliEvidenceCommand = (
  callerPath: string,
  run: () => Promise<Result<Evidence, AnalysisError>>,
  service: { close(): Promise<void> },
  providerId: string,
  operation: string,
  signal: AbortSignal,
) =>
  finishAnalysisCommand(
    bindCliEvidenceCallerPath(callerPath, run),
    service,
    providerId,
    operation,
    signal,
  );
