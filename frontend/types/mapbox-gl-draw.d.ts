// Type declarations for @mapbox/mapbox-gl-draw with MapLibre GL JS
declare module '@mapbox/mapbox-gl-draw' {
  import type { IControl, Map } from 'maplibre-gl';

  interface DrawOptions {
    displayControlsDefault?: boolean;
    controls?: {
      point?: boolean;
      line_string?: boolean;
      polygon?: boolean;
      trash?: boolean;
      combine_features?: boolean;
      uncombine_features?: boolean;
    };
    defaultMode?: string;
    styles?: any[];
    modes?: Record<string, any>;
    userProperties?: boolean;
  }

  interface DrawFeature {
    id: string;
    type: 'Feature';
    properties: Record<string, any>;
    geometry: GeoJSON.Geometry;
  }

  class MapboxDraw implements IControl {
    constructor(options?: DrawOptions);
    onAdd(map: Map): HTMLElement;
    onRemove(map: Map): void;
    getDefaultPosition(): string;
    
    add(geojson: GeoJSON.Feature | GeoJSON.FeatureCollection): string[];
    get(featureId: string): DrawFeature | undefined;
    getFeatureIdsAt(point: { x: number; y: number }): string[];
    getSelectedIds(): string[];
    getSelected(): GeoJSON.FeatureCollection;
    getSelectedPoints(): GeoJSON.FeatureCollection;
    getAll(): GeoJSON.FeatureCollection;
    delete(ids: string | string[]): this;
    deleteAll(): this;
    set(featureCollection: GeoJSON.FeatureCollection): string[];
    trash(): this;
    combineFeatures(): this;
    uncombineFeatures(): this;
    getMode(): string;
    changeMode(mode: string, options?: Record<string, any>): this;
    setFeatureProperty(featureId: string, property: string, value: any): this;
  }

  export default MapboxDraw;
}
