import { RoutingWeights } from './RoutingScorer';

export const DEFAULT_ROUTING_WEIGHTS: RoutingWeights = {
  priorityWeight: 100.0,
  gatewayProbabilityWeight: 50.0,
  contactHistoryWeight: 25.0,
  linkQualityWeight: 15.0,
  batteryWeight: 10.0,
  hopPenaltyWeight: 20.0,
  queuePenaltyWeight: 5.0
};
