import { NodeIdentity, PROTOCOL_VERSION, NodeCapabilities, BatteryClass } from '../protocol/types/node';
import { IdentityRepository } from './IdentityRepository';
import { LocalConfigRepository } from './LocalConfigRepository';
import { KeystoreModule } from '../native/KeystoreModule';
import { v4 as uuidv4 } from 'uuid';

export class IdentityGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityGenerationError';
  }
}

export class IdentityManager {
  private static instance: IdentityManager;
  private identity: NodeIdentity | null = null;
  private initializationPromise: Promise<void> | null = null;
  
  private identityRepo: IdentityRepository;
  private configRepo: LocalConfigRepository;
  
  private constructor(identityRepo: IdentityRepository, configRepo: LocalConfigRepository) {
    this.identityRepo = identityRepo;
    this.configRepo = configRepo;
  }

  public static getInstance(identityRepo: IdentityRepository, configRepo: LocalConfigRepository): IdentityManager {
    if (!IdentityManager.instance) {
      IdentityManager.instance = new IdentityManager(identityRepo, configRepo);
    }
    return IdentityManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initializeInternal();
    try {
      await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  private async _initializeInternal(): Promise<void> {
    try {
      let existingIdentity = await this.identityRepo.getIdentity();

      if (existingIdentity && (!existingIdentity.nodeId || !existingIdentity.publicKey || !existingIdentity.privateKeyRef)) {
        // Corrupt row, regenerate
        existingIdentity = null;
      }

      if (!existingIdentity) {
        // Generate new identity
        const nodeId = `EMP-${uuidv4()}`;
        const privateKeyRef = `emp_key_${nodeId}`;
        
        let publicKey: string;
        try {
          const result = await KeystoreModule.generateKeyPair(privateKeyRef);
          publicKey = result.publicKey;
        } catch (error) {
          throw new IdentityGenerationError('Failed to generate hardware-backed keypair in Keystore');
        }

        const now = Date.now();
        const newIdentity: NodeIdentity = {
          nodeId,
          publicKey,
          privateKeyRef,
          protocolVersion: PROTOCOL_VERSION,
          createdAt: now,
          updatedAt: now
        };

        await this.identityRepo.saveIdentity(newIdentity);
        this.identity = newIdentity;
      } else {
        this.identity = existingIdentity;
      }

      // Seed local config defaults
      await this.seedConfigDefaults();

    } catch (error) {
      if (error instanceof IdentityGenerationError) {
        throw error;
      }
      throw new Error(`Failed to initialize IdentityManager: ${error}`);
    }
  }

  private async seedConfigDefaults(): Promise<void> {
    const maxBundleSize = await this.configRepo.get('max_bundle_size');
    if (maxBundleSize === null) {
      await this.configRepo.set('max_bundle_size', '8192');
    }

    const maxHopCount = await this.configRepo.get('max_hop_count');
    if (maxHopCount === null) {
      await this.configRepo.set('max_hop_count', '20');
    }
  }

  public getIdentity(): NodeIdentity {
    if (!this.identity) {
      throw new Error('IdentityManager not initialized');
    }
    return this.identity;
  }

  public getCapabilities(): NodeCapabilities {
    return {
      transports: [], // Stub for now
      gateway: false,
      maxBundleSize: 8192, // Stub for now, can be read from config
      batteryClass: BatteryClass.NORMAL
    };
  }
}
