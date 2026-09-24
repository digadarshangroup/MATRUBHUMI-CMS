"use strict";
// scripts/_waitForIndexes.js
//
// Make sure every sales and employee index exists before a test starts.
//
// WHY THE TESTS NEED THIS
// -----------------------
// The test scripts run against a server that has usually JUST booted on a fresh
// scratch database, and Mongoose builds indexes in the background after the
// connection opens — for a few seconds after /api/health already says
// "Connected". salesSchemeFlow_test.js runs its whole round in about three
// seconds, so its "the same submission ten times stores once" case could fire
// before the unique `clientRef` index existed. All ten were then stored, and the
// index build itself failed on the duplicates, so the case failed for the rest
// of that database's life. It measured the index build, not the code.
//
// Model.init() builds the model's indexes and resolves once they exist; when the
// server already built them it is a no-op. Harmless to call from the test
// process as well as the server.

const fs = require("fs");
const path = require("path");

module.exports = async function waitForIndexes(mongoose) {
  const models = path.join(__dirname, "..", "models");
  for (const dir of ["Sales_Models"]) {
    for (const file of fs.readdirSync(path.join(models, dir))) {
      if (file.endsWith(".js")) require(path.join(models, dir, file));
    }
  }
  require(path.join(models, "Employee"));
  require(path.join(models, "EmployeeNotification"));
  await Promise.all(
    mongoose.modelNames().map((name) => mongoose.model(name).init().catch(() => {})),
  );
};
