// In-memory stats — resets on server restart (no database)
let totalVisits = 0;
const onlineUsers = new Map<string, number>(); // ip -> lastSeen ms

const ONLINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function getClientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return ip.trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function cleanOldUsers() {
  const cutoff = Date.now() - ONLINE_TIMEOUT_MS;
  for (const [ip, lastSeen] of onlineUsers.entries()) {
    if (lastSeen < cutoff) onlineUsers.delete(ip);
  }
}

export function recordVisit(req: Parameters<typeof getClientIp>[0]): void {
  totalVisits++;
  onlineUsers.set(getClientIp(req), Date.now());
}

export function ping(req: Parameters<typeof getClientIp>[0]): void {
  onlineUsers.set(getClientIp(req), Date.now());
}

export function getStats() {
  cleanOldUsers();
  return {
    totalVisits,
    onlineNow: onlineUsers.size,
  };
}

// Legacy — kept for compatibility
export function getUploadCount(): number { return totalVisits; }
export function incrementUploadCount(): number { totalVisits++; return totalVisits; }
