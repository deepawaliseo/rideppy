/** WGS-84 geographic coordinates, as produced/consumed by the map stack. */
export interface Location {
  /** Degrees north; valid range -90..90. */
  latitude: number;
  /** Degrees east; valid range -180..180. */
  longitude: number;
}
