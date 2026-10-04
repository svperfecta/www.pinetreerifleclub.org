// Static routes receive their content through getStaticPaths; no CMS is contacted.
export function getEmDashEntry() { throw new Error('CMS access is unavailable in the offline export'); }
export const getEmDashCollection = getEmDashEntry;
