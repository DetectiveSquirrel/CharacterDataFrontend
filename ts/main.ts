declare const Chart: any;
interface DataPoint {
  x: Date;
  y: number;
  areaName?: string;
}
interface SnapshotData {
  SnapshotTime: number;
  [key: string]: any;
}
interface DatasetToggle {
  label: string;
  color: string;
  visible: boolean;
  index: number;
}

let chartInstance: any = null;
let persistentFileHandle: FileSystemFileHandle | null = null;

const VISIBILITY_STORAGE_KEY = "datasetVisibility";

let seriesData: { [key: string]: DataPoint[] } = {};

const verticalLinePlugin = {
  id: "verticalLinePlugin",
  afterDraw(chart: any, args: any, options: any) {
    if (
      chart.tooltip &&
      chart.tooltip._active &&
      chart.tooltip._active.length
    ) {
      const ctx = chart.ctx;
      const activePoint = chart.tooltip._active[0];
      const x = activePoint.element.x;
      const yScale = chart.scales.y;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([5, 5]);
      ctx.moveTo(x, yScale.top);
      ctx.lineTo(x, yScale.bottom);
      ctx.strokeStyle = options.lineColor || "rgba(255,255,255,0.4)";
      ctx.lineWidth = options.lineWidth || 1;
      ctx.stroke();
      ctx.restore();
    }
  },
};

function saveVisibilityMap(map: { [key: string]: boolean }): void {
  localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(map));
}

function loadVisibilityMap(): { [key: string]: boolean } {
  const stored = localStorage.getItem(VISIBILITY_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Error parsing datasetVisibility:", e);
      return {};
    }
  }
  return {};
}

function processDynamicSnapshots(data: SnapshotData[]): void {
  seriesData = {};
  data.forEach((snapshot) => {
    const time = new Date(snapshot.SnapshotTime * 1000);
    const inheritedAreaName =
      snapshot.Area && snapshot.Area.Name && snapshot.Area.Level !== undefined
        ? `${snapshot.Area.Name} (${snapshot.Area.Level})`
        : undefined;
    flattenSnapshot(snapshot, time, "", inheritedAreaName);
  });
}

async function refreshFile(): Promise<void> {
  if (persistentFileHandle) {
    try {
      const file: File = await persistentFileHandle.getFile();
      readFile(file);
    } catch (error) {
      console.error("Error refreshing file:", error);
      alert("Error refreshing file. Please try re-selecting it.");
    }
  } else {
    alert(
      "No persistent file selection available. Please select a file using the button."
    );
  }
}

async function selectFileFS(): Promise<void> {
  if (!(window as any).showOpenFilePicker) {
    alert("The File System Access API is not supported in this browser.");
    return;
  }
  try {
    const [handle]: FileSystemFileHandle[] = await (
      window as any
    ).showOpenFilePicker();
    persistentFileHandle = handle;
    const file: File = await handle.getFile();
    readFile(file);
  } catch (error) {
    console.error("Error selecting file via FS API:", error);
  }
}

function readFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      let fileContent = reader.result;
      if (typeof fileContent !== "string") {
        fileContent = String(fileContent);
      }
      fileContent = fileContent.trim();
      console.log("File content (first 500 chars):", fileContent.slice(0, 500));
      const jsonData = JSON.parse(fileContent) as SnapshotData[];
      if (!Array.isArray(jsonData)) {
        alert("JSON must be an array of snapshots!");
        return;
      }
      processDynamicSnapshots(jsonData);
      renderChartDynamic();
    } catch (err) {
      alert("Error parsing JSON file!");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let r = (hash >> 0) & 0xff;
  let g = (hash >> 8) & 0xff;
  let b = (hash >> 16) & 0xff;

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const minBrightness = 130;

  if (brightness < minBrightness) {
    const factor = minBrightness / brightness;
    r = Math.min(255, Math.round(r * factor));
    g = Math.min(255, Math.round(g * factor));
    b = Math.min(255, Math.round(b * factor));
  }

  const toHex = (c: number): string => {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return "#" + toHex(r) + toHex(g) + toHex(b);
}

function flattenSnapshot(
  obj: any,
  time: Date,
  prefix: string = "",
  inheritedAreaName?: string
): void {
  let areaInfo: string | undefined = inheritedAreaName;
  if (obj.areaName && typeof obj.areaName === "string") {
    areaInfo = obj.areaName;
  } else if (obj.Name && obj.Level !== undefined) {
    areaInfo = `${obj.Name} (${obj.Level})`;
  }
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (key === "SnapshotTime") continue;
      const value = obj[key];
      const newPrefix = prefix ? `${prefix}-${key}` : key;
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        flattenSnapshot(value, time, newPrefix, areaInfo);
      } else if (typeof value === "number") {
        if (!seriesData[newPrefix]) {
          seriesData[newPrefix] = [];
        }
        seriesData[newPrefix].push({
          x: time,
          y: value,
          areaName: areaInfo,
        });
      }
    }
  }
}

