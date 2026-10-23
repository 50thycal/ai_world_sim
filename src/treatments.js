// Standalone constants keep version checks free of simulation-module import cycles.
export const AGENCY_VERSION = 'world-v10';
export const AGENCY_INPUT = 'actionable-facts-v1';
export const hasAgency = w => w.version === AGENCY_VERSION && w.agency?.version === 1;
