import { buildShadowValidation } from "../src/shadow-validation/ShadowSignalValidator";
import { loadShadowValidationData, saveShadowValidation } from "../src/shadow-validation/repository";
const windowHours=Number(process.env.SHADOW_VALIDATION_WINDOW_HOURS??168); const dry=process.env.SHADOW_VALIDATION_DRY_RUN==="true";
const data=await loadShadowValidationData(windowHours); const result=buildShadowValidation({...data,windowHours}); if(!dry)await saveShadowValidation(result); console.log(JSON.stringify({...result,saved:!dry},null,2));