function updateFieldSelector(): void {
  const fieldContainer = document.getElementById("fieldSelector");
  if (!fieldContainer || !chartInstance) return;
  fieldContainer.innerHTML = "";

  const visibilityMap = loadVisibilityMap();

  const datasetInfo: DatasetToggle[] = chartInstance.data.datasets.map(
    (dataset: any, index: number): DatasetToggle => ({
      label: dataset.label,
      color: dataset.borderColor,
      visible: chartInstance.isDatasetVisible(index),
      index: index,
    })
  );

  datasetInfo.sort((a: DatasetToggle, b: DatasetToggle) =>
    a.label.localeCompare(b.label)
  );

  datasetInfo.forEach((info: DatasetToggle) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "field-item";
    if (info.visible) {
      itemDiv.classList.add("active");
    }

    itemDiv.onclick = () => {
      const currentlyVisible = chartInstance.isDatasetVisible(info.index);
      chartInstance.setDatasetVisibility(info.index, !currentlyVisible);
      visibilityMap[info.label] = !currentlyVisible;
      saveVisibilityMap(visibilityMap);
      chartInstance.update();
      updateFieldSelector();
    };

    const colorBox = document.createElement("div");
    colorBox.className = "color-box";
    colorBox.style.backgroundColor = info.color;

    const labelSpan = document.createElement("span");
    labelSpan.className = "field-label";
    labelSpan.innerText = info.label;

    itemDiv.appendChild(colorBox);
    itemDiv.appendChild(labelSpan);
    fieldContainer.appendChild(itemDiv);
  });
}

