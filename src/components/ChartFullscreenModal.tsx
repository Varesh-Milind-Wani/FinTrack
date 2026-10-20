import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChartCandlestick, LineChart, X } from "lucide-react";
import Highcharts from "highcharts";
import HighchartsStock from "highcharts/highstock";
import HighchartsReact from "highcharts-react-official";
import ReactECharts from "echarts-for-react";

const HighchartsChart =
  (HighchartsReact as unknown as {
    default?: typeof HighchartsReact;
  }).default ?? HighchartsReact;

const EChartsChart =
  (ReactECharts as unknown as {
    default?: typeof ReactECharts;
  }).default ?? ReactECharts;

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

    // Shared drag-pan handler for fullscreen charts; wheel scrolling stays available.
    const attachInteraction = (chart: Highcharts.Chart) => {
      const listeners = new AbortController();
      let isDragging = false;
      let dragStartX = 0, dragStartY = 0;
      let dxMin = 0, dxMax = 0, dyMin = 0, dyMax = 0;

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
        chart.container.style.cursor = 'crosshair';
      }, { signal: listeners.signal });
      chart.container.addEventListener('dblclick', () => {
        chart.xAxis[0].setExtremes(undefined, undefined, false);
        chart.yAxis[0].setExtremes(undefined, undefined, true);
      }, { signal: listeners.signal });
      const chartBody = chart.renderTo.parentElement;
      if (chartBody && typeof ResizeObserver !== "undefined") {
        const fitChartToBody = () => {
          const height = chartBody.clientHeight;
          if (height > 0 && chart.chartHeight !== height) {
            chart.setSize(undefined, height, false);
          }
        };
        const observer = new ResizeObserver(fitChartToBody);
        observer.observe(chartBody);
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
            attachInteraction(this);
            if (chartMode === "classic") {
              attachClassicValueLabel(this);
            } else {
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
          zoomOnMouseWheel: false,
          moveOnMouseMove: false,
          moveOnMouseWheel: false,
        },
      ],
    };
  }, [echartsOption]);

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
          {chartMode === "classic" && fullscreenHighchartsOptions ? (
            <HighchartsChart
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
