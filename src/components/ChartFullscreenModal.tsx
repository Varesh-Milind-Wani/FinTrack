import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChartCandlestick, LineChart, RotateCcw, X } from "lucide-react";
import Highcharts from "highcharts";
import HighchartsStock from "highcharts/highstock";
import HighchartsReact from "highcharts-react-official";
import type { HighchartsReactRefObject } from "highcharts-react-official";
import ReactECharts from "echarts-for-react";
import type { EChartsInstance } from "echarts-for-react";
import { usePersistentState } from "../hooks/usePersistentState";
import { groupCandles } from "../utils/candleGrouping";

const HighchartsChart =
  (HighchartsReact as unknown as {
    default?: typeof HighchartsReact;
  }).default ?? HighchartsReact;

const EChartsChart =
  (ReactECharts as unknown as {
    default?: typeof ReactECharts;
  }).default ?? ReactECharts;

const chartRangeOptions = [
  { type: "day", count: 1, label: "1 day" },
  { type: "week", count: 1, label: "1 week" },
  { type: "month", count: 1, label: "1 month" },
  { type: "month", count: 3, label: "3 months" },
  { type: "month", count: 6, label: "6 months" },
  { type: "year", count: 1, label: "1 year" },
  { type: "year", count: 3, label: "3 years" },
  { type: "year", count: 5, label: "5 years" },
  { type: "year", count: 10, label: "10 years" },
  { type: "all", count: 0, label: "All" },
] as const;

const applyChartRange = (chart: Highcharts.Chart | undefined, index: number) => {
  if (!chart) return;

  const stockRangeSelector = (chart as Highcharts.Chart & {
    rangeSelector?: { clickButton: (buttonIndex: number) => void };
  }).rangeSelector;
  if (stockRangeSelector) {
    stockRangeSelector.clickButton(index);
    return;
  }

  const axis = chart.xAxis[0] as (Highcharts.Axis & { dataMin?: number; dataMax?: number }) | undefined;
  if (!axis || typeof axis.dataMin !== "number" || typeof axis.dataMax !== "number") return;

  const range = chartRangeOptions[index];
  if (!range || range.type === "all") {
    axis.setExtremes(undefined, undefined);
    return;
  }

  const max = axis.dataMax;
  const minDate = new Date(max);
  if (range.type === "day") minDate.setDate(minDate.getDate() - range.count);
  if (range.type === "week") minDate.setDate(minDate.getDate() - range.count * 7);
  if (range.type === "month") minDate.setMonth(minDate.getMonth() - range.count);
  if (range.type === "year") minDate.setFullYear(minDate.getFullYear() - range.count);
  axis.setExtremes(Math.max(axis.dataMin, minDate.getTime()), max);
};

const applyCandleInterval = (chart: Highcharts.Chart | undefined, options: Highcharts.Options | undefined, intervalIndex: number) => {
  if (!chart) return false;
  const sourceSeries = (options?.series as Array<{ type?: string; data?: unknown[] }> | undefined)
    ?.find((series) => series.type === "candlestick");
  const candleSeries = chart.series.find((series) => series.type === "candlestick");
  if (!sourceSeries || !candleSeries) return false;
  candleSeries.setData(groupCandles(sourceSeries.data ?? [], intervalIndex) as never[], false, false, false);
  chart.xAxis[0]?.setExtremes(undefined, undefined, false, false);
  chart.redraw();
  return true;
};

const getEchartsRangeStart = (option: Record<string, unknown>, index: number) => {
  const range = chartRangeOptions[index];
  if (!range || range.type === "all") return 0;

  const series = Array.isArray(option.series) ? option.series : [];
  const values = series.flatMap((entry) => {
    const data = entry && typeof entry === "object" && "data" in entry
      ? (entry as { data?: unknown }).data
      : undefined;
    return Array.isArray(data) ? data : [];
  }).map((point) => {
    const value = Array.isArray(point) ? point[0] : point;
    const timestamp = value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : /^\d+(?:\.\d+)?$/.test(String(value))
          ? Number(value)
          : new Date(String(value)).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }).filter((value): value is number => value !== null).sort((a, b) => a - b);

  if (values.length < 2) return 0;
  const max = values[values.length - 1];
  const min = new Date(max);
  if (range.type === "day") min.setDate(min.getDate() - range.count);
  if (range.type === "week") min.setDate(min.getDate() - range.count * 7);
  if (range.type === "month") min.setMonth(min.getMonth() - range.count);
  if (range.type === "year") min.setFullYear(min.getFullYear() - range.count);
  return Math.max(0, Math.min(100, ((min.getTime() - values[0]) / (max - values[0])) * 100));
};

type ChartKind = "highcharts" | "stock" | "echarts";
type ChartMode = "classic" | "candlestick";
type CandleReadout = { x: number; open: number; low: number; high: number; close: number };

