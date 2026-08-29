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
   * Signs data using the private key associated with the alias.
   */
  sign(alias: string, data: string): Promise<{ signature: string }>;

  /**
   * Verifies data using a public key and signature.
   */
  verify(publicKey: string, data: string, signature: string): Promise<boolean>;
}

// Stub implementation for now. In a real RN app, this would use NativeModules.
export const KeystoreModule: KeystoreModuleInterface = {
  async generateKeyPair(alias: string) {
    return { publicKey: 'stub_public_key' };
  },
  async getPublicKey(alias: string) {
    return { publicKey: 'stub_public_key' };
  },
  async sign(alias: string, data: string) {
    // Normally this signs using Android Keystore. Here we return a dummy.
    return { signature: 'stub_signature_for_' + alias };
  },
  async verify(publicKey: string, data: string, signature: string) {
    // Here we can use a JS library or native bridge. Stubbed to return true for valid cases.
    return signature.startsWith('stub_signature');
  }
};
