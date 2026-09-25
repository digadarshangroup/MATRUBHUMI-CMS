// server.js — Matrubhoomi HRMS API
//
// One Express app serving three audiences:
//
//   HR         /api/hr/*, /hr/*      employees, attendance, payroll, leave,
//                                    recruitment, documents, policies, reports
//   Executive  /api/ceo/*, /api/admin/*   the HR overview and Access Control
//   Sales      /api/sales/*          leads, assignments, forms, the field map
//   Employee   /api/employee/*       the self-service portal and mobile app
//   Field      /api/field/*          the Android sales app — a DIFFERENT
//                                    identity from /api/sales (employee token,
//                                    not a department session)
//
// Everything else — auth, the approval queue, the public onboarding tiles —
// hangs off /api/auth and /api/public.
//
// Adding a new origin (a LAN address, a tunnel, a preview deployment) means
// adding it to EXTRA_ALLOWED_ORIGINS below, or it fails with an opaque
// "Not allowed by CORS" and nothing in the logs points here.

const dns = require("dns").setServers(["8.8.8.8", "8.8.4.4"]);
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8081", // Expo web build of the employee app
  /**
   * Extra origins from the environment, comma-separated.
   *
   * Where a LAN address belongs — NOT in the literal above. A dev machine's IP
   * changes whenever it rejoins a network, and an origin baked into the source
   * is one somebody has to edit and redeploy.
   *
   *   EXTRA_ALLOWED_ORIGINS=http://192.168.1.91:3000,https://hrms.example.com
   *
   * Gates BOTH the CORS middleware and the Socket.IO handshake.
   */
  ...String(process.env.EXTRA_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
];

/**
 * ONE SWITCH THAT ACCEPTS ANY ORIGIN.
 *
 *   CORS_ALLOW_ALL=true
 *
 * For development and for the LAN testing this deployment does a lot of, where
 * the frontend's address is a laptop IP that changes whenever it rejoins a
 * network and maintaining a list of them is busywork.
 *
 * WHAT IT ACTUALLY COSTS, so the decision is made with open eyes: every route
 * here authenticates with `credentials: true`, so a permissive CORS means ANY
 * website a signed-in person visits can make requests to this API as them, and
 * read the answers. On a laptop on an office LAN that is a non-issue. On the
 * public internet it is a real hole.
 *
 * So it REFUSES TO ENGAGE when NODE_ENV is production. Turning it on there is
 * not a thing somebody should be able to do by copying a .env between machines
 * — which is exactly how that mistake usually travels.
 */
const allowAllOrigins =
  String(process.env.CORS_ALLOW_ALL || "").toLowerCase() === "true" &&
  process.env.NODE_ENV !== "production";

if (String(process.env.CORS_ALLOW_ALL || "").toLowerCase() === "true" && !allowAllOrigins) {
  console.warn(
    "⚠️  CORS_ALLOW_ALL is set but NODE_ENV is production — ignoring it. " +
      "List the real origins in EXTRA_ALLOWED_ORIGINS instead.",
  );
}
if (allowAllOrigins) {
  console.log("⚠️  CORS: every origin is being accepted (CORS_ALLOW_ALL=true, non-production)");
}

