import { useEffect, useMemo, useState } from "react";
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
  const chartHeight = Math.max(
    420,
    Math.round(window.innerHeight * 0.68)
  );
  const [chartMode, setChartMode] =
    useState<ChartMode>(defaultChartMode);

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

    // Shared pan + zoom handler for fullscreen charts
    const attachInteraction = (chart: Highcharts.Chart) => {
      let isDragging = false;
      let dragStartX = 0, dragStartY = 0;
      let dxMin = 0, dxMax = 0, dyMin = 0, dyMax = 0;

      chart.container.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
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
      chart.container.addEventListener('wheel', (e: WheelEvent) => {
        if (!chart.container.contains(e.target as Node)) return;
        e.preventDefault(); e.stopPropagation();
        const xAxis = chart.xAxis[0], yAxis = chart.yAxis[0];
        const xMin = typeof xAxis.min === 'number' ? xAxis.min : 0;
        const xMax = typeof xAxis.max === 'number' ? xAxis.max : 1;
        const yMin = typeof yAxis.min === 'number' ? yAxis.min : 0;
        const yMax = typeof yAxis.max === 'number' ? yAxis.max : 1;
        const f = e.deltaY > 0 ? 1.1 : 0.9;
        const pt = chart.pointer.normalize(e);
        const mx = xAxis.toValue(pt.chartX), my = yAxis.toValue(pt.chartY);
        const xRange = xMax - xMin, yRange = yMax - yMin;
        const xf = (mx - xMin) / xRange, yf = (my - yMin) / yRange;
        xAxis.setExtremes(mx - xRange * f * xf, mx + xRange * f * (1 - xf), false);
        yAxis.setExtremes(my - yRange * f * yf, my + yRange * f * (1 - yf), true);
      }, { passive: false });
      chart.container.addEventListener('dblclick', () => {
        chart.xAxis[0].setExtremes(undefined, undefined, false);
        chart.yAxis[0].setExtremes(undefined, undefined, true);
      });
    };

    return {
      ...selectedOptions,
      chart: {
        ...selectedOptions.chart,
        height: chartHeight,
        zoomType: undefined,
        panning: { enabled: false },
        resetZoomButton: { theme: { display: "none" } },
        events: {
          ...selectedOptions.chart?.events,
          load: function(this: Highcharts.Chart) {
            attachInteraction(this);
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

    return {
      ...echartsOption,
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: true,
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

        <div className="chart-fullscreen-body">
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
