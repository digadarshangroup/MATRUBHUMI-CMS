// routes/login.js
//
// Main CMS login route.
//
// This deployment has exactly two staff-side departments — HR and the CEO
// office. Both live in their own collection, so a login is a probe of each in
// turn. Employees do NOT come through here: they authenticate against
// routes/Employee_Routes/login.js using their identity ID.
//
// The signed token is returned in the JSON body as well as set as an HttpOnly
// cookie. Both are load-bearing: Chrome refuses to store a cross-origin cookie
// for localhost:3000 -> localhost:5000, so in development the body token (saved
// by the frontend to localStorage and replayed as `Authorization: Bearer`) is
// the only path that works. See config/jwt.js.

const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { readToken } = require("../config/jwt");

const HRDepartment = require("../models/HRDepartment");
const CEODepartment = require("../models/CEODepartment");

const { SECRET: JWT_SECRET } = require("../config/jwt");

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    let user = null;
    let userModel = null;

    user = await HRDepartment.findOne({ email: email.toLowerCase() });
    if (user) {
      userModel = "hr";
    } else {
      user = await CEODepartment.findOne({ email: email.toLowerCase() });
      if (user) userModel = "ceo";
    }

    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        employeeId: user.employeeId,
        userType: userModel,
        name: user.name,
        email: user.email || "",
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days - matches JWT expiresIn
    });

    let redirectPath = "/";
    if (user.role === "hr_manager") redirectPath = "/hr/dashboard";
    if (user.role === "ceo") redirectPath = "/ceo/dashboard";

    res.status(200).json({
      success: true,
      message: "Login successful",
      redirectTo: redirectPath,
      token,
      userType: userModel,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        employeeId: user.employeeId,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/verify", async (req, res) => {
  try {
    // Header before cookie. This handler is currently shadowed by the one in
    // routes/auth/deptAuth.js, which server.js mounts first - but that mount is
    // documented as temporary, and a cookie-only read here would silently
    // reintroduce the cross-host failure the day it is removed. See config/jwt.js.
    const token = readToken(req);
    if (!token)
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });

    const decoded = jwt.verify(token, JWT_SECRET);
    let user = null;

    switch (decoded.userType) {
      case "ceo":
        user = await CEODepartment.findById(decoded.id).select("-password");
        break;
      default:
        user = await HRDepartment.findById(decoded.id).select("-password");
        break;
    }

    if (!user || !user.isActive)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        department: user.department,
        userType: decoded.userType || "hr",
      },
    });
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("auth_token");
  res.json({ success: true, message: "Logged out successfully" });
});

module.exports = router;
