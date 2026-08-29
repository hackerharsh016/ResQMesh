import { EmergencyBundle } from './types/bundle';

/**
 * Pure function to increment the hop count of a bundle.
 * Returns a NEW bundle object. Throws if maxHopCount would be exceeded.
 */
export function applyHopIncrement(bundle: EmergencyBundle): EmergencyBundle {
  if (bundle.routing.hopCount + 1 > bundle.routing.maxHopCount) {
    throw new Error(`Cannot increment hop count beyond maxHopCount (${bundle.routing.maxHopCount})`);
  }

  // Return a shallow clone of the bundle, but deeply clone the routing object to avoid mutating in place.
  return {
    ...bundle,
    routing: {
      ...bundle.routing,
      hopCount: bundle.routing.hopCount + 1,
    },
  };
}

/**
 * Pure function to decrement the replication budget of a bundle.
 * Returns a NEW bundle object. Throws if replication budget would drop below zero.
 */
export function applyReplicationDecrement(bundle: EmergencyBundle): EmergencyBundle {
  if (bundle.routing.replicationBudget - 1 < 0) {
    throw new Error('Cannot decrement replication budget below 0');
  }

  return {
    ...bundle,
    routing: {
      ...bundle.routing,
      replicationBudget: bundle.routing.replicationBudget - 1,
    },
  };
}
