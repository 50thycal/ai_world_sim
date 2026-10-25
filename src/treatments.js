export const ADAPTIVE_VERSION='world-v14';
export const ADAPTIVE_INPUT='adaptive-facts-v1';
export const hasAdaptive=w=>w.version===ADAPTIVE_VERSION&&w.adaptive?.version===1;
export const LIVING_VERSION='world-v13';
export const LIVING_INPUT='living-facts-v1';
export const hasLiving=w=>[LIVING_VERSION,ADAPTIVE_VERSION].includes(w.version)&&w.living?.version===1;
// Standalone constants keep version checks free of simulation-module import cycles.
export const AGENCY_VERSION = 'world-v10';
export const AGENCY_INPUT = 'actionable-facts-v1';
export const hasAgency = w => [AGENCY_VERSION,PLANNING_VERSION,EVENT_VERSION,LIVING_VERSION,ADAPTIVE_VERSION].includes(w.version) && w.agency?.version === 1;

export const PLANNING_VERSION='world-v11';
export const EVENT_VERSION='world-v12';
export const PLANNING_INPUT='planning-facts-v1';
export const EVENT_INPUT='planning-events-facts-v1';
export const hasPlanning=w=>[PLANNING_VERSION,EVENT_VERSION,LIVING_VERSION,ADAPTIVE_VERSION].includes(w.version)&&w.planning?.version===1;
export const hasEvents=w=>[EVENT_VERSION,LIVING_VERSION,ADAPTIVE_VERSION].includes(w.version)&&w.planning?.sharedEvents?.version===1;
