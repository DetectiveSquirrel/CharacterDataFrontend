"use strict";
/*
  Global storage for dynamic series.
  Each key is a flattened path (eg. "Player.Level"),
  and its value is an array of DataPoint.
*/
let seriesData = {};
/*
  Modified flattenSnapshot now accepts an additional optional parameter
  "inheritedAreaName". This will allow nested objects to inherit a parent’s
  area name if no new one is provided.
-----------------------------------------------------------*/
function flattenSnapshot(obj, time, prefix = "", inheritedAreaName) {
    // Start with the inherited area name from the snapshot (if provided).
    let areaInfo = inheritedAreaName;
    // If this object has an explicit "areaName" property, use it.
    // Otherwise, if it has both "Name" and "Level", compute one.
    if (obj.areaName && typeof obj.areaName === "string") {
        areaInfo = obj.areaName;
    }
    else if (obj.Name && obj.Level !== undefined) {
        areaInfo = `Act: ${obj.Act} - ${obj.Name} (${obj.Level})`;
    }
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (key === "SnapshotTime")
                continue;
            const value = obj[key];
            const newPrefix = prefix ? `${prefix}.${key}` : key;
            if (value !== null &&
                typeof value === "object" &&
                !Array.isArray(value)) {
                // Pass down the computed areaInfo to children.
                flattenSnapshot(value, time, newPrefix, areaInfo);
            }
            else if (typeof value === "number") {
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
/*-----------------------------------------------------------
  Process the snapshot data dynamically
-----------------------------------------------------------*/
function processDynamicSnapshots(data) {
    seriesData = {};
    data.forEach((snapshot) => {
        const time = new Date(snapshot.SnapshotTime * 1000);
        // If the snapshot has an "Area" object with Name and Level,
        // then create the inherited area name string.
        const inheritedAreaName = snapshot.Area && snapshot.Area.Name && snapshot.Area.Level !== undefined
            ? `${snapshot.Area.Name} (${snapshot.Area.Level})`
            : undefined;
        // Pass the inherited area name as the fourth parameter.
        flattenSnapshot(snapshot, time, "", inheritedAreaName);
    });
}
/*-----------------------------------------------------------
  Utility: Generate a random hex color.
-----------------------------------------------------------*/
function getRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}
/*-----------------------------------------------------------
  Vertical Dashed Line Plugin
  Draws a vertical dashed line at the x-value of the hovered point.
-----------------------------------------------------------*/
const verticalLinePlugin = {
    id: "verticalLinePlugin",
    afterDraw(chart, args, options) {
        if (chart.tooltip &&
            chart.tooltip._active &&
            chart.tooltip._active.length) {
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
/*-----------------------------------------------------------
  Global Chart Instance
-----------------------------------------------------------*/
let chartInstance = null;
/*-----------------------------------------------------------
  Render the Dynamic Chart
  - Builds datasets from the dynamic series.
  - Only the "Player.Level" dataset starts visible; all others are hidden.
  - Configures the x-axis with time rounding to 'hour' and proper display formats.
  - Computes the overall min and max times to automatically adjust the visible time span.
-----------------------------------------------------------*/
function renderChartDynamic() {
    const chartContainer = document.getElementById("chartWrapper");
    if (!chartContainer)
        return;
    chartContainer.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.id = "mainChart";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    chartContainer.appendChild(canvas);
    const datasets = [];
    const seriesKeys = Object.keys(seriesData);
    for (let i = 0; i < seriesKeys.length; i++) {
        const seriesKey = seriesKeys[i];
        // Sort the data points by time.
        const sortedData = seriesData[seriesKey].sort((a, b) => a.x.getTime() - b.x.getTime());
        const color = getRandomColor();
        // Only "Player.Level" is visible by default.
        const visible = seriesKey === "Player.Level";
        datasets.push({
            label: seriesKey,
            data: sortedData,
            borderColor: color,
            backgroundColor: color,
            fill: false,
            tension: 0.1,
            hidden: !visible,
        });
    }
    // Determine global minimum and maximum times from all data.
    let minTime = Infinity;
    let maxTime = -Infinity;
    Object.keys(seriesData).forEach((seriesKey) => {
        seriesData[seriesKey].forEach((dp) => {
            const t = dp.x.getTime();
            if (t < minTime)
                minTime = t;
            if (t > maxTime)
                maxTime = t;
        });
    });
    // Compute the data's overall time range and choose an appropriate time unit.
    let timeUnit = "hour"; // default unit
    if (isFinite(minTime) && isFinite(maxTime)) {
        const dataRange = maxTime - minTime;
        if (dataRange < 60 * 60 * 1000) {
            // Less than 1 hour
            timeUnit = "minute";
        }
        else if (dataRange < 24 * 60 * 60 * 1000) {
            // Less than 1 day
            timeUnit = "hour";
        }
        else if (dataRange < 7 * 24 * 60 * 60 * 1000) {
            // Less than 1 week
            timeUnit = "day";
        }
        else if (dataRange < 30 * 24 * 60 * 60 * 1000) {
            // Less than 1 month
            timeUnit = "week";
        }
        else if (dataRange < 365 * 24 * 60 * 60 * 1000) {
            // Less than 1 year
            timeUnit = "month";
        }
        else {
            timeUnit = "year";
        }
    }
    const config = {
        type: "line",
        data: {
            datasets: datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            parsing: false,
            layout: {
                padding: { left: 2, right: 2, bottom: 10, top: 10 },
            },
            scales: {
                x: {
                    type: "time",
                    time: {
                        unit: timeUnit,
                        round: false,
                        tooltipFormat: "MMM d, h:mm:ss a",
                        displayFormats: {
                            millisecond: "HH:mm:ss.SSS",
                            second: "HH:mm:ss",
                            minute: "HH:mm",
                            hour: "MMM d, HH:mm",
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
                        maxRotation: 45,
                        minRotation: 45,
                        font: {
                            size: 11,
                            family: "system-ui, -apple-system, sans-serif",
                            weight: "400",
                        },
                        autoSkip: true,
                        autoSkipPadding: 40,
                        maxTicksLimit: 15,
                    },
                    title: {
                        display: true,
                        text: "Time",
                        color: "#eeeeee",
                        font: {
                            size: 13,
                            weight: "500",
                            family: "system-ui, -apple-system, sans-serif",
                        },
                        padding: { top: 10, bottom: 10 },
                    },
                    // Use the computed min/max (with a 1-minute buffer on each end)
                    min: isFinite(minTime) ? new Date(minTime - 60 * 1000) : undefined,
                    max: isFinite(maxTime) ? new Date(maxTime + 60 * 1000) : undefined,
                    bounds: "ticks",
                    offset: false,
                    adapters: {
                        date: {
                            zone: "local", // use local timezone
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
                            size: 11,
                            family: "system-ui, -apple-system, sans-serif",
                            weight: "400",
                        },
                        padding: 8,
                        // Adjust y-axis range to data (here using only the first dataset)
                        suggestedMin: Math.floor(Math.min(...datasets[0].data.map((point) => point.y))),
                        suggestedMax: Math.ceil(Math.max(...datasets[0].data.map((point) => point.y))),
                    },
                    title: {
                        display: true,
                        text: "Value",
                        color: "#eeeeee",
                        font: {
                            size: 13,
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
                    mode: "index",
                    intersect: false,
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    titleColor: "#eeeeee",
                    bodyColor: "#eeeeee",
                    borderColor: "rgba(238, 238, 238, 0.2)",
                    borderWidth: 1,
                    padding: 8,
                    titleFont: { weight: "500" },
                    bodyFont: { weight: "400" },
                    callbacks: {
                        // This callback runs before the title and returns the area name.
                        title: function (tooltipItems) {
                            if (tooltipItems.length > 0 &&
                                tooltipItems[0].raw &&
                                tooltipItems[0].raw.areaName) {
                                return [tooltipItems[0].raw.areaName];
                            }
                            return [];
                        },
                        // The title callback still returns the tooltip time.
                        beforeTitle: function (tooltipItems) {
                            // You can rely on the default formatting if you set the displayFormats/time.tooltipFormat
                            // Otherwise, you can manually format it:
                            return [tooltipItems[0].label];
                        },
                        // Each dataset gets its own line.
                        label: function (tooltipItem) {
                            const datasetLabel = tooltipItem.dataset.label || "";
                            const value = tooltipItem.parsed.y;
                            return `${datasetLabel}: ${value}`;
                        },
                    },
                },
                legend: {
                    display: false,
                },
            },
            animation: {
                duration: 0, // disable animations for performance
            },
        },
        plugins: [verticalLinePlugin],
    };
    if (chartInstance !== null) {
        chartInstance.destroy();
    }
    const ctx = canvas.getContext("2d");
    chartInstance = new Chart(ctx, config);
    // Rebuild the field selector buttons.
    updateFieldSelector();
}
/*-----------------------------------------------------------
  Update the Field Selector
  - Clears the current field selector container.
  - For each dataset, creates a clickable button-like element.
  - Clicking anywhere on the item toggles that dataset's visibility.
  - The buttons are sorted alphabetically by label.
-----------------------------------------------------------*/
function updateFieldSelector() {
    const fieldContainer = document.getElementById("fieldSelector");
    if (!fieldContainer)
        return;
    fieldContainer.innerHTML = "";
    // Create an array of dataset info that we can sort
    const datasetInfo = chartInstance.data.datasets.map((dataset, index) => ({
        label: dataset.label,
        color: dataset.borderColor,
        visible: chartInstance.isDatasetVisible(index),
        index: index,
    }));
    // Sort by label alphabetically
    datasetInfo.sort((a, b) => a.label.localeCompare(b.label));
    datasetInfo.forEach((info) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "field-item";
        if (info.visible) {
            itemDiv.classList.add("active");
        }
        itemDiv.onclick = () => {
            const currentlyVisible = chartInstance.isDatasetVisible(info.index);
            chartInstance.setDatasetVisibility(info.index, !currentlyVisible);
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
/*-----------------------------------------------------------
  File Loading Setup (Drag & Drop and File Input)
-----------------------------------------------------------*/
function initFileLoader() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");
    if (!dropZone || !fileInput)
        return;
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("hover");
    });
    dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dropZone.classList.remove("hover");
    });
    dropZone.addEventListener("drop", (e) => {
        var _a;
        e.preventDefault();
        dropZone.classList.remove("hover");
        if ((_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.files.length) {
            readFile(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener("change", () => {
        if (fileInput.files && fileInput.files.length > 0) {
            readFile(fileInput.files[0]);
        }
    });
}
/*-----------------------------------------------------------
  Read and Parse the JSON File
-----------------------------------------------------------*/
function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            let fileContent = reader.result;
            if (typeof fileContent !== "string") {
                fileContent = String(fileContent);
            }
            fileContent = fileContent.trim();
            console.log("File content (first 500 chars):", fileContent.slice(0, 500));
            const jsonData = JSON.parse(fileContent);
            if (!Array.isArray(jsonData)) {
                alert("JSON must be an array of snapshots!");
                return;
            }
            processDynamicSnapshots(jsonData);
            renderChartDynamic();
        }
        catch (err) {
            alert("Error parsing JSON file!");
            console.error(err);
        }
    };
    reader.readAsText(file);
}
/*-----------------------------------------------------------
  Initialize the Application on Window Load
-----------------------------------------------------------*/
window.addEventListener("load", () => {
    initFileLoader();
});
