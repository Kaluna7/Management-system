require("dotenv").config();
const cron = require("node-cron");
const app = require("./app");
const { runDeadlineReminderJob } = require("./services/deadlineReminderEmails");

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

if (process.env.DISABLE_DEADLINE_CRON !== "true") {
  const pattern = process.env.DEADLINE_CRON || "0 8 * * *";
  const tz = process.env.DEADLINE_CRON_TZ || "Asia/Jakarta";
  cron.schedule(
    pattern,
    () => {
      runDeadlineReminderJob().catch((e) => console.error("[deadline-reminders]", e));
    },
    { timezone: tz }
  );
  console.log(`Deadline reminder cron scheduled: ${pattern} (${tz})`);
}
