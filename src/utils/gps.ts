/** Metres as kilometres with one decimal, e.g. 11066 -> '11.1 km'. */
export const km = (metres: number) => `${(metres / 1000).toFixed(1)} km`
