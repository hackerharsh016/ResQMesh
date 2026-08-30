import { EmergencyBundle, Priority } from '../protocol/types/bundle';
import { Peer } from '../protocol/types/peer';
import { BatteryClass } from '../protocol/types/node';

export interface RoutingWeights {
  priorityWeight: number;
  gatewayProbabilityWeight: number;
  contactHistoryWeight: number;
  linkQualityWeight: number;
  batteryWeight: number;
  hopPenaltyWeight: number;
  queuePenaltyWeight: number;
}

export interface RoutingScoreContext {
  peer: Peer;
  bundle: EmergencyBundle;
  queuePosition: number;
}

export class RoutingScorer {
  computeScore(context: RoutingScoreContext, weights: RoutingWeights): number {
    const { peer, bundle, queuePosition } = context;

    const normalizedPriority = this.normalizePriority(bundle.routing.priority);
    const isGateway = peer.isGateway ? 1 : 0;
    const contactFactor = this.contactHistoryFactor(peer);
    const linkQuality = this.normalizeSignalStrength(peer.lastSignalStrength);
    const battery = this.batteryFactor(peer.batteryClass);
    
    let hopRatio = 0;
    if (bundle.routing.maxHopCount > 0) {
      hopRatio = bundle.routing.hopCount / bundle.routing.maxHopCount;
    }

    // Normalize queue position: 0 is front of queue (best), higher means penalty.
    // Arbitrary ceiling at 100 for normalization to [0, 1].
    const queuePenalty = Math.min(queuePosition / 100, 1.0);

    const score = (weights.priorityWeight * normalizedPriority)
                + (weights.gatewayProbabilityWeight * isGateway)
                + (weights.contactHistoryWeight * contactFactor)
                + (weights.linkQualityWeight * linkQuality)
                + (weights.batteryWeight * battery)
                - (weights.hopPenaltyWeight * hopRatio)
                - (weights.queuePenaltyWeight * queuePenalty);

    return score;
  }

  private normalizePriority(priority: Priority): number {
    // Priority.CRITICAL = 0, LOW = 3
    switch (priority) {
      case Priority.CRITICAL:
        return 1.0;
      case Priority.HIGH:
        return 0.75;
      case Priority.MEDIUM:
        return 0.50;
      case Priority.LOW:
        return 0.25;
      default:
        return 0.0;
    }
  }

  private contactHistoryFactor(peer: Peer): number {
    const encounters = Math.max(peer.encounterCount, 1);
    const successRate = peer.successfulTransfers / encounters;
    const familiarity = Math.log10(1 + encounters); // diminishing returns
    
    return (successRate * 0.7) + (Math.min(familiarity, 1.0) * 0.3);
  }

  private normalizeSignalStrength(rssi?: number): number {
    if (rssi === undefined) return 0.5; // neutral
    // Typical RSSI range -100 (bad) to -30 (excellent)
    const maxRssi = -30;
    const minRssi = -100;
    if (rssi >= maxRssi) return 1.0;
    if (rssi <= minRssi) return 0.0;
    return (rssi - minRssi) / (maxRssi - minRssi);
  }

  private batteryFactor(batteryClass: BatteryClass): number {
    switch (batteryClass) {
      case BatteryClass.HIGH:
        return 1.0;
      case BatteryClass.NORMAL:
        return 0.5;
      case BatteryClass.LOW:
        return 0.0;
      default:
        return 0.5;
    }
  }
}
