// services/approvalChain.js
//
// Who a new request waits on: the employee's ONE reporting manager.
//
// WHY ONE
// -------
// The system came with a primary and a secondary manager — a leave went to the
// primary, then waited again on the secondary before it was final. Matrubhoomi
// runs with a single reporting manager per employee, so that manager's decision
// is final (HR can still override from the CMS). Every leave, quick leave,
// attendance correction and overtime report builds its `managersNotified`
// snapshot from here, so the rule is written once.
//
// The downstream flows needed no change: each already treats "no secondary in
// the chain" as "the primary's approval is final". A secondaryManager still
// stored on an old employee record is simply not consulted any more, and a
// request filed BEFORE this change keeps the chain it was filed with — its
// snapshot is frozen on the request, so it finishes the way it started.

"use strict";

/**
 * @param emp  an Employee (lean or document) with `primaryManager`
 * @returns    `[ { managerId, managerName, type: "primary" } ]`, or `[]` when
 *             nobody is assigned — which callers treat as NO_MANAGER.
 */
function approvalChain(emp) {
  const p = emp?.primaryManager;
  if (!p?.managerId) return [];
  return [{ managerId: p.managerId, managerName: p.managerName || "", type: "primary" }];
}

module.exports = { approvalChain };
