declare module "react-simple-maps" {
  import { ComponentType, CSSProperties, ReactNode } from "react";

  export interface ComposableMapProps {
    projectionConfig?: { scale?: number; center?: [number, number]; rotation?: [number, number, number] };
    style?: CSSProperties;
    children?: ReactNode;
  }
  export const ComposableMap: ComponentType<ComposableMapProps>;

  export interface ZoomableGroupProps {
    zoom?: number;
    center?: [number, number];
    onMoveEnd?: (position: { coordinates: [number, number]; zoom: number }) => void;
    minZoom?: number;
    maxZoom?: number;
    children?: ReactNode;
  }
  export const ZoomableGroup: ComponentType<ZoomableGroupProps>;

  export interface GeographiesProps {
    geography: string | object;
    children: (data: { geographies: any[] }) => ReactNode;
  }
  export const Geographies: ComponentType<GeographiesProps>;

  export interface GeographyProps {
    geography: any;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: { default?: CSSProperties; hover?: CSSProperties; pressed?: CSSProperties };
  }
  export const Geography: ComponentType<GeographyProps>;

  export interface MarkerProps {
    coordinates: [number, number];
    children?: ReactNode;
  }
  export const Marker: ComponentType<MarkerProps>;
}
