import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChartCandlestick, LineChart, X } from "lucide-react";
import Highcharts from "highcharts";
import HighchartsStock from "highcharts/highstock";
import HighchartsReact from "highcharts-react-official";
import type { HighchartsReactRefObject } from "highcharts-react-official";
import ReactECharts from "echarts-for-react";

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
    const timestamp = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
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
  const restorePageRef = useRef<(() => void) | null>(null);
  const chartRef = useRef<HighchartsReactRefObject>(null);
  const [rangeSelection, setRangeSelection] = useState(9);
  const [chartMode, setChartMode] =
    useState<ChartMode>(defaultChartMode);
  const closeModal = useCallback(() => {
    restorePageRef.current?.();
    restorePageRef.current = null;
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setChartMode(defaultChartMode);
      setRangeSelection(9);
    }
  }, [defaultChartMode, open, title]);

  useEffect(() => {
    setRangeSelection(9);
  }, [chartMode]);

  const fullscreenHighchartsOptions = useMemo(() => {
    const selectedOptions =
      chartMode === "candlestick"
        ? stockOptions ?? highchartsOptions
        : highchartsOptions;

    if (!selectedOptions) {
      return undefined;
    }

    const addCandlestickEndPadding = (axis: Highcharts.XAxisOptions): Highcharts.XAxisOptions => ({
      ...axis,
      ...(chartMode === "candlestick" ? { maxPadding: Math.max(axis.maxPadding ?? 0, 0.14) } : {}),
    });
    const shiftCandlestickAxisLabels = (axis: Highcharts.YAxisOptions): Highcharts.YAxisOptions => ({
      ...axis,
      ...(chartMode === "candlestick"
        ? { labels: { ...axis.labels, x: Math.max(axis.labels?.x ?? 0, 48) } }
        : {}),
    });
    const fullscreenXAxis = Array.isArray(selectedOptions.xAxis)
      ? selectedOptions.xAxis.map(addCandlestickEndPadding)
      : selectedOptions.xAxis
        ? addCandlestickEndPadding(selectedOptions.xAxis)
        : undefined;
    const fullscreenYAxis = Array.isArray(selectedOptions.yAxis)
      ? selectedOptions.yAxis.map(shiftCandlestickAxisLabels)
      : selectedOptions.yAxis
        ? shiftCandlestickAxisLabels(selectedOptions.yAxis)
        : undefined;

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
      // Charts are display-only: leave pointer, wheel, and drag events to the page.
      return;

      const listeners = new AbortController();
      let isDragging = false;
      let dragStartX = 0, dragStartY = 0;
      let dxMin = 0, dxMax = 0, dyMin = 0, dyMax = 0;

      // Keep page scrolling available while the pointer is over the plot.
      const forwardWheelToPage = (event: WheelEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".chart-range-dropdown")) return;
        event.preventDefault();
        window.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: "auto" });
      };
      chart.container.addEventListener("wheel", forwardWheelToPage, {
        capture: true,
        passive: false,
        signal: listeners.signal,
      });

      chart.container.addEventListener('mousedown', (e: MouseEvent) => {
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
        if (!chart.isInsidePlot(point.chartX - chart.plotLeft, point.chartY - chart.plotTop)) {
          return;
        }
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        dxMin = typeof chart.xAxis[0].min === 'number' ? chart.xAxis[0].min : 0;
        dxMax = typeof chart.xAxis[0].max === 'number' ? chart.xAxis[0].max : 1;
        dyMin = typeof chart.yAxis[0].min === 'number' ? chart.yAxis[0].min : 0;
        dyMax = typeof chart.yAxis[0].max === 'number' ? chart.yAxis[0].max : 1;
        chart.container.style.cursor = 'grabbing';
        chart.container.classList.add('dragging');
        e.preventDefault();
      }, { signal: listeners.signal });
      document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        const xShift = -((e.clientX - dragStartX) / chart.plotWidth)  * (dxMax - dxMin);
        const yShift =  ((e.clientY - dragStartY) / chart.plotHeight) * (dyMax - dyMin);
        chart.xAxis[0].setExtremes(dxMin + xShift, dxMax + xShift, false);
        chart.yAxis[0].setExtremes(dyMin + yShift, dyMax + yShift, true);
      }, { signal: listeners.signal });
      document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        chart.container.style.cursor = 'pointer';
        chart.container.classList.remove('dragging');
      }, { signal: listeners.signal });
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
      Highcharts.addEvent(chart, "destroy", () => listeners.abort());
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

    void attachClassicValueLabel;

    return {
      ...selectedOptions,
      chart: {
        ...selectedOptions.chart,
        // The dashboard chart has a compact fixed height; in fullscreen let
        // Highcharts measure the full-size container instead.
        height: null,
        // Candlestick charts need extra room at the right edge so the final
        // candle cannot run underneath the opposite-axis value labels.
        spacing: chartMode === "candlestick" ? [12, 92, 20, 12] : [12, 24, 20, 12],
        zoomType: undefined,
        panning: { enabled: false },
        zooming: { mouseWheel: { enabled: false } },
        resetZoomButton: { theme: { display: "none" } },
        events: {
          ...selectedOptions.chart?.events,
          load: function(this: Highcharts.Chart) {
            fitFullscreenChart(this);
            attachInteraction(this);
            if (chartMode === "candlestick") {
              const candleSeries = this.series.find((series) => series.type === "candlestick");
              candleSeries?.points.forEach((point, index) => {
                const candleGraphic = point.graphic?.element;
                if (!candleGraphic) return;

                candleGraphic.animate(
                  [{ opacity: 0 }, { opacity: 1 }],
                  {
                    duration: 180,
                    delay: index * 28,
                    easing: "ease-out",
                    fill: "both",
                  }
                );
              });
            }
          }
        },
      },
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

    if (xAxis?.type !== "time" && xAxis?.type !== "category") {
      return echartsOption;
    }

    const grid = (echartsOption.grid as Record<string, unknown> | undefined) ?? {};
    const legend = (echartsOption.legend as Record<string, unknown> | undefined) ?? {};

    return {
      ...echartsOption,
      grid: {
        ...grid,
        bottom: 88,
      },
      legend: {
        ...legend,
        top: undefined,
        bottom: 8,
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          start: getEchartsRangeStart(echartsOption, rangeSelection),
          end: 100,
          zoomOnMouseWheel: false,
          moveOnMouseMove: false,
          moveOnMouseWheel: false,
        },
      ],
    };
  }, [echartsOption, rangeSelection]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousScrollY = window.scrollY;
    const restorePage = () => {
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, previousScrollY);
    };
    restorePageRef.current = restorePage;
    document.body.style.overflow = "hidden";
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
      restorePage();
      if (restorePageRef.current === restorePage) restorePageRef.current = null;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeModal, open]);

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
            <label className="chart-range-dropdown">
              <span>Range</span>
              <select
                value={rangeSelection}
                aria-label="Chart date range"
                onChange={(event) => {
                  const index = Number(event.target.value);
                  if (fullscreenHighchartsOptions) {
                    applyChartRange(chartRef.current?.chart, index);
                  }
                  setRangeSelection(index);
                }}
              >
                {chartRangeOptions.map((option, index) => (
                  <option key={`${option.type}-${option.count}`} value={index}>{option.label}</option>
                ))}
              </select>
            </label>
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
            <EChartsChart
              option={fullscreenEchartsOption}
              style={{
                width: "100%",
                height: "100%",
              }}
              notMerge
              lazyUpdate
            />
          ) : null}
        </div>
      </div>
    </div>
  ), document.body);
};

export default ChartFullscreenModal;
