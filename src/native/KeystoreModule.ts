/**
 * TS-side typed wrapper around the Turbo Native Module for Android Keystore.
 */

export interface KeystoreModuleInterface {
  /**
   * Generates a new hardware-backed keypair in the Android Keystore.
   * @param alias The alias to store the key under.
   * @returns The Base64 encoded public key.
   */
  generateKeyPair(alias: string): Promise<{ publicKey: string }>;
  
  /**
   * Retrieves the public key for a given alias.
   * @param alias The alias of the key.
   * @returns The Base64 encoded public key.
   */
  getPublicKey(alias: string): Promise<{ publicKey: string }>;

  /**
   * Stubs the signing method (to be implemented fully in Security module).
   */
  sign(alias: string, data: string): Promise<{ signature: string }>;
}

// Stub implementation for now. In a real RN app, this would use NativeModules.
export const KeystoreModule: KeystoreModuleInterface = {
  async generateKeyPair(alias: string) {
    // TODO: implement actual native bridge call
    return { publicKey: 'stub_public_key' };
  },
  async getPublicKey(alias: string) {
    return { publicKey: 'stub_public_key' };
  },
  async sign(alias: string, data: string) {
    return { signature: 'stub_signature' };
  }
};