function renderChartDynamic(): void {
  const chartContainer = document.getElementById("chartWrapper");
  if (!chartContainer) return;
  chartContainer.innerHTML = "";

  const canvas = document.createElement("canvas");
  canvas.id = "mainChart";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  chartContainer.appendChild(canvas);

  const datasets: any[] = [];
  const seriesKeys = Object.keys(seriesData);
  const visibilityMap = loadVisibilityMap();

  for (let i = 0; i < seriesKeys.length; i++) {
    const seriesKey = seriesKeys[i];
    const sortedData = seriesData[seriesKey].sort(
      (a, b) => a.x.getTime() - b.x.getTime()
    );
    const isVisible =
      typeof visibilityMap[seriesKey] !== "undefined"
        ? visibilityMap[seriesKey]
        : seriesKey === "Player-Level";

    datasets.push({
      label: seriesKey,
      data: sortedData,
      borderColor: stringToColor(seriesKey),
      backgroundColor: stringToColor(seriesKey),
      fill: false,
      tension: 0.1,
      hidden: !isVisible,
    });
  }

  let minTime = Infinity;
  let maxTime = -Infinity;
  Object.keys(seriesData).forEach((seriesKey) => {
    seriesData[seriesKey].forEach((dp) => {
      const t = dp.x.getTime();
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    });
  });

  const visibleYValues = datasets.reduce((acc: number[], ds) => {
    if (!ds.hidden) {
      return acc.concat(ds.data.map((point: DataPoint) => point.y));
    }
    return acc;
  }, [] as number[]);

  const suggestedMin =
    visibleYValues.length > 0
      ? Math.floor(Math.min(...visibleYValues))
      : undefined;
  const suggestedMax =
    visibleYValues.length > 0
      ? Math.ceil(Math.max(...visibleYValues))
      : undefined;

  const config: any = {
    type: "line",
    data: {
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      interaction: {
        mode: "nearest",
        axis: "x",
        intersect: false,
      },
      layout: {
        padding: { left: 2, right: 2, bottom: 10, top: 10 },
      },
      animation: {
        duration: 0,
      },
      scales: {
        x: {
          type: "time",
          time: {
            round: false,
            tooltipFormat: "MMM d, h:mm:ss a",
            displayFormats: {
              millisecond: "h:mm:ss a",
              second: "h:mm:ss a",
              minute: "h:mm a",
              hour: "MMM d, h:mm a",
              day: "MMM d",
              week: "MMM d",
              month: "MMM yyyy",
              quarter: "MMM yyyy",
              year: "yyyy",
            },
          },
          grid: {
            color: "rgba(238, 238, 238, 0.1)",
            drawBorder: false,
          },
          ticks: {
            color: "#eeeeee",
            maxRotation: 30,
            minRotation: 0,
            font: {
              size: 15,
              family: "system-ui, -apple-system, sans-serif",
              weight: "400",
            },
            autoSkip: true,
            autoSkipPadding: 40,
            maxTicksLimit: 20,
          },
          title: {
            display: true,
            text: "Time",
            color: "#eeeeee",
            font: {
              size: 15,
              weight: "500",
              family: "system-ui, -apple-system, sans-serif",
            },
            padding: { top: 10, bottom: 10 },
          },
          min: isFinite(minTime) ? new Date(minTime - 60 * 1000) : undefined,
          max: isFinite(maxTime) ? new Date(maxTime + 60 * 1000) : undefined,
          bounds: "ticks",
          offset: false,
          adapters: {
            date: {
              zone: "local",
            },
          },
        },
        y: {
          grid: {
            color: "rgba(238, 238, 238, 0.1)",
            drawBorder: false,
          },
          ticks: {
            color: "#eeeeee",
            font: {
              size: 14,
              family: "system-ui, -apple-system, sans-serif",
              weight: "400",
            },
            padding: 8,

            suggestedMin: suggestedMin,
            suggestedMax: suggestedMax,
          },
          title: {
            display: true,
            text: "Value",
            color: "#eeeeee",
            font: {
              size: 14,
              weight: "500",
              family: "system-ui, -apple-system, sans-serif",
            },
            padding: { top: 4, bottom: 4 },
          },
          bounds: "data",
          offset: true,
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            beforeTitle: function (tooltipItems: any): string[] {
              return [tooltipItems[0].label];
            },
            title: function (tooltipItems: any): string[] {
              for (let i = 0; i < tooltipItems.length; i++) {
                const raw = tooltipItems[i].raw;
                if (raw && raw.areaName) {
                  return [raw.areaName];
                }
              }
              return [];
            },
            label: function (tooltipItem: any): string {
              const datasetLabel = tooltipItem.dataset.label || "";
              const value = tooltipItem.parsed.y;
              const formattedValue = Number(value).toLocaleString();
              return `${datasetLabel}: ${formattedValue}`;
            },
          },
        },
        legend: {
          display: false,
        },

        zoom: {
          pan: {
            enabled: true,
            mode: "x",
            threshold: 10,
          },
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true,
            },
            mode: "x",
          },
        },
      },
    },
    plugins: [verticalLinePlugin],
  };

  if (chartInstance !== null) {
    chartInstance.destroy();
  }
  const ctx = (canvas as HTMLCanvasElement).getContext("2d");
  chartInstance = new Chart(ctx, config);

  canvas.addEventListener("mousedown", (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });
  canvas.addEventListener("mouseup", (event) => {
    if (event.button === 1 && chartInstance) {
      chartInstance.resetZoom();
    }
  });

  updateFieldSelector();
}

document.addEventListener("DOMContentLoaded", () => {
  const selectButton = document.getElementById("select-file-button");
  const refreshButton = document.getElementById("refresh-button");

  if (selectButton) {
    selectButton.addEventListener("click", () => {
      selectFileFS();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      refreshFile();
    });
  }
});
