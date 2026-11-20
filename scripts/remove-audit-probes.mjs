import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { removeAuditProbes } = require("../server/services/auditProbeCleanup.js");

const result = removeAuditProbes();
console.log(JSON.stringify(result));
if (!result.ok) process.exitCode = 1;
