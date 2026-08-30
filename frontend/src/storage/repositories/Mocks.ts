export class SQLiteSecurityEventRepository { async log() {} }
export class SQLiteProtocolEventRepository { async log() {} }
export class SQLiteSyncQueueRepository { 
  async enqueue() {} 
  async remove() {}
  async getByStatus() { return []; }
  async getPending() { return []; }
  async markStatus() {}
  async getWaiting() { return []; }
  async updateStatus() {}
}
export class SQLiteContactRepository { async create() {} }
export class SQLiteSessionRepository { 
  async getActiveSessions() { return []; }
  async updateState() {}
  async create() {}
}
export class SQLiteTransferRepository { 
  async create() {}
  async getPending() { return []; }
  async markState() {}
}
export class SQLiteBundleAckRepository { 
  async create() {}
  async hasAck() { return false; }
  async getByBundle() { return []; }
}
export class SQLiteBundleHopRepository { 
  async addHop() {}
  async getHops() { return []; }
}
