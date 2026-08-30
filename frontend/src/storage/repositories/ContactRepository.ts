import { db } from '../database';
import { Contact } from '../../protocol/types/peer';

export interface ContactRepository {
  create(contact: Contact): Promise<void>;
  update(contactId: string, patch: Partial<Contact>): Promise<void>;
  getByPeer(peerNodeId: string, limit?: number): Promise<Contact[]>;
}
