// ─── Vector Clock ─────────────────────────────────────────────────────────────
// Distributed causality tracking. Pure logic — no side effects.

import type { VectorClock } from '../types.js';

export type ClockComparison = 'before' | 'after' | 'concurrent' | 'equal';

export class VectorClockUtils {
  /** Compare two vector clocks. */
  static compare(a: VectorClock, b: VectorClock): ClockComparison {
    const allNodes = new Set([...Object.keys(a), ...Object.keys(b)]);

    let aBeforeB = false;
    let bBeforeA = false;

    for (const node of allNodes) {
      const aVal = a[node] || 0;
      const bVal = b[node] || 0;

      if (aVal < bVal) aBeforeB = true;
      if (aVal > bVal) bBeforeA = true;
    }

    if (!aBeforeB && !bBeforeA) return 'equal';
    if (aBeforeB && !bBeforeA) return 'before';
    if (bBeforeA && !aBeforeB) return 'after';
    return 'concurrent';
  }

  /** Merge two clocks — take max for each node. */
  static merge(a: VectorClock, b: VectorClock): VectorClock {
    const result: VectorClock = { ...a };
    for (const [node, value] of Object.entries(b)) {
      result[node] = Math.max(result[node] || 0, value);
    }
    return result;
  }

  /** Increment clock for a specific node. */
  static increment(clock: VectorClock, nodeId: string): VectorClock {
    return {
      ...clock,
      [nodeId]: (clock[nodeId] || 0) + 1,
    };
  }

  /** Check if clock a dominates clock b (a >= b for all entries). */
  static dominates(a: VectorClock, b: VectorClock): boolean {
    for (const [node, value] of Object.entries(b)) {
      if ((a[node] || 0) < value) return false;
    }
    return true;
  }

  static create(): VectorClock {
    return {};
  }

  static clone(clock: VectorClock): VectorClock {
    return { ...clock };
  }
}
