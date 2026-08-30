import { EmergencyPayload, SecurityMetadata } from '../protocol/types/bundle';

// PROVISIONAL: No frozen backend schema exists in the provided docs.
// This mirrors EmergencyBundle and should be revisited against a real backend schema doc when available.
export interface BundleUploadPayload {
  bundleId: string;
  originNodeId: string;
  incidentId?: string;
  payloadType: string;
  priority: string;
  createdAt: number;
  payload: EmergencyPayload;
  security: SecurityMetadata;
  protocolVersion: string;
}

export interface BackendClient {
  uploadBundle(payload: BundleUploadPayload): Promise<{ serverReceiptId: string }>;
}

export class SupabaseBackendClient implements BackendClient {
  constructor(private supabaseUrl: string, private supabaseKey: string) {}

  async uploadBundle(payload: BundleUploadPayload): Promise<{ serverReceiptId: string }> {
    // In real app, this uses fetch() or @supabase/supabase-js to insert the bundle.
    // Since we shouldn't hardcode credentials or assume the schema exactly, we use fetch.
    const res = await fetch(`${this.supabaseUrl}/rest/v1/bundles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      // Check for duplicate constraint violation (409 Conflict)
      // If it's a duplicate, treat as success idempotently
      if (res.status === 409) {
        return { serverReceiptId: `dup-${payload.bundleId}` };
      }
      throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return { serverReceiptId: data[0]?.id || `ok-${payload.bundleId}` };
  }
}
