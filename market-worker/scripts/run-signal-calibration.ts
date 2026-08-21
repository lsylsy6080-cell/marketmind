import { buildSignalCalibration } from "../src/calibration/SignalCalibrationEngine";
import { loadCalibrationRows, saveCalibrationSnapshot } from "../src/calibration/repository";

const windowHours = Number(process.env.SIGNAL_CALIBRATION_WINDOW_HOURS ?? 168);
const dryRun = process.env.SIGNAL_CALIBRATION_DRY_RUN === "true";
const { newsRows, fundingRows } = await loadCalibrationRows(windowHours);
const result = buildSignalCalibration(newsRows, fundingRows, windowHours);

if (!dryRun) await saveCalibrationSnapshot(result);
console.log(JSON.stringify({ ...result, saved: !dryRun }, null, 2));
