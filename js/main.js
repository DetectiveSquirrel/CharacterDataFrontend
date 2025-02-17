"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
let chartInstance = null;
let persistentFileHandle = null;
const keyConnecter = ' → ';
const VISIBILITY_STORAGE_KEY = 'datasetVisibility';
const EXCLUDED_KEYS = new Set(['SnapshotTime']);
let seriesData = {};
const verticalLinePlugin = {
    id: 'verticalLinePlugin',
    afterDraw(chart, options) {
        if (chart.tooltip && chart.tooltip._active && chart.tooltip._active.length) {
            const ctx = chart.ctx;
            const activePoint = chart.tooltip._active[0];
            const x = activePoint.element.x;
            const yScale = chart.scales.y;
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            ctx.moveTo(x, yScale.top);
            ctx.lineTo(x, yScale.bottom);
            ctx.strokeStyle = options.lineColor || 'rgba(255,255,255,0.4)';
            ctx.lineWidth = options.lineWidth || 1;
            ctx.stroke();
            ctx.restore();
        }
    }
};
function saveVisibilityMap(map) {
    localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(map));
}
function formatCumulativeTime(seconds) {
    const hr = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    const sec = Math.floor(seconds % 60);
    return `${hr > 0 ? hr + 'h ' : ''}${min > 0 ? min + 'm ' : ''}${sec}s`;
}
function loadVisibilityMap() {
    const stored = localStorage.getItem(VISIBILITY_STORAGE_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        }
        catch (e) {
            console.error('Error parsing datasetVisibility:', e);
            return {};
        }
    }
    return {};
}
function addPoint(seriesKey, value, time, preTitles) {
    if (!seriesData[seriesKey]) {
        seriesData[seriesKey] = [];
    }
    const tooltipLines = Array.isArray(preTitles) ? preTitles : [preTitles];
    seriesData[seriesKey].push({ x: time, y: value, preTitles: tooltipLines });
}
function refreshFile() {
    return __awaiter(this, void 0, void 0, function* () {
        if (persistentFileHandle) {
            try {
                const file = yield persistentFileHandle.getFile();
                readFile(file);
            }
            catch (error) {
                console.error('Error refreshing file:', error);
                alert('Error refreshing file. Please try re-selecting it.');
            }
        }
        else {
            alert('No persistent file selection available. Please select a file using the button.');
        }
    });
}
function addPointsForObject(obj, keyPrefix, time, preTitleLines) {
    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key))
            continue;
        if (EXCLUDED_KEYS.has(key))
            continue;
        const fullKey = keyPrefix ? `${keyPrefix}${keyConnecter}${key}` : key;
        const value = obj[key];
        if (typeof value === 'number') {
            addPoint(fullKey, value, time, preTitleLines);
        }
        else if (value && typeof value === 'object') {
            addPointsForObject(value, fullKey, time, preTitleLines);
        }
    }
}
function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            let fileContent = reader.result;
            if (typeof fileContent !== 'string') {
                fileContent = String(fileContent);
            }
            fileContent = fileContent.trim();
            const jsonData = JSON.parse(fileContent);
            if (!Array.isArray(jsonData)) {
                alert('JSON must be an array of snapshots!');
                return;
            }
            processSchemaSnapshots(jsonData);
        }
        catch (err) {
            alert('Error parsing JSON file!');
            console.error(err);
        }
    };
    reader.readAsText(file);
}
function stringToColor(str) {
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
    const toHex = (c) => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return '#' + toHex(r) + toHex(g) + toHex(b);
}
function selectFileFS() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!window.showOpenFilePicker) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', (event) => {
                const target = event.target;
                if (target.files && target.files.length > 0) {
                    const file = target.files[0];
                    readFile(file);
                }
            });
            document.body.appendChild(fileInput);
            fileInput.click();
            document.body.removeChild(fileInput);
            return;
        }
        try {
            const [handle] = yield window.showOpenFilePicker();
            persistentFileHandle = handle;
            const file = yield handle.getFile();
            readFile(file);
        }
        catch (error) {
            console.error('Error selecting file via FS API:', error);
        }
    });
}
function updateFieldSelector() {
    const fieldContainer = document.getElementById('fieldSelector');
    if (!fieldContainer || !chartInstance)
        return;
    fieldContainer.innerHTML = '';
    const visibilityMap = loadVisibilityMap();
    const datasetInfo = chartInstance.data.datasets.map((dataset, index) => ({
        label: dataset.label,
        color: dataset.borderColor,
        visible: chartInstance.isDatasetVisible(index),
        index: index
    }));
    datasetInfo.sort((a, b) => a.label.localeCompare(b.label));
    datasetInfo.forEach((info) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'field-item';
        if (info.visible) {
            itemDiv.classList.add('active');
        }
        itemDiv.onclick = () => {
            const currentlyVisible = chartInstance.isDatasetVisible(info.index);
            chartInstance.setDatasetVisibility(info.index, !currentlyVisible);
            visibilityMap[info.label] = !currentlyVisible;
            saveVisibilityMap(visibilityMap);
            chartInstance.update();
            updateFieldSelector();
        };
        const colorBox = document.createElement('div');
        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = info.color;
        const labelSpan = document.createElement('span');
        labelSpan.className = 'field-label';
        labelSpan.innerText = info.label;
        itemDiv.appendChild(colorBox);
        itemDiv.appendChild(labelSpan);
        fieldContainer.appendChild(itemDiv);
    });
}
function processSchemaSnapshots(data) {
    data.sort((a, b) => a.SnapshotTime - b.SnapshotTime);
    seriesData = {};
    let cumulativeTimeSeconds = 0;
    data.forEach((snapshot) => {
        const time = new Date(snapshot.SnapshotTime * 1000);
        const areaLine = snapshot.StartArea && snapshot.EndArea
            ? `${snapshot.StartArea.Name} (${snapshot.StartArea.Level}) → ${snapshot.EndArea.Name} (${snapshot.EndArea.Level})`
            : snapshot.StartArea
                ? `${snapshot.StartArea.Name} (${snapshot.StartArea.Level})`
                : '';
        const startLabel = snapshot.StartArea && snapshot.StartArea.Name && snapshot.StartArea.Name.toLocaleLowerCase().includes('hideout')
            ? 'Hideout'
            : `Act ${snapshot.StartArea.Act}`;
        const endLabel = snapshot.EndArea && snapshot.EndArea.Name && snapshot.EndArea.Name.toLocaleLowerCase().includes('hideout') ? 'Hideout' : `Act ${snapshot.EndArea.Act}`;
        const actLine = snapshot.StartArea ? (snapshot.EndArea ? (startLabel === endLabel ? startLabel : `${startLabel} → ${endLabel}`) : startLabel) : '';
        if (typeof snapshot.AreaTimeSeconds === 'number') {
            cumulativeTimeSeconds += snapshot.AreaTimeSeconds;
        }
        const cumulativeTimeLine = cumulativeTimeSeconds > 0 ? `Cumulative Time: ${formatCumulativeTime(cumulativeTimeSeconds)}` : '';
        const preTitleLines = [];
        if (actLine) {
            preTitleLines.push(actLine);
        }
        if (areaLine) {
            preTitleLines.push(areaLine);
        }
        if (cumulativeTimeLine) {
            preTitleLines.push(cumulativeTimeLine);
        }
        addPointsForObject(snapshot, '', time, preTitleLines);
    });
    renderChartDynamic();
}
function renderChartDynamic() {
    const chartContainer = document.getElementById('chartWrapper');
    if (!chartContainer)
        return;
    chartContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.id = 'mainChart';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    chartContainer.appendChild(canvas);
    const datasets = [];
    const seriesKeys = Object.keys(seriesData);
    const visibilityMap = loadVisibilityMap();
    for (let i = 0; i < seriesKeys.length; i++) {
        const seriesKey = seriesKeys[i];
        const sortedData = seriesData[seriesKey].sort((a, b) => a.x.getTime() - b.x.getTime());
        const isVisible = typeof visibilityMap[seriesKey] !== 'undefined' ? visibilityMap[seriesKey] : seriesKey === `Player${keyConnecter}Level`;
        datasets.push({
            label: seriesKey,
            data: sortedData,
            borderColor: stringToColor(seriesKey),
            backgroundColor: stringToColor(seriesKey),
            fill: false,
            tension: 0.1,
            hidden: !isVisible
        });
    }
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
    const visibleYValues = datasets.reduce((acc, ds) => {
        if (!ds.hidden) {
            return acc.concat(ds.data.map((point) => point.y));
        }
        return acc;
    }, []);
    const suggestedMin = visibleYValues.length > 0 ? Math.floor(Math.min(...visibleYValues)) : undefined;
    const suggestedMax = visibleYValues.length > 0 ? Math.ceil(Math.max(...visibleYValues)) : undefined;
    const config = {
        type: 'line',
        data: {
            datasets: datasets
        },
        options: {
            datasetDecimation: {
                enabled: true,
                algorithm: 'lttb'
            },
            responsive: true,
            maintainAspectRatio: false,
            parsing: false,
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            layout: {
                padding: { left: 2, right: 2, bottom: 10, top: 10 }
            },
            animation: {
                duration: 0
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        round: false,
                        tooltipFormat: 'MMM d, h:mm:ss a',
                        displayFormats: {
                            millisecond: 'h:mm:ss a',
                            second: 'h:mm:ss a',
                            minute: 'h:mm a',
                            hour: 'MMM d, h:mm a',
                            day: 'MMM d',
                            week: 'MMM d',
                            month: 'MMM yyyy',
                            quarter: 'MMM yyyy',
                            year: 'yyyy'
                        }
                    },
                    grid: {
                        color: 'rgba(238, 238, 238, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#eeeeee',
                        maxRotation: 30,
                        minRotation: 0,
                        font: {
                            size: 15,
                            family: 'system-ui, -apple-system, sans-serif',
                            weight: '400'
                        },
                        autoSkip: true,
                        autoSkipPadding: 40,
                        maxTicksLimit: 20
                    },
                    title: {
                        display: true,
                        text: 'Time',
                        color: '#eeeeee',
                        font: {
                            size: 15,
                            weight: '500',
                            family: 'system-ui, -apple-system, sans-serif'
                        },
                        padding: { top: 10, bottom: 10 }
                    },
                    min: isFinite(minTime) ? new Date(minTime - 60 * 1000) : undefined,
                    max: isFinite(maxTime) ? new Date(maxTime + 60 * 1000) : undefined,
                    bounds: 'ticks',
                    offset: false,
                    adapters: {
                        date: {
                            zone: 'local'
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(238, 238, 238, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#eeeeee',
                        font: {
                            size: 14,
                            family: 'system-ui, -apple-system, sans-serif',
                            weight: '400'
                        },
                        padding: 8,
                        suggestedMin: suggestedMin,
                        suggestedMax: suggestedMax
                    },
                    title: {
                        display: true,
                        text: 'Value',
                        color: '#eeeeee',
                        font: {
                            size: 14,
                            weight: '500',
                            family: 'system-ui, -apple-system, sans-serif'
                        },
                        padding: { top: 4, bottom: 4 }
                    },
                    bounds: 'data',
                    offset: true
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        beforeTitle: function (tooltipItems) {
                            return [tooltipItems[0].label];
                        },
                        title: function (tooltipItems) {
                            const raw = tooltipItems[0].raw;
                            if (raw && raw.preTitles) {
                                return raw.preTitles;
                            }
                            return raw && raw.areaName ? [raw.areaName] : [];
                        },
                        label: function (tooltipItem) {
                            const datasetLabel = tooltipItem.dataset.label || '';
                            const value = tooltipItem.parsed.y;
                            const formattedValue = Number(value).toLocaleString();
                            return `${datasetLabel}: ${formattedValue}`;
                        }
                    }
                },
                legend: {
                    display: false
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        threshold: 10
                    },
                    zoom: {
                        wheel: {
                            enabled: true
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: 'x'
                    }
                }
            }
        },
        plugins: [verticalLinePlugin]
    };
    if (chartInstance !== null) {
        chartInstance.destroy();
    }
    const ctx = canvas.getContext('2d');
    chartInstance = new Chart(ctx, config);
    canvas.addEventListener('mousedown', (event) => {
        if (event.button === 1) {
            event.preventDefault();
        }
    });
    canvas.addEventListener('mouseup', (event) => {
        if (event.button === 1 && chartInstance) {
            chartInstance.resetZoom();
        }
    });
    updateFieldSelector();
}
document.addEventListener('DOMContentLoaded', () => {
    const selectButton = document.getElementById('select-file-button');
    const refreshButton = document.getElementById('refresh-button');
    if (selectButton) {
        selectButton.addEventListener('click', () => {
            selectFileFS();
        });
    }
    if (typeof window.showOpenFilePicker === 'undefined') {
        if (refreshButton) {
            refreshButton.disabled = true;
        }
    }
    else {
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                refreshFile();
            });
        }
    }
});
