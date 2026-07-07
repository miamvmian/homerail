import type { DAGDispatcher } from "./dag-dispatcher.js";
import type { ParsedDAG } from "./graph.js";
import type { ActiveRun } from "../runtime/active-runs.js";
import {
  createActiveRun,
  dispatchReadyNodes,
  getActiveRun,
} from "../runtime/active-runs.js";
import { isRunTerminal } from "./dag-engine.js";

export class GraphExecutor {
  constructor(private dispatcher: DAGDispatcher) {}

  createRun(runId: string, parsedDAG: ParsedDAG, initialPrompt?: string): ActiveRun {
    return createActiveRun(runId, parsedDAG, { initialPrompt });
  }

  tick(runId: string): number {
    return dispatchReadyNodes(runId, this.dispatcher);
  }

  getRun(runId: string): ActiveRun | undefined {
    return getActiveRun(runId);
  }

  isTerminal(runId: string): boolean {
    const run = getActiveRun(runId);
    if (!run) return false;
    return isRunTerminal(run.dagRun);
  }
}
