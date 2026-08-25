import type { Phase87OutcomeInput, Phase87OutcomeResult, OutcomeLabel } from "./types";

const round=(v:number,d=4)=>Number(v.toFixed(d));
const clamp=(v:number)=>Math.max(0,Math.min(100,v));

export function evaluateContextExecutionOutcome(input:Phase87OutcomeInput):Phase87OutcomeResult{
  if(input.referencePrice<=0||input.futurePrice<=0) throw new Error("[8-7] price must be positive");
  const raw=((input.futurePrice-input.referencePrice)/input.referencePrice)*100;
  const directional=input.side==="long"?raw:-raw;
  const move=Math.abs(directional);

  let label:OutcomeLabel="neutral";
  let score=50;

  if(input.permission==="blocked"){
    if(directional<=-0.3){label="avoided_loss";score=clamp(70+Math.min(30,move*20));}
    else if(directional>=0.3){label="missed_opportunity";score=clamp(30-Math.min(30,move*15));}
    else {label="neutral";score=55;}
  } else if(input.permission==="reduced"){
    if(directional<=-0.3){label="protected";score=clamp(65+Math.min(25,move*15));}
    else if(directional>=0.3){label="good_entry";score=clamp(60+Math.min(30,move*12));}
    else {label="neutral";score=55;}
  } else {
    if(directional>=0.3){label="good_entry";score=clamp(65+Math.min(35,move*15));}
    else if(directional<=-0.3){label="bad_entry";score=clamp(35-Math.min(35,move*15));}
    else {label="neutral";score=50;}
  }

  return {
    side:input.side,
    permission:input.permission,
    directionalReturnPercent:round(directional),
    label,
    qualityScore:round(score,1),
    horizonMinutes:input.horizonMinutes,
    strategyVersion:"phase8-context-outcome-v8.7",
  };
}
