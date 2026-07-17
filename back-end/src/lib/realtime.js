const {
  verifySocketToken,
  isFinancePortalRole,
  isBuyerPortalRole,
} = require("./socketAuth");

/** @type {import('socket.io').Server | null} */
let io = null;

/** recordId -> { userId, userName, avatarPreset, socketId } */
const invoiceEditingByRecord = new Map();
/** recordId -> { userId, userName, avatarPreset, socketId } */
const buyerEditingByRecord = new Map();

function mapToPresenceSnapshot(map) {
  const out = {};
  for (const [recordId, entry] of map) {
    out[recordId] = {
      userId: entry.userId,
      userName: entry.userName,
      avatarPreset: entry.avatarPreset ?? null,
    };
  }
  return out;
}

function broadcastInvoicePresence() {
  if (!io) return;
  io.to("portal").emit("invoice-editing:sync", mapToPresenceSnapshot(invoiceEditingByRecord));
}

function broadcastBuyerPresence() {
  if (!io) return;
  io.to("portal").emit("buyer-editing:sync", mapToPresenceSnapshot(buyerEditingByRecord));
}

function clearSocketFromMap(map, socketId, broadcast) {
  let changed = false;
  for (const [recordId, entry] of map) {
    if (entry.socketId === socketId) {
      map.delete(recordId);
      changed = true;
    }
  }
  if (changed) broadcast();
}

/**
 * @param {import('socket.io').Server} serverIo
 */
function initRealtime(serverIo) {
  io = serverIo;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const verified = verifySocketToken(token);
    if (verified) {
      socket.data.userId = verified.userId;
      socket.data.role = verified.role;
    } else {
      socket.data.userId = `anon-${socket.id}`;
      socket.data.role = null;
    }
    next();
  });

  io.on("connection", (socket) => {
    socket.join("portal");
    const role = socket.data.role;
    if (isBuyerPortalRole(role)) socket.join("portal:buyers");
    if (isFinancePortalRole(role)) socket.join("portal:finance");

    socket.emit("invoice-editing:sync", mapToPresenceSnapshot(invoiceEditingByRecord));
    socket.emit("buyer-editing:sync", mapToPresenceSnapshot(buyerEditingByRecord));

    socket.on("invoice-editing:start", (payload) => {
      if (!isFinancePortalRole(socket.data.role)) return;
      const recordId = String(payload?.recordId ?? "").trim();
      const userName = String(payload?.userName ?? "Finance").trim() || "Finance";
      const avatarPreset = payload?.avatarPreset == null ? null : String(payload.avatarPreset).trim() || null;
      if (!recordId) return;
      const existing = invoiceEditingByRecord.get(recordId);
      if (existing && existing.userId !== socket.data.userId) return;
      invoiceEditingByRecord.set(recordId, {
        userId: socket.data.userId,
        userName,
        avatarPreset,
        socketId: socket.id,
      });
      broadcastInvoicePresence();
    });

    socket.on("invoice-editing:stop", (payload) => {
      const recordId = String(payload?.recordId ?? "").trim();
      if (!recordId) return;
      const entry = invoiceEditingByRecord.get(recordId);
      if (entry && entry.socketId === socket.id) {
        invoiceEditingByRecord.delete(recordId);
        broadcastInvoicePresence();
      }
    });

    socket.on("buyer-editing:start", (payload) => {
      if (!isBuyerPortalRole(socket.data.role)) return;
      const recordId = String(payload?.recordId ?? "").trim();
      const userName = String(payload?.userName ?? "Buyer").trim() || "Buyer";
      const avatarPreset = payload?.avatarPreset == null ? null : String(payload.avatarPreset).trim() || null;
      if (!recordId) return;
      const existing = buyerEditingByRecord.get(recordId);
      if (existing && existing.userId !== socket.data.userId) return;
      buyerEditingByRecord.set(recordId, {
        userId: socket.data.userId,
        userName,
        avatarPreset,
        socketId: socket.id,
      });
      broadcastBuyerPresence();
    });

    socket.on("buyer-editing:stop", (payload) => {
      const recordId = String(payload?.recordId ?? "").trim();
      if (!recordId) return;
      const entry = buyerEditingByRecord.get(recordId);
      if (entry && entry.socketId === socket.id) {
        buyerEditingByRecord.delete(recordId);
        broadcastBuyerPresence();
      }
    });

    socket.on("disconnect", () => {
      clearSocketFromMap(invoiceEditingByRecord, socket.id, broadcastInvoicePresence);
      clearSocketFromMap(buyerEditingByRecord, socket.id, broadcastBuyerPresence);
    });
  });
}

function emitRecordCreated(record) {
  if (!io) return;
  io.to("portal").emit("record:created", record);
}

function emitRecordUpdated(record) {
  if (!io) return;
  io.to("portal").emit("record:updated", record);
}

module.exports = {
  initRealtime,
  emitRecordCreated,
  emitRecordUpdated,
};
