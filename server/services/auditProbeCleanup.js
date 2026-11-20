/**
 * Retire les fichiers déposés pendant l'audit, puis les met en liste noire
 * pour qu'une nouvelle validation ne les réimporte pas.
 */
const fs = require("fs");
const path = require("path");
const { config } = require("../config");
const { blacklistPhoto, dismissReport, listBlacklist, listReports } = require("./quizPoolService");

const AUDIT_TITLE = "File:HAK-audit-probe-9f3c1b.png";
const REPORT_TITLE = "File:HAK-report-probe-9f3c1b.png";
const MEDIA_REL = path.join("merle-noir", "9e1b9832a42fa595.png");

function removeAuditProbes() {
    const blacklisted = blacklistPhoto({ name: "Merle noir", title: AUDIT_TITLE, url: "" });
    const report = dismissReport(REPORT_TITLE);
    const media = path.join(config.runtimeDataDir, "quiz-images", MEDIA_REL);
    let removedFile = false;
    try {
        if (fs.existsSync(media)) {
            fs.unlinkSync(media);
            removedFile = true;
        }
    } catch {
        removedFile = false;
    }
    const stillListed = listBlacklist().some((entry) => entry.title === AUDIT_TITLE);
    const stillReported = listReports().some((entry) => entry.title === REPORT_TITLE);
    const fileGone = !fs.existsSync(media);
    return {
        ok: Boolean(blacklisted.ok && report.ok && stillListed && !stillReported && fileGone),
        blacklisted: stillListed,
        reportRemoved: !stillReported,
        fileRemoved: removedFile || fileGone
    };
}

module.exports = { removeAuditProbes, AUDIT_TITLE, REPORT_TITLE, MEDIA_REL };
