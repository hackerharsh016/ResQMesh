import { DtnEngineInterface } from '../../dtn/DtnEngine';
import { GatewayService } from '../../gateway/GatewayService';
import { LocalConfigRepository } from '../../identity/LocalConfigRepository';

export interface MaintenanceScheduler {
  start(): void;
  stop(): void;
}

export class IntervalMaintenanceScheduler implements MaintenanceScheduler {
  private maintenanceTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private syncInFlight = false;

  constructor(
    private dtnEngine: DtnEngineInterface,
    private gatewayService: GatewayService,
    private configRepo: LocalConfigRepository
  ) {}

  start(): void {
    // Note: async setup for intervals could be delayed, but this starts them eagerly
    this.configRepo.getNumber('maintenance_interval_ms', 300000).then(interval => {
      this.maintenanceTimer = setInterval(() => {
        this.dtnEngine.runMaintenanceCycle().catch(console.error);
      }, interval);
    });

    this.configRepo.getNumber('sync_interval_ms', 60000).then(interval => {
      this.syncTimer = setInterval(async () => {
        if (this.syncInFlight) return;
        this.syncInFlight = true;
        try {
          await this.gatewayService.runSyncCycle();
        } catch (e) {
          console.error(e);
        } finally {
          this.syncInFlight = false;
        }
      }, interval);
    });
  }

  stop(): void {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.maintenanceTimer = null;
    this.syncTimer = null;
  }
}
