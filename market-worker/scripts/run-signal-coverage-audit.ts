import { auditSignals } from "../src/signal-audit/SignalCoverageAudit";
import { loadSignalAuditRows } from "../src/signal-audit/repository";
const hours=Number(process.env.SIGNAL_AUDIT_WINDOW_HOURS??168); const {newsRows,fundingRows}=await loadSignalAuditRows(hours); console.log(JSON.stringify(auditSignals(newsRows,fundingRows,hours),null,2));
