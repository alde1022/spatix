// @deck.gl/mapbox officially supports both Mapbox GL JS and MapLibre GL JS
// See: https://deck.gl/docs/api-reference/mapbox/mapbox-overlay
declare module '@deck.gl/mapbox' {
  export class MapboxOverlay {
    constructor(props: any);
    setProps(props: any): void;
  }
}

declare module '@deck.gl/core' {
  export class Deck {
    constructor(props: any);
    setProps(props: any): void;
    finalize(): void;
  }
}

declare module '@deck.gl/layers' {
  export class ScatterplotLayer {
    constructor(props: any);
  }
  export class ArcLayer {
    constructor(props: any);
  }
  export class GeoJsonLayer {
    constructor(props: any);
  }
  export class LineLayer {
    constructor(props: any);
  }
  export class PolygonLayer {
    constructor(props: any);
  }
}

declare module '@deck.gl/aggregation-layers' {
  export class HexagonLayer {
    constructor(props: any);
  }
  export class HeatmapLayer {
    constructor(props: any);
  }
}

declare module '@deck.gl/geo-layers' {
  export class H3HexagonLayer {
    constructor(props: any);
  }
}
