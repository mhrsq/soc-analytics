declare module "react-grid-layout" {
  import * as React from "react";

  export interface Layout {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    maxW?: number;
    minH?: number;
    maxH?: number;
    static?: boolean;
    isDraggable?: boolean;
    isResizable?: boolean;
  }

  export type Layouts = { [P: string]: Layout[] };

  export interface ResponsiveProps {
    className?: string;
    width: number;
    breakpoints?: { [P: string]: number };
    cols?: { [P: string]: number };
    layouts?: Layouts;
    onLayoutChange?: (layout: Layout[], layouts: Layouts) => void;
    onBreakpointChange?: (newBreakpoint: string, newCols: number) => void;
    rowHeight?: number;
    draggableHandle?: string;
    isDraggable?: boolean;
    isResizable?: boolean;
    compactor?: { type: string; allowOverlap?: boolean } | null;
    margin?: [number, number];
    containerPadding?: [number, number] | null;
    children?: React.ReactNode;
    [key: string]: any;
  }

  export function ResponsiveGridLayout(props: ResponsiveProps): React.ReactElement;
  export { ResponsiveGridLayout as Responsive };

  export function useContainerWidth(options?: {
    measureBeforeMount?: boolean;
    initialWidth?: number;
  }): {
    width: number;
    mounted: boolean;
    containerRef: React.RefObject<HTMLDivElement>;
  };

  export function getCompactor(type: "vertical" | "horizontal"): { type: string; allowOverlap?: boolean };

  export default function GridLayout(props: any): React.ReactElement;
}

declare module "react-grid-layout/css/styles.css" {
  const content: string;
  export default content;
}

