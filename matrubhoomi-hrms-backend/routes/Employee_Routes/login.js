const express = require("express");
const jwt = require("jsonwebtoken");
const Employee = require("../../models/Employee");
const {
  matchesEmployeePassword,
  upgradeEmployeePassword,
  setChosenEmployeePassword,
  defaultFromNameAndDob,
} = require("../../utils/employeePassword");
const { activeEmployeeFilter, isEmployeeActive } = require("../../utils/employeeActive");

const router = express.Router();

// ── Helper: Extract token from cookie OR Bearer header (iOS fix) ──
function extractToken(req, cookieName = "employee_token") {
  // 1. Cookie (Android/Windows/desktop)
  let token = req.cookies?.[cookieName];
  // 2. Bearer token (iOS Safari — cookies blocked)
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  // 3. Manual cookie parse fallback
  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(new RegExp(`${cookieName}=([^;]+)`));
    if (match) token = match[1];
  }
  return token || null;
}

const extractDateComponents = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  let date =
    typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  if (isNaN(date.getTime())) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

// Helper: populate and format employee response
async function getFormattedEmployee(employeeId) {
  const employee = await Employee.findById(employeeId)
    .select("-password -temporaryPassword -__v")
    .populate(
      "primaryManager.managerId",
      "firstName lastName email phone biometricId",
    )
    .populate(
      "secondaryManager.managerId",
      "firstName lastName email phone biometricId",
    );

  // Interns are refused at /login, but /verify and /profile parse the token
  // themselves rather than going through AllEmployeeAppMiddleware, so the
  // check has to be here too — this is the pair of routes the app calls on
  // launch to restore a session. Returning null sends it to the login screen,
  // where the plain message is waiting.
  if (!isEmployeeActive(employee) || employee.employmentType === "intern")
    return null;

  const responseData = employee.toObject();
  responseData.phoneNumber = employee.phone || "";
  responseData.phone = employee.phone || "";
  responseData.fullName =
    `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
  if (employee.dateOfJoining)
    responseData.formattedDateOfJoining = new Date(
      employee.dateOfJoining,
    ).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  if (employee.dateOfBirth)
    responseData.formattedDateOfBirth = new Date(
      employee.dateOfBirth,
    ).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  responseData.designation =
    employee.designation || employee.jobTitle || "Not Assigned";
  responseData.jobTitle =
    employee.jobTitle || employee.designation || "Not Assigned";
  responseData.email = employee.email || "";
  if (!responseData.profilePhoto)
    responseData.profilePhoto = { url: null, publicId: null };

  return responseData;
}

/**
 * EMPLOYEE LOGIN
 */
router.post("/login", async (req, res) => {
  try {
    const { phoneNumber, password, rememberMe } = req.body;

    if (!phoneNumber || phoneNumber.length !== 10)
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit phone number is required",
      });
    if (!password)
      return res
        .status(400)
        .json({ success: false, message: "Password is required" });

    // BOTH flags must say "employed" — see utils/employeeActive.js. This used
    // to accept either one, so an employee HR had marked inactive in only one
    // of the two fields could still sign in.
    const employee = await Employee.findOne(
      activeEmployeeFilter({ phone: phoneNumber }),
    ).select("+password +temporaryPassword");
    if (!employee)
      return res
        .status(401)
        .json({ success: false, message: "Invalid phone number or password" });

    // Interns have no app account. Checked BEFORE the password so a wrong
    // password on an intern's number does not answer a different question
    // than a right one — and told plainly, because "invalid phone number or
    // password" would send them round the reset loop for an account that is
    // never going to open. The lock lifts by itself the day HR changes their
    // employment type, which is what "as long as they are not an employee"
    // means in practice.
    if (employee.employmentType === "intern")
      return res.status(403).json({
        success: false,
        code: "INTERN_NO_APP_ACCESS",
        message:
          "The Matrubhoomi app is for employees. Interns do not have app access — " +
          "please speak to HR.",
      });

    // The same matcher the CMS login uses (utils/employeePassword.js), so the
    // two front doors cannot disagree about a password. The phone number only
    // works while the account is still on the password the system issued —
    // it used to work forever, after any number of changes, and reset the
    // password back to itself.
    const match = await matchesEmployeePassword(employee, password);
    if (!match.ok)
      return res
        .status(401)
        .json({ success: false, message: "Invalid phone number or password" });
    if (match.needsUpgrade) {
      // updateOne, never .save(): the pre-save hook re-encrypts the salary
      // block, which has no business running because somebody signed in.
      await upgradeEmployeePassword(Employee, employee._id, password);
    }

    // Still on the password the system issued — the phone number (a new
    // hire, or HR's reset) or the name-and-birthday default. The app asks for
    // a password of their own before anything else. Worked out from what was
    // just typed, so nothing extra is stored.
    const mustChangePassword =
      String(password) === String(employee.phone || "") ||
      String(password) === String(defaultFromNameAndDob(employee.firstName, employee.dateOfBirth) || "");

    const expiresIn = rememberMe ? "30d" : "7d";
    const maxAge = rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    const token = jwt.sign(
      {
        id: employee._id,
        phoneNumber: employee.phone,
        email: employee.email || "",
        type: "employee",
      },
      process.env.JWT_SECRET,
      { expiresIn },
    );

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("employee_token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge,
    });

    res.status(200).json({
      success: true,
      message: "Employee login successful",
      data: {
        employee: {
          id: employee._id,
          _id: employee._id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phoneNumber: employee.phone,
          phone: employee.phone,
          biometricId: employee.biometricId,
          department: employee.department,
          jobTitle: employee.jobTitle,
          designation: employee.designation || employee.jobTitle,
          profilePhoto: employee.profilePhoto?.url || null,
          role: employee.role || "employee",
        },
        token,
        mustChangePassword,
      },
    });
  } catch (err) {
    console.error("Employee login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * VERIFY — now checks Bearer token too (iOS fix)
 */
router.get("/verify", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const responseData = await getFormattedEmployee(decoded.id);
    if (!responseData)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error("Verify error:", error.message);
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
});

/**
 * GET PROFILE — now checks Bearer token too (iOS fix)
 */
router.get("/profile", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const responseData = await getFormattedEmployee(decoded.id);
    if (!responseData)
      return res
        .status(401)
        .json({ success: false, message: "Employee not found or inactive" });

    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error("Profile fetch error:", error.message);
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
});

/**
 * LOGOUT
 */
router.post("/logout", (req, res) => {
  res.clearCookie("employee_token");
  res.status(200).json({ success: true, message: "Logged out successfully" });
});

/**
 * CHANGE PASSWORD — now checks Bearer token too (iOS fix)
 */
router.post("/change-password", async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { oldPassword, newPassword, currentPassword } = req.body;
    const oldPw = oldPassword || currentPassword;

    if (!oldPw || !newPassword)
      return res.status(400).json({
        success: false,
        message: "Both old and new passwords are required",
      });

    if (String(newPassword).length < 6)
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });

    const employee = await Employee.findById(decoded.id).select(
      // NOT "+password firstName …": a `+field` inside an INCLUSIVE
      // projection makes mongoose drop the password, and the matcher then
      // accepted the PHONE NUMBER as the current password for everybody
      // (and refused the real one). Same trap as routes/auth/deptAuth.js.
      "+temporaryPassword",
    );
    if (!employee || !isEmployeeActive(employee))
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });

    // The shared matcher. This used to accept the employee's FIRST NAME as
    // the current password (a helper written for phone numbers, called with a
    // name), so anybody holding an unlocked phone could change the password
    // without knowing it.
    const match = await matchesEmployeePassword(employee, oldPw);
    if (!match.ok)
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect" });

    await setChosenEmployeePassword(Employee, employee._id, newPassword);

    res
      .status(200)
      .json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
