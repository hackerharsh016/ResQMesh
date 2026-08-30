import { RoutingScorer, RoutingScoreContext, RoutingWeights } from '../../src/routing/RoutingScorer';
import { DEFAULT_ROUTING_WEIGHTS } from '../../src/routing/weights';
import { Priority } from '../../src/protocol/types/bundle';
import { BatteryClass } from '../../src/protocol/types/node';

describe('RoutingScorer', () => {
  let scorer: RoutingScorer;
  let weights: RoutingWeights;
  let baseContext: RoutingScoreContext;

  beforeEach(() => {
    scorer = new RoutingScorer();
    weights = { ...DEFAULT_ROUTING_WEIGHTS };
    baseContext = {
      peer: {
        nodeId: 'peer-1',
        publicKey: 'pk-1',
        protocolVersion: '1.0',
        transports: [],
        isGateway: false,
        batteryClass: BatteryClass.NORMAL,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        encounterCount: 1,
        successfulTransfers: 0,
        failedTransfers: 0,
        averageContactDurationMs: 0,
        lastSignalStrength: -70
      },
      bundle: {
        routing: {
          priority: Priority.MEDIUM,
          hopCount: 0,
          maxHopCount: 10,
          replicationBudget: 5,
        }
      } as any,
      queuePosition: 0
    };
  });

  it('should compute base score', () => {
    const score = scorer.computeScore(baseContext, weights);
    expect(score).toBeGreaterThan(0);
  });

  it('should increase score for higher priority', () => {
    const base = scorer.computeScore(baseContext, weights);

    baseContext.bundle.routing.priority = Priority.CRITICAL;
    const critical = scorer.computeScore(baseContext, weights);

    baseContext.bundle.routing.priority = Priority.LOW;
    const low = scorer.computeScore(baseContext, weights);

    expect(critical).toBeGreaterThan(base);
    expect(base).toBeGreaterThan(low);
  });

  it('should increase score for gateway peers', () => {
    const base = scorer.computeScore(baseContext, weights);
    
    baseContext.peer.isGateway = true;
    const gateway = scorer.computeScore(baseContext, weights);

    expect(gateway).toBeGreaterThan(base);
  });

  it('should decrease score for high hop counts', () => {
    const base = scorer.computeScore(baseContext, weights);

    baseContext.bundle.routing.hopCount = 9;
    const highHop = scorer.computeScore(baseContext, weights);

    expect(base).toBeGreaterThan(highHop);
  });

  it('should increase score for good contact history', () => {
    const base = scorer.computeScore(baseContext, weights);

    baseContext.peer.encounterCount = 10;
    baseContext.peer.successfulTransfers = 10;
    const goodContact = scorer.computeScore(baseContext, weights);

    expect(goodContact).toBeGreaterThan(base);
  });
});