const getCandleReadout = (point?: Highcharts.Point): CandleReadout | null => {
  if (!point) return null;
  const candle = point as Highcharts.Point & { open?: number; low?: number; high?: number; close?: number };
  if (![point.x, candle.open, candle.low, candle.high, candle.close].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  return { x: point.x as number, open: candle.open as number, low: candle.low as number, high: candle.high as number, close: candle.close as number };
};

interface Props {
  open: boolean;
  title: string;
  subtitle: string;
  kind: ChartKind;
  highchartsOptions?: Highcharts.Options;
  stockOptions?: Highcharts.Options;
  defaultChartMode?: ChartMode;
  echartsOption?: Record<string, unknown>;
  onClose: () => void;
}

const ChartFullscreenModal = ({
  open,
  title,
  subtitle,
  kind,
  highchartsOptions,
  stockOptions,
  defaultChartMode = "classic",
  echartsOption,
  onClose,
}: Props) => {
  const chartRef = useRef<HighchartsReactRefObject>(null);
  const echartsHostRef = useRef<HTMLDivElement>(null);
  const echartsInstanceRef = useRef<EChartsInstance | null>(null);
  const [rangeSelection, setRangeSelection] = usePersistentState("charts.fullscreenRange", 9);
  const [candleIntervalSelection, setCandleIntervalSelection] = usePersistentState("charts.fullscreenCandleInterval", 9);
  const [chartMode, setChartMode] =
    useState<ChartMode>(defaultChartMode);
  const [candleReadout, setCandleReadout] = useState<CandleReadout | null>(null);
  const closeModal = useCallback(() => {
    // Reveal the underlying page immediately. Chart teardown can take a frame,
    // and a stale fullscreen backdrop must never leave the app looking blank.
    const overlay = document.querySelector<HTMLElement>(".chart-fullscreen-overlay");
    if (overlay) overlay.style.display = "none";
    document.body.style.removeProperty("overflow");
    onClose();
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setChartMode(defaultChartMode);
    }
  }, [defaultChartMode, open, title]);

  const fullscreenHighchartsOptions = useMemo(() => {
    const selectedOptions =
      chartMode === "candlestick"
        ? stockOptions ?? highchartsOptions
        : highchartsOptions;

    if (!selectedOptions) {
      return undefined;
    }

    const addChartEndPadding = (axis: Highcharts.XAxisOptions): Highcharts.XAxisOptions => {
      const hasDateOrCategoryScale = axis.type === "datetime" || axis.type === "category";
      return {
        ...axis,
        ...(hasDateOrCategoryScale
          ? { maxPadding: Math.max(axis.maxPadding ?? 0, chartMode === "candlestick" ? 0.14 : 0.08) }
          : {}),
        ...(chartMode === "candlestick" ? { ordinal: false } : {}),
      };
    };
    const shiftCandlestickAxisLabels = (axis: Highcharts.YAxisOptions): Highcharts.YAxisOptions => {
      const crosshair = typeof axis.crosshair === "object" ? axis.crosshair : undefined;
      return {
        ...axis,
        crosshair: crosshair ? {
          ...crosshair,
          label: { ...crosshair.label, enabled: true },
        } : axis.crosshair,
        ...(chartMode === "candlestick"
          ? { labels: { ...axis.labels, x: Math.max(axis.labels?.x ?? 0, 48) } }
          : {}),
      };
    };
    const fullscreenXAxis = Array.isArray(selectedOptions.xAxis)
      ? selectedOptions.xAxis.map(addChartEndPadding)
      : selectedOptions.xAxis
        ? addChartEndPadding(selectedOptions.xAxis)
        : undefined;
    const fullscreenYAxis = Array.isArray(selectedOptions.yAxis)
      ? selectedOptions.yAxis.map(shiftCandlestickAxisLabels)
      : selectedOptions.yAxis
        ? shiftCandlestickAxisLabels(selectedOptions.yAxis)
        : undefined;
    const hasRightYAxis = Array.isArray(selectedOptions.yAxis)
      ? selectedOptions.yAxis.some((axis) => axis.opposite === true)
      : selectedOptions.yAxis?.opposite === true;
    const sourceSpacing = selectedOptions.chart?.spacing ?? [12, 24, 20, 12];
    const fullscreenSpacing: [number, number, number, number] = [
      sourceSpacing[0] ?? 12,
      Math.max(sourceSpacing[1] ?? 24, chartMode === "candlestick" ? 104 : hasRightYAxis ? 72 : 24),
      sourceSpacing[2] ?? 20,
      sourceSpacing[3] ?? 12,
    ];

    const fitFullscreenChart = (chart: Highcharts.Chart) => {
      const chartBody = chart.container.parentElement;
      if (!chartBody) return;

      const resizeChart = () => {
        const height = chartBody.clientHeight;
        if (height > 0 && chart.chartHeight !== height) {
          chart.setSize(undefined, height, false);
        }
      };

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(resizeChart);
        observer.observe(chartBody);
        resizeChart();
        Highcharts.addEvent(chart, "destroy", () => observer.disconnect());
      } else {
        resizeChart();
      }
    };

    // Shared drag-pan handler for fullscreen charts; wheel scrolling stays available.
    const attachInteraction = (chart: Highcharts.Chart) => {
      const listeners = new AbortController();
      let isDragging = false;
      let dragMode: "pan" | "scale-x" | "scale-y" | null = null;
      let dragStartX = 0, dragStartY = 0;
      let dxMin = 0, dxMax = 0, dyMin = 0, dyMax = 0;
      let xAnchorRatio = 0.5, yAnchorRatio = 0.5;
      let zoomFrame = 0;
      let pendingZoomDelta = 0;
      let zoomAnchorRatio = 0.5;

      // Zoom the time axis with the wheel, keeping the point under the pointer fixed.
      const handleWheelZoom = (event: WheelEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".chart-range-dropdown")) return;
        const point = chart.pointer.normalize(event);
        const insidePlot = chart.isInsidePlot(
          point.chartX - chart.plotLeft,
          point.chartY - chart.plotTop
        );
        const xAxis = chart.xAxis[0];
        const extremes = xAxis?.getExtremes();
        if (
          insidePlot &&
          xAxis &&
          typeof extremes?.min === "number" &&
          typeof extremes.max === "number" &&
          typeof extremes.dataMin === "number" &&
          typeof extremes.dataMax === "number"
        ) {
          const fullRange = extremes.dataMax - extremes.dataMin;
          const currentRange = extremes.max - extremes.min;
          if (fullRange > 0 && currentRange > 0 && chart.plotWidth > 0) {
            const rawDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
              ? event.deltaY * 16
              : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                ? event.deltaY * chart.plotHeight
                : event.deltaY;
            event.preventDefault();
            pendingZoomDelta = Math.max(-600, Math.min(600, pendingZoomDelta + rawDelta));
            zoomAnchorRatio = Math.max(0, Math.min(1, (point.chartX - chart.plotLeft) / chart.plotWidth));
            if (!zoomFrame) {
              zoomFrame = window.requestAnimationFrame(() => {
                zoomFrame = 0;
                const latest = xAxis.getExtremes();
                const delta = pendingZoomDelta;
                pendingZoomDelta = 0;
                if (typeof latest.min !== "number" || typeof latest.max !== "number"
                  || typeof latest.dataMin !== "number" || typeof latest.dataMax !== "number") return;
                const latestRange = latest.max - latest.min;
                const latestFullRange = latest.dataMax - latest.dataMin;
                if (latestRange <= 0 || latestFullRange <= 0) return;
                // Keep zoom-out bounded, but include some empty time around sparse candle data.
                const nextRange = Math.max(latestFullRange / 500, Math.min(latestFullRange * 4, latestRange * Math.exp(delta * 0.0012)));
                const anchor = latest.min + zoomAnchorRatio * latestRange;
                let nextMin = anchor - zoomAnchorRatio * nextRange;
                let nextMax = nextMin + nextRange;
                if (nextRange <= latestFullRange && nextMin < latest.dataMin) { nextMin = latest.dataMin; nextMax = nextMin + nextRange; }
                if (nextRange <= latestFullRange && nextMax > latest.dataMax) { nextMax = latest.dataMax; nextMin = nextMax - nextRange; }
                xAxis.setExtremes(nextMin, nextMax, false, false);
                chart.redraw(false);
              });
            }
            return;
          }
        }
        event.preventDefault();
      };
      chart.container.addEventListener("wheel", handleWheelZoom, {
        capture: true,
        passive: false,
        signal: listeners.signal,
      });

      chart.container.addEventListener("pointermove", (event: PointerEvent) => {
        if (isDragging) return;
        const point = chart.pointer.normalize(event);
        const besidePlot = point.chartX < chart.plotLeft || point.chartX > chart.plotLeft + chart.plotWidth;
        const withinPlotHeight = point.chartY >= chart.plotTop && point.chartY <= chart.plotTop + chart.plotHeight;
        const belowPlot = point.chartY > chart.plotTop + chart.plotHeight && point.chartY <= chart.plotTop + chart.plotHeight + 30;
        chart.container.style.cursor = besidePlot && withinPlotHeight
          ? "ns-resize"
          : belowPlot && point.chartX >= chart.plotLeft && point.chartX <= chart.plotLeft + chart.plotWidth
            ? "ew-resize"
            : "";
      }, { signal: listeners.signal });

      chart.container.addEventListener("pointerdown", (e: PointerEvent) => {
        if (e.button !== 0) return;
        const target = e.target instanceof Element ? e.target : null;
        if (
          target?.closest(
            ".highcharts-button, .highcharts-range-selector-group, .highcharts-navigator, .highcharts-scrollbar"
          )
        ) {
          return;
        }
        const point = chart.pointer.normalize(e);
        const insidePlot = chart.isInsidePlot(
          point.chartX - chart.plotLeft,
          point.chartY - chart.plotTop
        );
        const besidePlot = point.chartX < chart.plotLeft || point.chartX > chart.plotLeft + chart.plotWidth;
        const insidePlotHeight = point.chartY >= chart.plotTop && point.chartY <= chart.plotTop + chart.plotHeight;
        const belowPlot = point.chartY > chart.plotTop + chart.plotHeight && point.chartY <= chart.plotTop + chart.plotHeight + 30;
        const insideXAxisWidth = point.chartX >= chart.plotLeft && point.chartX <= chart.plotLeft + chart.plotWidth;
        if (!insidePlot && !(besidePlot && insidePlotHeight) && !(belowPlot && insideXAxisWidth)) {
          return;
        }
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        const xExtremes = chart.xAxis[0].getExtremes();
        dxMin = typeof xExtremes.min === "number" ? xExtremes.min : 0;
        dxMax = typeof xExtremes.max === "number" ? xExtremes.max : 1;
        const yExtremes = chart.yAxis[0].getExtremes();
        dyMin = typeof yExtremes.min === "number" ? yExtremes.min : 0;
        dyMax = typeof yExtremes.max === "number" ? yExtremes.max : 1;
        dragMode = besidePlot && insidePlotHeight ? "scale-y" : belowPlot && insideXAxisWidth ? "scale-x" : "pan";
        xAnchorRatio = Math.max(0, Math.min(1, (point.chartX - chart.plotLeft) / chart.plotWidth));
        yAnchorRatio = Math.max(0, Math.min(1, (chart.plotTop + chart.plotHeight - point.chartY) / chart.plotHeight));
        chart.container.style.cursor = dragMode === "scale-y" ? "ns-resize" : dragMode === "scale-x" ? "ew-resize" : "grabbing";
        chart.container.classList.add('dragging');
        e.preventDefault();
      }, { signal: listeners.signal });
      document.addEventListener("pointermove", (e: PointerEvent) => {
        if (!isDragging) return;
        if (dragMode === "scale-y") {
          const startRange = dyMax - dyMin;
          if (startRange <= 0) return;
          const scale = Math.max(0.1, Math.min(10, Math.exp((e.clientY - dragStartY) / 180)));
          const nextRange = startRange * scale;
          const anchor = dyMin + yAnchorRatio * startRange;
          const min = anchor - yAnchorRatio * nextRange;
          chart.yAxis[0].setExtremes(min, min + nextRange, true, false);
          return;
        }
        if (dragMode === "scale-x") {
          const startRange = dxMax - dxMin;
          if (startRange <= 0) return;
          const scale = Math.max(0.1, Math.min(10, Math.exp((e.clientX - dragStartX) / 180)));
          const nextRange = startRange * scale;
          const anchor = dxMin + xAnchorRatio * startRange;
          const min = anchor - xAnchorRatio * nextRange;
          chart.xAxis[0].setExtremes(min, min + nextRange, true, false);
          return;
        }
        const xShift = -((e.clientX - dragStartX) / chart.plotWidth)  * (dxMax - dxMin);
        const yShift =  ((e.clientY - dragStartY) / chart.plotHeight) * (dyMax - dyMin);
        chart.xAxis[0].setExtremes(dxMin + xShift, dxMax + xShift, false, false);
        chart.yAxis[0].setExtremes(dyMin + yShift, dyMax + yShift, false, false);
        chart.redraw(false);
      }, { signal: listeners.signal });
      const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        dragMode = null;
        chart.container.style.cursor = '';
        chart.container.classList.remove('dragging');
      };
      document.addEventListener("pointerup", endDrag, { signal: listeners.signal });
      document.addEventListener("pointercancel", endDrag, { signal: listeners.signal });

      
      chart.container.addEventListener('dblclick', () => {
        chart.xAxis[0].setExtremes(undefined, undefined, false);
        chart.yAxis[0].setExtremes(undefined, undefined, true);
      }, { signal: listeners.signal });
      // `container` is the generated chart element; its parent is the
      // render target whose height controls the fullscreen chart.
      const chartBody = chart.container.parentElement;
      if (chartBody && typeof ResizeObserver !== "undefined") {
        const fitChartToBody = () => {
          const height = chartBody!.clientHeight;
          if (height > 0 && chart.chartHeight !== height) {
            chart.setSize(undefined, height, false);
          }
        };
        const observer = new ResizeObserver(fitChartToBody);
        observer.observe(chartBody!);
        fitChartToBody();
        listeners.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
      }
      Highcharts.addEvent(chart, "destroy", () => {
        listeners.abort();
        if (zoomFrame) window.cancelAnimationFrame(zoomFrame);
      });
    };

    // The standard Highcharts renderer used for Classic charts does not
    // provide Stock's built-in crosshair label, so render an equivalent badge.
    const attachClassicValueLabel = (chart: Highcharts.Chart) => {
      const axis = chart.yAxis[0];
      let label: Highcharts.SVGElement | undefined;

      const hideLabel = () => label?.hide();
      const updateLabel = (event: MouseEvent) => {
        const point = chart.pointer.normalize(event);
        const withinPlot = chart.isInsidePlot(
          point.chartX - chart.plotLeft,
          point.chartY - chart.plotTop
        );

        if (!withinPlot) {
          hideLabel();
          return;
        }

        const value = axis.toValue(point.chartY);
        const text = `₹${Math.round(value).toLocaleString("en-IN")}`;

        if (!label) {
          label = chart.renderer
            .label(text, 0, 0, "callout")
            .attr({
              fill: "#2563eb",
              stroke: "#60a5fa",
              "stroke-width": 1,
              padding: 6,
              r: 4,
              zIndex: 8,
            })
            .css({ color: "#ffffff", fontSize: "11px", fontWeight: "700" })
            .add();
        }

        label.attr({ text }).show();
        const box = label.getBBox();
        const x = Math.min(
          chart.plotLeft + chart.plotWidth + 10,
          chart.chartWidth - box.width - 10
        );
        const y = Math.max(
          chart.plotTop,
          Math.min(point.chartY - box.height / 2, chart.plotTop + chart.plotHeight - box.height)
        );
        label.attr({ x, y });
      };

      chart.container.addEventListener("mousemove", updateLabel);
      chart.container.addEventListener("mouseleave", hideLabel);
    };

    return {
      ...selectedOptions,
      tooltip: { ...selectedOptions.tooltip, enabled: chartMode !== "candlestick" },
      ...(chartMode === "candlestick" ? {
        plotOptions: {
          ...selectedOptions.plotOptions,
          candlestick: {
            ...selectedOptions.plotOptions?.candlestick,
            states: {
              ...selectedOptions.plotOptions?.candlestick?.states,
              hover: { enabled: true },
            },
          },
        },
      } : {}),
      chart: {
        ...selectedOptions.chart,
        // The dashboard chart has a compact fixed height; in fullscreen let
        // Highcharts measure the full-size container instead.
        height: null,
        // Candlestick charts need extra room at the right edge so the final
        // candle cannot run underneath the opposite-axis value labels.
        spacing: fullscreenSpacing,
        zoomType: undefined,
        panning: { enabled: false },
        zooming: { mouseWheel: { enabled: false } },
        resetZoomButton: { theme: { display: "none" } },
        events: {
          ...selectedOptions.chart?.events,
          load: function(this: Highcharts.Chart) {
            fitFullscreenChart(this);
            attachInteraction(this);
            if (chartMode === "classic") {
              attachClassicValueLabel(this);
            }
          }
        },
      },
      ...(chartMode === "candlestick" ? {
        navigator: {
          ...selectedOptions.navigator,
          enabled: true,
          liveRedraw: true,
        },
        scrollbar: {
          ...selectedOptions.scrollbar,
          enabled: true,
          height: 12,
          liveRedraw: true,
          barBackgroundColor: "rgba(59, 130, 246, 0.35)",
          barBorderColor: "rgba(96, 165, 250, 0.8)",
          buttonBackgroundColor: "#151922",
          buttonBorderColor: "#3b82f6",
          rifleColor: "#bfdbfe",
          trackBackgroundColor: "rgba(15, 23, 42, 0.8)",
          trackBorderColor: "rgba(96, 165, 250, 0.35)",
        },
      } : {}),
      xAxis: fullscreenXAxis,
      yAxis: fullscreenYAxis,
    };
  }, [chartMode, highchartsOptions, stockOptions]);

  const fullscreenEchartsOption = useMemo(() => {
    if (!echartsOption) {
      return undefined;
    }

    const xAxis = echartsOption.xAxis as
      | { type?: string }
      | undefined;

    const hasTimeAxis = xAxis?.type === "time" || xAxis?.type === "category";
    const grid = (echartsOption.grid as Record<string, unknown> | undefined) ?? {};
    const legend = (echartsOption.legend as Record<string, unknown> | undefined) ?? {};
    const yAxis = echartsOption.yAxis;
    const yAxisIndexes = Array.isArray(yAxis)
      ? yAxis.map((_, index) => index)
      : yAxis
        ? [0]
        : [];
    const echartsYAxes = Array.isArray(yAxis) ? yAxis : yAxis ? [yAxis] : [];
    const hasRightEchartsYAxis = echartsYAxes.some((axis) => {
      if (!axis || typeof axis !== "object") return false;
      const position = (axis as Record<string, unknown>).position;
      return position === "right" || (axis as Record<string, unknown>).opposite === true;
    });
    const enableAxisPointer = (axis: unknown): unknown => {
      if (Array.isArray(axis)) return axis.map(enableAxisPointer);
      if (!axis || typeof axis !== "object") return axis;

      const axisOptions = axis as Record<string, unknown>;
      const axisPointer = (axisOptions.axisPointer as Record<string, unknown> | undefined) ?? {};
      return {
        ...axisOptions,
        axisPointer: {
          ...axisPointer,
          show: true,
          label: {
            ...((axisPointer.label as Record<string, unknown> | undefined) ?? {}),
            show: true,
          },
        },
      };
    };
    const dataZoom: Record<string, unknown>[] = [];

    if (hasTimeAxis) {
      dataZoom.push({
        type: "inside",
        xAxisIndex: 0,
        start: getEchartsRangeStart(echartsOption, rangeSelection),
        end: 100,
        zoomOnMouseWheel: false,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      });
    }
    if (yAxisIndexes.length) {
      dataZoom.push({
        type: "inside",
        yAxisIndex: yAxisIndexes,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      });
    }

    const tooltip = (echartsOption.tooltip as Record<string, unknown> | undefined) ?? {};
    const tooltipAxisPointer = (tooltip.axisPointer as Record<string, unknown> | undefined) ?? {};

    return {
      ...echartsOption,
      ...(hasTimeAxis || yAxisIndexes.length ? {
        tooltip: {
          ...tooltip,
          show: true,
          trigger: "axis",
          axisPointer: {
            ...tooltipAxisPointer,
            show: true,
            type: "cross",
          },
        },
        ...(hasTimeAxis ? { xAxis: enableAxisPointer(xAxis) } : {}),
        ...(yAxisIndexes.length ? { yAxis: enableAxisPointer(yAxis) } : {}),
      } : {}),
      grid: {
        ...grid,
        containLabel: grid.containLabel ?? true,
        ...(hasTimeAxis ? { bottom: Math.max(typeof grid.bottom === "number" ? grid.bottom : 0, 88) } : {}),
        ...(hasRightEchartsYAxis ? { right: Math.max(typeof grid.right === "number" ? grid.right : 0, 64) } : {}),
      },
      ...(hasTimeAxis ? {
        legend: { ...legend, top: undefined, bottom: 8 },
      } : {}),
      dataZoom,
    };
  }, [echartsOption, rangeSelection]);

  const candleYAxisOptions = Array.isArray(stockOptions?.yAxis) ? stockOptions?.yAxis[0] : stockOptions?.yAxis;
  const formatCandleValue = (value: number) => {
    const formatter = candleYAxisOptions?.labels?.formatter;
    if (typeof formatter !== "function") return Highcharts.numberFormat(value, 0);
    const context = { value } as Highcharts.AxisLabelsFormatterContextObject;
    return formatter.call(context, context);
  };

  useEffect(() => {
    if (!open || !fullscreenHighchartsOptions) return;

    const frame = window.requestAnimationFrame(() => {
      const chart = chartRef.current?.chart;
      const sourceOptions = stockOptions ?? highchartsOptions;
      const appliedCandleInterval = chartMode === "candlestick"
        && applyCandleInterval(chart, sourceOptions, candleIntervalSelection);
      if (!appliedCandleInterval) applyChartRange(chart, rangeSelection);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [candleIntervalSelection, chartMode, fullscreenHighchartsOptions, highchartsOptions, open, rangeSelection, stockOptions]);

  useEffect(() => {
    if (!open || chartMode !== "candlestick") {
      setCandleReadout(null);
      return;
    }

    let detachListener = () => {};
    const frame = window.requestAnimationFrame(() => {
      const chart = chartRef.current?.chart;
      const candleSeries = chart?.series.find((series) => series.type === "candlestick");
      if (!chart || !candleSeries) return;
      // Highcharts can clear chart.container while React is tearing down the
      // old chart during a Classic/Candlestick switch. Keep the DOM node that
      // received the listener so cleanup remains safe after chart destruction.
      const chartContainer = chart.container;

      const latestPoint = [...candleSeries.points].reverse().find((point) => getCandleReadout(point));
      setCandleReadout(getCandleReadout(latestPoint));

      const updateReadout = (event: MouseEvent) => {
        const pointer = chart.pointer.normalize(event);
        if (!chart.isInsidePlot(pointer.chartX - chart.plotLeft, pointer.chartY - chart.plotTop)) return;
        const nextReadout = getCandleReadout(candleSeries.searchPoint(pointer, true));
        if (nextReadout) setCandleReadout((current) => current?.x === nextReadout.x ? current : nextReadout);
      };

      chartContainer.addEventListener("mousemove", updateReadout);
      detachListener = () => chartContainer.removeEventListener("mousemove", updateReadout);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      detachListener();
    };
  }, [candleIntervalSelection, chartMode, fullscreenHighchartsOptions, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const triggerResize = () => {
      window.dispatchEvent(new Event("resize"));
    };

    window.requestAnimationFrame(triggerResize);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeModal, open]);

  useEffect(() => {
    if (!open || kind !== "echarts" || !echartsOption) return;
    const host = echartsHostRef.current;
    if (!host) return;

    type ZoomRange = { index: number; start: number; end: number };
    let drag: {
      mode: "pan" | "scale-y";
      startX: number;
      startY: number;
      min: number;
      max: number;
      anchorRatio: number;
      plotWidth: number;
      plotHeight: number;
      xZoom?: ZoomRange;
      yZoom?: ZoomRange;
    } | null = null;
    let pendingPointer: { clientX: number; clientY: number } | null = null;
    let dragFrame = 0;
    const isOverValueAxis = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      return event.clientX >= bounds.right - 62 && event.clientX <= bounds.right
        && event.clientY >= bounds.top + 10 && event.clientY <= bounds.bottom - 88;
    };
    const isInsidePlot = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      return event.clientX >= bounds.left + 48 && event.clientX <= bounds.right - 62
        && event.clientY >= bounds.top + 10 && event.clientY <= bounds.bottom - 88;
    };
    const getYAxisExtent = () => {
      const instance = echartsInstanceRef.current;
      if (!instance) return null;
      try {
        const model = (instance as unknown as { getModel: () => {
          getComponent: (type: string, index: number) => {
            axis?: { scale?: { getExtent: () => [number, number] } };
          };
        } }).getModel();
        const extent = model.getComponent("yAxis", 0)?.axis?.scale?.getExtent();
        if (extent && extent.every(Number.isFinite) && extent[1] > extent[0]) return extent;
      } catch {
        // Fall back to the visible series data if ECharts has no initialized axis model yet.
      }

      const option = instance.getOption() as unknown as {
        yAxis?: Array<{ min?: number; max?: number }> | { min?: number; max?: number };
        series?: Array<{ data?: Array<number | [unknown, number] | { value?: [unknown, number] }> }>;
      };
      const axis = Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis;
      if (typeof axis?.min === "number" && typeof axis.max === "number" && axis.max > axis.min) {
        return [axis.min, axis.max] as [number, number];
      }
      const values = (option.series ?? []).flatMap((series) => (series.data ?? []).map((point) => {
        if (typeof point === "number") return point;
        if (Array.isArray(point)) return Number(point[1]);
        return Number(point.value?.[1]);
      })).filter(Number.isFinite);
      if (!values.length) return null;
      const dataMin = Math.min(...values);
      const dataMax = Math.max(...values);
      const padding = (dataMax - dataMin) * 0.15 || Math.max(Math.abs(dataMax) * 0.15, 1);
      return [Math.min(0, dataMin - padding), dataMax + padding];
    };
    const getAxisZoomRanges = () => {
      const instance = echartsInstanceRef.current;
      if (!instance) return {};
      const option = instance.getOption() as unknown as {
        dataZoom?: Array<{ xAxisIndex?: number | number[]; yAxisIndex?: number | number[]; start?: number; end?: number }>;
      };
      const zooms = option.dataZoom ?? [];
      const xIndex = zooms.findIndex((zoom) => zoom.xAxisIndex !== undefined);
      const rangeAt = (index: number): ZoomRange | undefined => {
        if (index < 0) return undefined;
        const zoom = zooms[index];
        return { index, start: zoom.start ?? 0, end: zoom.end ?? 100 };
      };
      return { xZoom: rangeAt(xIndex) };
    };
    const applyDragMove = (clientX: number, clientY: number) => {
      const instance = echartsInstanceRef.current;
      if (!instance || !drag) return;
      if (drag.mode === "pan") {
        const shiftRange = (range: ZoomRange, distance: number, size: number, direction: number) => {
          const span = range.end - range.start;
          const shift = direction * distance / Math.max(1, size) * span;
          const start = Math.max(0, Math.min(100 - span, range.start + shift));
          instance.dispatchAction({ type: "dataZoom", dataZoomIndex: range.index, start, end: start + span });
        };
        if (drag.xZoom) shiftRange(drag.xZoom, clientX - drag.startX, drag.plotWidth, -1);
        const yShift = (clientY - drag.startY) / Math.max(1, drag.plotHeight) * (drag.max - drag.min);
        instance.setOption({ yAxis: { min: drag.min + yShift, max: drag.max + yShift } }, { lazyUpdate: true, silent: true });
        return;
      }
      const startRange = drag.max - drag.min;
      const scale = Math.max(0.1, Math.min(10, Math.exp((clientY - drag.startY) / 180)));
      const nextRange = startRange * scale;
      const anchor = drag.min + drag.anchorRatio * startRange;
      const min = anchor - drag.anchorRatio * nextRange;
      instance.setOption({ yAxis: { min, max: min + nextRange } }, { lazyUpdate: true, silent: true });
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag) {
        const bounds = host.getBoundingClientRect();
        const point: [number, number] = [event.clientX - bounds.left, event.clientY - bounds.top];
        host.style.cursor = isOverValueAxis(event)
          ? "ns-resize"
          : echartsInstanceRef.current?.containPixel({ gridIndex: 0 }, point) ? "grab" : "";
        return;
      }
      pendingPointer = { clientX: event.clientX, clientY: event.clientY };
      event.preventDefault();
      if (!dragFrame) {
        dragFrame = window.requestAnimationFrame(() => {
          dragFrame = 0;
          const latestPointer = pendingPointer;
          pendingPointer = null;
          if (latestPointer) applyDragMove(latestPointer.clientX, latestPointer.clientY);
        });
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const instance = echartsInstanceRef.current;
      if (!instance) return;
      const bounds = host.getBoundingClientRect();
      if (isOverValueAxis(event)) {
        const extent = getYAxisExtent();
        if (!extent) return;
        const anchorRatio = Math.max(0, Math.min(1, (bounds.bottom - event.clientY) / bounds.height));
        drag = {
          mode: "scale-y",
          startX: event.clientX,
          startY: event.clientY,
          min: extent[0],
          max: extent[1],
          anchorRatio,
          plotWidth: 0,
          plotHeight: bounds.height,
        };
        host.style.cursor = "ns-resize";
      } else if (isInsidePlot(event)) {
        const { xZoom } = getAxisZoomRanges();
        const extent = getYAxisExtent() ?? [0, 1];
        drag = {
          mode: "pan",
          startX: event.clientX,
          startY: event.clientY,
          min: extent[0],
          max: extent[1],
          anchorRatio: 0.5,
          plotWidth: bounds.width - 110,
          plotHeight: bounds.height - 98,
          xZoom,
        };
        host.style.cursor = "grabbing";
      } else {
        return;
      }
      host.classList.add("chart-dragging");
      try { host.setPointerCapture(event.pointerId); } catch { /* Capture may be unavailable during teardown. */ }
      event.preventDefault();
      event.stopPropagation();
    };
    const endDrag = () => {
      drag = null;
      pendingPointer = null;
      if (dragFrame) window.cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      host.classList.remove("chart-dragging");
      host.style.cursor = "";
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (!isOverValueAxis(event as unknown as PointerEvent)) return;
      echartsInstanceRef.current?.setOption({ yAxis: { min: "dataMin", max: "dataMax" } });
    };

    host.addEventListener("pointerdown", onPointerDown, true);
    host.addEventListener("dblclick", onDoubleClick);
    // Pointer capture keeps drag events flowing through document, so a second
    // host listener would process every drag move twice and make panning lag.
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);
    return () => {
      drag = null;
      pendingPointer = null;
      if (dragFrame) window.cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      host.classList.remove("chart-dragging");
      host.style.cursor = "";
      host.removeEventListener("pointerdown", onPointerDown, true);
      host.removeEventListener("dblclick", onDoubleClick);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", endDrag);
      document.removeEventListener("pointercancel", endDrag);
      echartsInstanceRef.current = null;
    };
  }, [echartsOption, kind, open]);

  const resetChartView = useCallback(() => {
    if (kind === "echarts") {
      const instance = echartsInstanceRef.current;
      if (!instance || !fullscreenEchartsOption) return;
      instance.clear();
      instance.setOption(fullscreenEchartsOption);
      instance.resize();
      return;
    }

    const chart = chartRef.current?.chart;
    if (!chart || !chart.container) return;
    const sourceOptions = chartMode === "candlestick"
      ? stockOptions ?? highchartsOptions
      : highchartsOptions;
    if (chartMode === "candlestick") {
      applyCandleInterval(chart, sourceOptions, candleIntervalSelection);
    } else {
      applyChartRange(chart, rangeSelection);
    }
    chart.yAxis.forEach((axis) => axis.setExtremes(undefined, undefined, false, false));
    chart.redraw(false);
  }, [candleIntervalSelection, chartMode, fullscreenEchartsOption, highchartsOptions, kind, rangeSelection, stockOptions]);

  if (!open) {
    return null;
  }

  return createPortal((
    <div
      className="modal-overlay chart-fullscreen-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeModal();
        }
      }}
    >
      <div className="chart-fullscreen-modal">
        <div className="chart-fullscreen-header">
          <div>
            <span className="eyebrow">CHART VIEW</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <div className="chart-fullscreen-actions">
            {(kind === "highcharts" || kind === "stock") && (
              <div className="chart-view-toggle">
                <button
                  type="button"
                  className={
                    chartMode === "classic"
                      ? "chart-view-toggle-button active"
                      : "chart-view-toggle-button"
                  }
                  onClick={() => setChartMode("classic")}
                >
                  <LineChart size={14} />
                  Classic
                </button>

                <button
                  type="button"
                  className={
                    chartMode === "candlestick"
                      ? "chart-view-toggle-button active"
                      : "chart-view-toggle-button"
                  }
                  onClick={() => setChartMode("candlestick")}
                >
                  <ChartCandlestick size={14} />
                  Candlestick
                </button>
              </div>
            )}

            <button
              type="button"
              className="close-button"
              onClick={closeModal}
              aria-label="Close fullscreen chart"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <div className="chart-fullscreen-body">
          {(fullscreenHighchartsOptions || fullscreenEchartsOption) && (
            <div className="chart-toolbar-controls">
              <label className="chart-range-dropdown">
                <span>{chartMode === "candlestick" ? "Interval" : "Range"}</span>
                <select
                  value={chartMode === "candlestick" ? candleIntervalSelection : rangeSelection}
                  aria-label={chartMode === "candlestick" ? "Candle interval" : "Chart date range"}
                  onChange={(event) => {
                    const index = Number(event.target.value);
                    if (chartMode === "candlestick") setCandleIntervalSelection(index);
                    else setRangeSelection(index);
                  }}
                >
                  {chartRangeOptions.map((option, index) => (
                    <option key={`${option.type}-${option.count}`} value={index}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="chart-reset-view-button" onClick={resetChartView}>
                <RotateCcw size={14} />
                <span>Reset view</span>
              </button>
            </div>
          )}
          {chartMode === "candlestick" && candleReadout && (
            <div className="chart-candle-readout" aria-label="Selected candle values">
              <time dateTime={new Date(candleReadout.x).toISOString()}>
                {new Date(candleReadout.x).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
              </time>
              <div className="chart-candle-readout-values">
                <span>Open <strong>{formatCandleValue(candleReadout.open)}</strong></span>
                <span>Low <strong className="low">{formatCandleValue(candleReadout.low)}</strong></span>
                <span>High <strong className="high">{formatCandleValue(candleReadout.high)}</strong></span>
                <span>Close <strong className={candleReadout.close >= candleReadout.open ? "high" : "low"}>{formatCandleValue(candleReadout.close)}</strong></span>
              </div>
            </div>
          )}
          {chartMode === "classic" && fullscreenHighchartsOptions ? (
            <HighchartsChart
              ref={chartRef}
              key="fullscreen-classic-chart"
              highcharts={Highcharts}
              constructorType="chart"
              allowChartUpdate={false}
              options={fullscreenHighchartsOptions}
              containerProps={{
                style: {
                  width: "100%",
                  height: "100%",
                },
              }}
            />
          ) : chartMode === "candlestick" && fullscreenHighchartsOptions ? (
            <HighchartsChart
              key="fullscreen-candlestick-chart"
              ref={chartRef}
              highcharts={
                chartMode === "candlestick"
                  ? HighchartsStock
                  : Highcharts
              }
              constructorType={
                chartMode === "candlestick" ? "stockChart" : "chart"
              }
              allowChartUpdate={false}
              options={fullscreenHighchartsOptions}
              containerProps={{
                style: {
                  width: "100%",
                  height: "100%",
                },
              }}
            />
          ) : echartsOption ? (
            <div ref={echartsHostRef} className="fullscreen-echarts-host" style={{ width: "100%", height: "100%" }}>
              <EChartsChart
                option={fullscreenEchartsOption}
                onChartReady={(instance) => { echartsInstanceRef.current = instance; }}
                style={{ width: "100%", height: "100%" }}
                notMerge
                lazyUpdate
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  ), document.body);
};

export default ChartFullscreenModal;