app.use(
  cors({
    origin: (origin, callback) => {
      // A native mobile build sends no Origin header at all and is waved
      // through here; a browser page is always checked against the list.
      //
      // Worth knowing while debugging the Android app: CORS never applies to
      // it. If the app cannot reach this server, the cause is the firewall, the
      // IP, or the port — never this function.
      if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

const server = http.createServer(app);

const io = new Server(server, {
  // Follows the same switch as the REST layer above. Left on the fixed list, a
  // permissive API would sit beside a socket that still refused the same page —
  // so the dashboard would load and then silently never update.
  cors: {
    origin: allowAllOrigins ? true : allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

/* ─── Who is on the other end of the socket ───────────────────────────────
 *
 * The socket used to ask nobody anything. A client could connect with no
 * cookie and no token, emit `join_employee` with ANY employee's id, and
 * receive that person's task assignments — and the two sales events were sent
 * with `io.emit`, which is every connected client, so customer names and who
 * visited them were broadcast to anyone who opened a socket.
 *
 * So: the token is read here if there is one, the ROOM IS DERIVED FROM IT
 * rather than from whatever the client asks for, and desk events go to a desk
 * room instead of to everyone.
 *
 * SOCKET_REQUIRE_AUTH=true refuses an unauthenticated handshake outright. It is
 * off by default on purpose — the Android field app is a separate repository and
 * may not be sending its token on the handshake yet, and refusing it here would
 * take away its live task notifications before it can be updated. With the room
 * derived from the token it already receives nothing it should not; the switch
 * is there for once every client is known to send one.
 */
const REQUIRE_SOCKET_AUTH = String(process.env.SOCKET_REQUIRE_AUTH || "") === "true";

function identifySocket(socket) {
  const { verifyToken } = require("./config/jwt");
  const handshake = socket.handshake || {};

  let token =
    handshake.auth?.token ||
    handshake.query?.token ||
    (typeof handshake.headers?.authorization === "string" &&
    handshake.headers.authorization.startsWith("Bearer ")
      ? handshake.headers.authorization.slice(7)
      : null);

  if (!token && handshake.headers?.cookie) {
    const match = handshake.headers.cookie.match(/(?:auth_token|employee_token)=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return null;

  try {
    const decoded = verifyToken(token);
    return {
      id: decoded.id ? String(decoded.id) : null,
      // An app token says so; a desk token carries a role instead.
      type: decoded.type || "desk",
      deptSlug: decoded.deptSlug || "",
      isAdmin: Boolean(decoded.isAdmin),
    };
  } catch {
    return null;
  }
}

io.use((socket, next) => {
  const user = identifySocket(socket);
  if (!user && REQUIRE_SOCKET_AUTH) {
    return next(new Error("Not authorised"));
  }
  socket.data.user = user;
  next();
});

io.on("connection", (socket) => {
  const user = socket.data.user;
  console.log(
    `✅ WebSocket client connected: ${socket.id}${user ? ` (${user.type})` : " (anonymous)"}`,
  );

  // A desk session listens to the desk's own events. Nobody else is put in
  // this room, so a field handset never hears the approval queue.
  if (user && user.type === "desk") socket.join("sales-desk");

  // THE ID IS NOT TAKEN FROM THE CLIENT. It is whoever the token says they
  // are; the argument is kept only so an older app still calls this and lands
  // in the right place.
  socket.on("join_employee", () => {
    if (!user?.id) return;
    socket.join(`employee-${user.id}`);
  });

  socket.on("disconnect", () => {
    console.log("❌ WebSocket client disconnected:", socket.id);
  });
});

// Routes reach the socket server through this rather than importing it.
app.set("io", io);

/* ─── Database ────────────────────────────────────────────────────────── */

const CEODepartment = require("./models/CEODepartment");

const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/matrubhoomi_hrms",
    );
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
};

/**
 * The one account seeded at boot, and only when none exists.
 *
 * Everything else — departments, HR logins, roles — is created from Access
 * Control by a signed-in administrator. This exists solely so there is a way
 * to reach that screen on a brand-new database.
 *
 * Deliberately no credentials in the log line. A boot log is copied into
 * aggregators, screenshots and terminal scrollback; a password printed once is
 * a password leaked permanently.
 */
async function ensureCeoExists() {
  try {
    const email = (process.env.CEO_SEED_EMAIL || "ceo@matrubhoomifarms.in").toLowerCase();
    const existing = await CEODepartment.findOne({ email });
    if (existing) return;

    await CEODepartment.create({
      name: "Chief Executive Officer",
      email,
      password: process.env.CEO_SEED_PASSWORD || "ChangeMe@2026",
      role: "ceo",
      department: "Executive",
      employeeId: "CEO001",
      isActive: true,
    });

    console.log(
      `[bootstrap] No CEO account existed — one was created for ${email}. ` +
        "Sign in, change the password, then create the rest from " +
        "Executive → Access Control.",
    );
  } catch (err) {
    console.error("[bootstrap] Could not ensure a CEO account:", err.message);
  }
}

connectDB().then(async () => {
  await ensureCeoExists();

  // Register the department/access tables on whatever database this instance
  // is pointed at, so moving from local to production needs no manual step.
  // Strictly additive: it inserts what is missing and modifies nothing that
  // already exists — no renames, no password changes, no reactivations.
  const { ensureAccessDepartments } = require("./services/ensureAccessDepartments");
  await ensureAccessDepartments(mongoose.connection);

  // The sales pipeline and its two starter forms. Same contract as above:
  // inserts what is missing, never touches what the desk has since edited.
  const { ensureSalesDefaults } = require("./services/ensureSalesDefaults");
  await ensureSalesDefaults();

  await ensureSomeoneCanAdminister();
});

/**
 * If NOBODY can administer, make the bootstrap CEO the administrator.
 *
 * Access Control sits behind `requirePlatformAdmin`, which is a boolean on the
 * PERSON re-read from the database on every request — not a role string, and
 * deliberately so. The seeder that mirrors department logins into `dept_users`
 * writes `isAdmin: false` for everyone, which is the right default: an
 * administrator should be a deliberate grant, never a side effect of having an
 * account.
 *
 * Which left a fresh database with no way in. The one screen that can grant
 * administrator rights is itself administrator-only, so the bootstrap CEO could
 * sign in, see the Access Control menu entry, and get 403 from it forever.
 *
 * The guard here is the narrow one — `isAdmin: true` existing ANYWHERE. So this
 * runs exactly once in a database's life, and can never re-grant rights that
 * somebody has deliberately revoked, because revoking the last administrator is
 * the only case it would fire again in, and that case is indistinguishable from
 * a fresh install by design.
 */
async function ensureSomeoneCanAdminister() {
  try {
    const DeptUser = require("./models/Access/DeptUser");

    const existingAdmin = await DeptUser.findOne({ isAdmin: true, isActive: true })
      .select("_id")
      .lean();
    if (existingAdmin) return;

    const email = (process.env.CEO_SEED_EMAIL || "ceo@matrubhoomifarms.in").toLowerCase();
    const res = await DeptUser.updateOne({ email }, { $set: { isAdmin: true } });
    if (res.matchedCount) {
      console.log(
        `[bootstrap] No administrator existed — ${email} was made one so Access ` +
          "Control can be reached. Grant the others from there.",
      );
    }
  } catch (err) {
    console.error("[bootstrap] Could not ensure an administrator:", err.message);
  }
}

/* ─── Authentication and access control ──────────────────────────────── */

// Mounted BEFORE the legacy `authRoutes` on the same prefix. Express matches in
// registration order, so /api/auth/login, /verify and /logout are served by the
// department router; anything it does not define falls through to the old one.
const deptAuthRoutes = require("./routes/auth/deptAuth");
app.use("/api/auth", deptAuthRoutes);

// Self-service "forgot password": request a 4-digit email OTP, verify it, then
// set a new password. Reuses deptAuth's own identity resolution, so it covers
// every account /login can authenticate.
const passwordResetRoutes = require("./routes/auth/passwordReset");
app.use("/api/auth", passwordResetRoutes);

const requirePlatformAdmin = require("./Middlewear/requirePlatformAdmin");
const accessAdminRoutes = require("./routes/Admin/accessAdmin");
app.use("/api/admin", requirePlatformAdmin, accessAdminRoutes);

// The approval queue: an editor's held changes, and the approver's decision on
// them. Mounted outside any one department's middleware because the queue spans
// departments; it authenticates the session itself.
app.use("/api/change-requests", require("./routes/Access/changeRequests"));

// Unauthenticated on purpose — backs the public /onboarding tile grid.
// Returns names and icons only; never emails, counts or user data.
app.use("/api/public", require("./routes/Admin/publicDepartments"));

// Also unauthenticated: the government scheme cards on the public marketing
// site. Published rows only, and an explicit field list — the desk's own view
// of the same rows is /api/website/schemes, behind the sales guard.
app.use("/api/public", require("./routes/Admin/publicSchemes"));

// Stored documents that are not images — leave certificates, overtime proof,
// the employee-app APK. They live PRIVATELY in Cloudinary and are streamed
// from here, because this account refuses public delivery of PDF and ZIP and
// refuses ".apk" uploads outright. See routes/files.js for the full reasoning.
// Unauthenticated by design: the HMAC in the path is the credential, exactly
// as the unguessable CDN URL it replaced was.
app.use("/api/files", require("./routes/files"));

// The CMS frontend's one upload endpoint. The browser used to POST straight to
// api.cloudinary.com with an unsigned preset — four helpers, three different
// endpoints, and a write credential shipped in the bundle. See routes/uploads.js.
app.use("/api/uploads", require("./routes/uploads"));

app.use("/api/auth", require("./routes/login"));

/* ─── HR ──────────────────────────────────────────────────────────────── */

app.use("/api/employees", require("./routes/HrRoutes/Employee-Section"));
app.use("/api/employees/import-export", require("./routes/HrRoutes/employeeImportExport.js"));
app.use("/api/hr", require("./routes/HrRoutes/HrProfile-Section"));
app.use("/api/hr/overview", require("./routes/HrRoutes/Overview-Section"));
app.use("/api/hr/app", require("./routes/HrRoutes/Appversionroutes"));
// Announcements to the workforce, delivered through the app inbox. The same
// router serves the executive office below.
app.use("/api/hr/announcements", require("./routes/HrRoutes/Announcements"));
app.use("/api/hr/departments", require("./routes/HrRoutes/Departments"));
app.use("/api/hr/job-postings", require("./routes/HrRoutes/JobPosting_Section"));
app.use("/api/hr/candidates", require("./routes/HrRoutes/Candidates_section"));
app.use("/api/hr/tasks", require("./routes/HrRoutes/EmployeeTasks_section"));
app.use("/api/hr/vendors", require("./routes/Vendor_Routes/vendorRoutes"));
app.use("/api/hr/payroll", require("./routes/HrRoutes/Payroll_section"));
app.use("/api/hr/payslip", require("./routes/HrRoutes/Payslip_section"));
app.use("/api/hr/leaves", require("./routes/HrRoutes/Leave_section"));
app.use("/api/hr/policy", require("./routes/HrRoutes/policyRoutes"));
app.use("/api/hr/sop", require("./routes/HrRoutes/hrSopRoutes"));
app.use("/api/hr/password-management", require("./routes/HrRoutes/Passwordmanagement.js"));

// HR-issued letters (appointment / offer / warning / experience / relieving /
// salary certificate). HR generates here; the employee sees nothing until HR
// explicitly RELEASES a row — the employee half lives at
// /api/employee/documents and never projects an unreleased row.
app.use("/api/hr/documents", require("./routes/HrRoutes/EmployeeDocuments_section"));

app.use("/hr/performance", require("./routes/HrRoutes/Performance_section"));
app.use("/hr/reports", require("./routes/HrRoutes/Reports_section.js"));

const attendanceRouter = require("./routes/HrRoutes/Attendance_section");
app.use("/hr/attendance", attendanceRouter);

// Browser push for every CMS user. The frontend (lib/pushNotifications.js) has
// always called these three paths; until now nothing served them, so CMS push
// silently never worked. Plain VAPID Web Push — no Firebase.
app.use("/api/cms/notifications", require("./routes/notifications"));

// Local media (MEDIA_STORAGE=local — a demo or test machine; see
// services/mediaUpload.service.js). Only the PUBLIC half is served here;
// private files still go through /api/files/<token>.
{
  const { LOCAL_MODE, LOCAL_DIR } = require("./services/mediaUpload.service");
  if (LOCAL_MODE) {
    app.use("/media", express.static(require("path").join(LOCAL_DIR, "public"), { fallthrough: false, maxAge: "1d" }));
    console.log(`[media] LOCAL storage on — uploads are written to ${LOCAL_DIR}`);
  }
}

/* ─── Executive office ────────────────────────────────────────────────── */

// The CEO side is deliberately small: the HR overview, and Access Control
// (mounted above under /api/admin). Nothing else is exposed here.
app.use("/api/ceo/hr", require("./routes/CEO_Routes/hr"));
app.use("/api/ceo/overview", require("./routes/CEO_Routes/overview"));
app.use("/api/ceo/announcements", require("./routes/HrRoutes/Announcements"));

/* ─── Sales ───────────────────────────────────────────────────────────── */

// The desk: leads, the assignment board, the form designer, the field map.
// Every one of these sits behind a CMS session AND a role in the `sales`
// department — see routes/Sales_Routes/_deskAuth.js.
app.use("/api/sales/overview", require("./routes/Sales_Routes/salesOverview"));
app.use("/api/sales/leads", require("./routes/Sales_Routes/salesLeads"));
app.use("/api/sales/tasks", require("./routes/Sales_Routes/salesTaskRoutes"));
app.use("/api/sales/team", require("./routes/Sales_Routes/salesTeam"));
app.use("/api/sales/service-requests", require("./routes/Sales_Routes/salesService"));
// The approval queue, the customer picker, and the two privileged corrections.
// Mounted BEFORE the catch-all /api/sales routers below so its /customers/*
// paths are matched here rather than falling into the template router.
app.use("/api/sales", require("./routes/Sales_Routes/salesApprovals"));
// Schemes, their steps, and the registration form's configuration.
app.use("/api/sales", require("./routes/Sales_Routes/salesSchemeRoutes"));
// Templates and stages share a router: a form and the rung it hangs off are
// edited together, and splitting them put half the designer behind one mount
// and half behind another.
app.use("/api/sales", require("./routes/Sales_Routes/salesTemplates"));

// The public website's scheme listings, edited from the Sales dashboard but
// mounted on their own path rather than under /api/sales — these rows are
// brochure content, not pipeline machinery, and the SalesScheme above is a
// different idea wearing the same word. The model header explains the split.
app.use("/api/website/schemes", require("./routes/Website_Routes/websiteSchemes"));

// The Android field app. A DIFFERENT identity from everything above — the
// employee token, not a department session — which is why it is a separate
// mount and not a branch inside the sales routes.
app.use("/api/field", require("./routes/Field_Routes/fieldApp"));

// The customer's own window onto their progress. A fourth identity and the
// narrowest one: signed in by an OTP to their own phone, scoped to one lead,
// read-only, thirty minutes. Nothing under this mount writes.
app.use("/api/customer", require("./routes/Customer_Routes/customerPortal"));

/* ─── Employee self-service and mobile app ───────────────────────────── */

app.use("/api/employee/auth", require("./routes/Employee_Routes/login.js"));
app.use("/api/employee", require("./routes/Employee_Routes/employeeAuth"));
app.use("/api/employee", require("./routes/Employee_Routes/pushToken"));
app.use("/employee", require("./routes/Employee_Routes/publicProfileAPI"));
app.use("/api/employee/tasks", require("./routes/Employee_Routes/TasksEmployee"));
app.use("/api/employee/attendance", require("./routes/Employee_Routes/employeeAttendance"));
app.use("/api/employee/leave-applications", require("./routes/Employee_Routes/leaveRoutes"));
app.use("/api/employee/payslip", require("./routes/Employee_Routes/Payslip"));

// The employee's OWN performance, scoped to the caller's token — unlike
// /hr/performance/:employeeId, which takes an arbitrary id and is HR-only.
app.use("/api/employee/performance", require("./routes/Employee_Routes/performance"));

// Daily/weekly/monthly standings. Ranks on positive signal only (present + on
// time) — it never exposes a colleague's absences or SOP record.
app.use("/api/employee/leaderboard", require("./routes/Employee_Routes/leaderboard"));

// Attendance regularization. Shares the RegularizationRequest model with HR,
// but scoped to the caller's own token.
app.use("/api/employee/regularizations", require("./routes/Employee_Routes/regularization"));

// HR-issued letters, employee side. Two INDEPENDENT states live behind the
// EmployeeDocument model: HR generates a document, and HR separately RELEASES
// it. Nothing unreleased is reachable through these routes — not in a list and
// not by guessing an _id.
app.use("/api/employee/documents", require("./routes/Employee_Routes/documents"));

// Who is away, by day. Past days come from DailyAttendance, future days from
// approved leave, so it answers "who is out next Tuesday" and not only "who was
// out". It reports absent or on leave and NEVER which leave type: "SL" would
// publish a colleague's sick days to the whole company.
app.use("/api/employee/absence-calendar", require("./routes/Employee_Routes/absenceCalendar"));

const overtimeRoutes = require("./routes/Employee_Routes/Overtimeroutes");
app.use("/api/employee/overtime", overtimeRoutes);

// The native employee app's inbox (every notifyEmployee() is also kept here,
// because the app cannot receive an Expo push) and its approval badge counts.
app.use("/api/employee", require("./routes/Employee_Routes/appInbox"));

/* ─── Health and root ─────────────────────────────────────────────────── */

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend server is running 🚀",
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", socket: "running", connections: io.engine.clientsCount });
});

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Matrubhoomi HRMS API",
    version: "1.0.0",
    modules: ["HR", "Executive", "Employee"],
    socketio: "enabled",
  });
});

app.get("/api/app/version", (req, res) => {
  res.json({
    success: true,
    data: {
      latestVersion: process.env.APP_LATEST_VERSION || "1.0.0",
      minVersion: process.env.APP_MIN_VERSION || "1.0.0",
      updateUrl: process.env.APP_UPDATE_URL || "",
      message: "A new version of the app is available. Please update to continue.",
    },
  });
});

/* ─── Background jobs ─────────────────────────────────────────────────── */

if (attendanceRouter.startHourlyAttendanceSync) {
  attendanceRouter.startHourlyAttendanceSync();
  console.log("✅ Hourly attendance sync cron initialized");
} else {
  console.warn("⚠️ Hourly attendance sync not available");
}

overtimeRoutes.startOvertimeReminders(io);
console.log("✅ Overtime reminder cron initialized");

// Yesterday's sales work, closed out at 2am IST. A task nobody touched becomes
// `expired`; one that got partway becomes `partial` — see services/salesTasks.js
// for why that distinction is worth a cron job. Idempotent, so a restart in the
// middle of it changes nothing.
require("node-cron").schedule(
  process.env.SALES_CLOSEOUT_CRON || "0 2 * * *",
  () => {
    require("./services/salesTasks")
      .closeOutOverdue()
      .catch((err) => console.error("[sales] close-out failed:", err.message));

    // Yesterday's field days, closed the same night: a stay still open at
    // midnight ended at its last fix, and a duty nobody switched off ended at
    // the day's last fix — and THAT day's field attendance is filed for the
    // manager exactly as if the salesperson had ended duty themselves.
    (async () => {
      const tracking = require("./services/fieldTracking");
      const { fileFieldAttendance } = require("./services/fieldAttendance");
      const yesterday = tracking.dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const closed = await tracking.closeDay(yesterday);
      for (const c of closed.filter((x) => x.dutyClosed)) {
        await fileFieldAttendance({ employeeId: c.employeeId, day: yesterday });
      }
      if (closed.length) console.log(`[field] closed ${closed.length} open day(s) for ${yesterday}`);
    })().catch((err) => console.error("[field] day close-out failed:", err.message));
  },
  { timezone: process.env.FIELD_TIMEZONE || "Asia/Kolkata" },
);
console.log("✅ Sales task close-out cron initialized");

/* ─── Shutdown ────────────────────────────────────────────────────────── */

let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 ${signal} received, starting graceful shutdown...`);

  // Close the payslip renderer's Chromium. It is a child process, so without
  // this a restart leaves one behind every time — and on a small box a handful
  // of orphaned Chromiums is the whole machine's memory.
  require("./services/pdfRender.service")
    .shutdown()
    .catch((err) => console.warn("⚠️  PDF renderer shutdown:", err.message));

  server.close(() => {
    console.log("✅ HTTP server closed");
    mongoose.connection
      .close(false)
      .then(() => {
        console.log("✅ MongoDB connection closed");
        console.log("👋 Shutdown complete");
        process.exit(0);
      })
      .catch((err) => {
        console.error("⚠️  Error closing MongoDB connection:", err);
        process.exit(1);
      });
  });

  setTimeout(() => {
    console.error("⚠️  Forcing shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Socket.IO connections available at ws://localhost:${PORT}`);
});
