require("dotenv").config();
const http = require("http");
const cron = require("node-cron");
const { Server } = require("socket.io");
const app = require("./app");
const { runDeadlineReminderJob } = require("./services/deadlineReminderEmails");
const { logConfiguredSender } = require("./lib/mailer");
const { initRealtime } = require("./lib/realtime");

const PORT = Number(process.env.PORT) || 3000;

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});
initRealtime(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket (Socket.IO) enabled on the same port`);
  logConfiguredSender();
});

if (process.env.DISABLE_DEADLINE_CRON !== "true") {
  const pattern = process.env.DEADLINE_CRON || "0 8 * * *";
  const tz = process.env.DEADLINE_CRON_TZ || "Asia/Jakarta";
  cron.schedule(
    pattern,
    () => {
      runDeadlineReminderJob().catch((e) => console.error("[deadline-reminders]", e));
    },
    { timezone: tz },
  );
  console.log(`Deadline reminder cron scheduled: ${pattern} (${tz})`);
}
