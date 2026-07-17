const jwt = require("jsonwebtoken");

function normalizeStableUserId(userId) {
  return String(userId ?? "").trim();
}

/**
 * @param {string | undefined} token
 * @returns {{ userId: string, role: string | null } | null}
 */
function verifySocketToken(token) {
  if (!token || typeof token !== "string") return null;
  if (!process.env.JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = normalizeStableUserId(payload?.uid ?? payload?.sub);
    if (!userId) return null;
    const role = payload?.role != null ? String(payload.role) : null;
    return { userId, role };
  } catch {
    return null;
  }
}

function isFinancePortalRole(role) {
  return role === "finance" || role === "finance_admin";
}

function isBuyerPortalRole(role) {
  return role === "buyers" || role === "buyers_admin";
}

function isPortalRole(role) {
  return isBuyerPortalRole(role) || isFinancePortalRole(role);
}

module.exports = {
  verifySocketToken,
  isFinancePortalRole,
  isBuyerPortalRole,
  isPortalRole,
};
