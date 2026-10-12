import { useEffect, useMemo, useRef, useState } from "react";
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
  const chartBodyRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(420);
  const [chartMode, setChartMode] =
    useState<ChartMode>(defaultChartMode);

  useEffect(() => {
    if (!open || !chartBodyRef.current) return;

    const body = chartBodyRef.current;
    const updateChartHeight = () => {
      setChartHeight(Math.max(280, Math.floor(body.getBoundingClientRect().height)));
    };
    const observer = new ResizeObserver(updateChartHeight);
    observer.observe(body);
    updateChartHeight();

    return () => observer.disconnect();
  }, [open]);

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

    // Shared drag-pan handler for fullscreen charts; wheel scrolling stays available.
    const attachInteraction = (chart: Highcharts.Chart) => {
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
      });
      document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        const xShift = -((e.clientX - dragStartX) / chart.plotWidth)  * (dxMax - dxMin);
        const yShift =  ((e.clientY - dragStartY) / chart.plotHeight) * (dyMax - dyMin);
        chart.xAxis[0].setExtremes(dxMin + xShift, dxMax + xShift, false);
        chart.yAxis[0].setExtremes(dyMin + yShift, dyMax + yShift, true);
      });
      document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        chart.container.style.cursor = 'crosshair';
      });
      chart.container.addEventListener('dblclick', () => {
        chart.xAxis[0].setExtremes(undefined, undefined, false);
        chart.yAxis[0].setExtremes(undefined, undefined, true);
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
      chart: {
        ...selectedOptions.chart,
        height: chartHeight,
        spacing: [12, 24, 20, 12],
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
    };
  }, [chartHeight, chartMode, highchartsOptions, stockOptions]);

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
    document.body.style.overflow = "hidden";
    const triggerResize = () => {
      window.dispatchEvent(new Event("resize"));
    };

    window.requestAnimationFrame(triggerResize);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(triggerResize);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-overlay chart-fullscreen-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
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
              onClick={onClose}
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <div className="chart-fullscreen-body" ref={chartBodyRef}>
          {chartMode === "classic" && fullscreenHighchartsOptions ? (
            <HighchartsChart
              highcharts={Highcharts}
              constructorType="chart"
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
              highcharts={
                chartMode === "candlestick"
                  ? HighchartsStock
                  : Highcharts
              }
              constructorType={
                chartMode === "candlestick" ? "stockChart" : "chart"
              }
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
                height: `${chartHeight}px`,
              }}
              notMerge
              lazyUpdate
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ChartFullscreenModal;
