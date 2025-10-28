// Dashboard JavaScript - Real-time ESP32 integration with SignalR

// SignalR connection setup
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/sensorHub")
    .withAutomaticReconnect()
    .build();

connection.on("ReceiveSensorData", function (data) {
    if (isSessionActive) {
        // Convert ESP32 timestamp (milliseconds since boot) to Date
        data.timestamp = new Date(data.Timestamp);
        processSensorData(data); // Process the received data
    }
});

connection.start()
    .then(() => {
        console.log("Connected to SignalR hub");
        updateConnectionStatus(true);
    })
    .catch(err => console.error("SignalR Connection Error: ", err));

// Global variables for dashboard state
let isSessionActive = false;
let sessionStartTime = null;
let drowsinessChart = null;
let totalAlerts = 0;
let sessionData = [];

// Simulation state
let simulatorIntervalId = null;
let simulatorState = {
    lastBlinkMs: 0,
    blinkIntervalMs: 3000,
    batteryLevel: 100,
    tiltCooldown: 0, // ticks remaining with high tilt
    baseTilt: { pitch: 0, roll: 0, yaw: 0 }
};

function resetChart() {
    if (!drowsinessChart) return;
    drowsinessChart.data.labels = [];
    drowsinessChart.data.datasets[0].data = [];
    drowsinessChart.data.datasets[1].data = [];
    drowsinessChart.update('none');
}

let recentSessions = [];

function loadRecentSessions() {
    try {
        const raw = localStorage.getItem('recentSessions');
        recentSessions = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(recentSessions)) recentSessions = [];
    } catch (_) {
        recentSessions = [];
    }
}

function saveRecentSession() {
    if (!sessionStartTime || sessionData.length === 0) return;
    const endTime = new Date();
    const durationMs = endTime - sessionStartTime;
    const avgBlink = sessionData.reduce((s, d) => s + d.eyeBlinkRate, 0) / sessionData.length;
    const peakDrowsy = Math.max(...sessionData.map(d => d.drowsinessLevel));
    const summary = {
        start: sessionStartTime.toISOString(),
        end: endTime.toISOString(),
        durationMs: durationMs,
        totalAlerts: totalAlerts,
        avgBlinkRate: Number.isFinite(avgBlink) ? avgBlink : 0,
        peakDrowsiness: Number.isFinite(peakDrowsy) ? peakDrowsy : 0,
        points: sessionData.length
    };
    recentSessions.unshift(summary);
    recentSessions = recentSessions.slice(0, 10);
    try {
        localStorage.setItem('recentSessions', JSON.stringify(recentSessions));
    } catch (_) {}
}

function renderRecentSessions() {
    const container = document.getElementById('sessionHistory');
    if (!container) return;
    if (!recentSessions || recentSessions.length === 0) {
        container.innerHTML = '<div class="text-center text-muted"><i class="fas fa-history fa-2x mb-2"></i><p>No previous sessions found</p></div>';
        return;
    }
    const items = recentSessions.map(s => {
        const dur = formatDuration(s.durationMs);
        const date = new Date(s.start).toLocaleString();
        return `<div class="d-flex justify-content-between align-items-center border-bottom py-2">
            <div>
                <div class=\"fw-semibold\">${date}</div>
                <div class=\"text-muted small\">Duration: ${dur} • Points: ${s.points}</div>
            </div>
            <div class=\"text-end\">
                <div class=\"small\">Alerts: <strong>${s.totalAlerts}</strong></div>
                <div class=\"small\">Avg Blink: ${s.avgBlinkRate.toFixed(1)} BPM • Peak Drowsy: ${s.peakDrowsiness.toFixed(1)}%</div>
            </div>
        </div>`;
    }).join('');
    container.innerHTML = items;
}

function formatDuration(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

// ---------------------------
// Simulation (client-side)
// ---------------------------
function startSimulator() {
    if (simulatorIntervalId) return;
    simulatorState.lastBlinkMs = performance.now();
    simulatorState.batteryLevel = 100;
    simulatorState.tiltCooldown = 0;
    simulatorState.baseTilt = { pitch: 0, roll: 0, yaw: 0 };

    // Run the simulator every 2 seconds to slow visual updates
    simulatorIntervalId = setInterval(simulatorTick, 2000);
}

function stopSimulator() {
    if (simulatorIntervalId) {
        clearInterval(simulatorIntervalId);
        simulatorIntervalId = null;
    }
}

function simulatorTick() {
    if (!isSessionActive) return;

    const now = new Date();
    const nowMs = performance.now();

    // Blink every 3 seconds (approx 20 BPM)
    let eyeClosedThisTick = false;
    if (nowMs - simulatorState.lastBlinkMs >= simulatorState.blinkIntervalMs) {
        simulatorState.lastBlinkMs = nowMs;
        eyeClosedThisTick = true; // represent a blink event at this tick
    }

    // Head movement: small noise + less frequent spikes > 30°
    if (simulatorState.tiltCooldown === 0 && Math.random() < 0.08) {
        // cooldown is in ticks; with 2s per tick this is ~4-6 seconds
        simulatorState.tiltCooldown = 2 + Math.floor(Math.random() * 2); // 2-3 ticks
        // create a spike on one axis
        const axis = ['pitch','roll','yaw'][Math.floor(Math.random()*3)];
        simulatorState.baseTilt[axis] = (Math.random() < 0.5 ? 1 : -1) * (30 + Math.random() * 20); // 30-50°
    } else if (simulatorState.tiltCooldown > 0) {
        simulatorState.tiltCooldown--;
        if (simulatorState.tiltCooldown === 0) {
            simulatorState.baseTilt = { pitch: 0, roll: 0, yaw: 0 };
        }
    }

    const headMovement = {
        pitch: simulatorState.baseTilt.pitch + (Math.random() - 0.5) * 4,
        roll: simulatorState.baseTilt.roll + (Math.random() - 0.5) * 4,
        yaw: simulatorState.baseTilt.yaw + (Math.random() - 0.5) * 4
    };

    const tiltExceeded = Math.max(
        Math.abs(headMovement.pitch),
        Math.abs(headMovement.roll),
        Math.abs(headMovement.yaw)
    ) > 30;

    // Eye blink rate: baseline ~17 BPM, spike to ~20 BPM when blink occurs
    const baselineBlink = 15 + Math.random() * 6; // 15-21 BPM
    const eyeBlinkRate = eyeClosedThisTick ? 20 : baselineBlink;

    // Drowsiness heuristic: base 35-50, increase on blink event and tilt exceedance
    let drowsinessLevel = 35 + Math.random() * 15; // 35-50
    if (eyeClosedThisTick) drowsinessLevel += 20 + Math.random() * 10; // +20-30
    if (tiltExceeded) drowsinessLevel += 20 + Math.random() * 15; // +20-35
    drowsinessLevel = Math.max(0, Math.min(100, drowsinessLevel));

    // Battery level decay
    simulatorState.batteryLevel = Math.max(5, simulatorState.batteryLevel - (0.15 + Math.random() * 0.1));

    // Determine alert based on current threshold
    const threshold = parseInt(document.getElementById('drowsinessThreshold').value);
    const alertTriggered = drowsinessLevel >= threshold || tiltExceeded;

    const simulated = {
        timestamp: now,
        eyeBlinkRate: eyeBlinkRate,
        eyeClosureDuration: eyeClosedThisTick ? 0.2 : 0.0, // approx seconds closed within this tick
        headMovement: headMovement,
        drowsinessLevel: drowsinessLevel,
        alertTriggered: alertTriggered,
        batteryLevel: simulatorState.batteryLevel
    };

    processSensorData(simulated);
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function () {
    initializeDashboard();
    initializeChart();
    setupEventListeners();
    loadRecentSessions();
    renderRecentSessions();
});

// Initialize dashboard components
function initializeDashboard() {
    console.log('Dashboard initialized - waiting for ESP32 connection...');
    updateConnectionStatus(false);
    updateSessionStatus(false);
}

// Initialize Chart.js for real-time monitoring
function initializeChart() {
    const ctx = document.getElementById('drowsinessChart').getContext('2d');

    drowsinessChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Drowsiness Level (%)',
                data: [],
                borderColor: 'rgb(255, 193, 7)',
                backgroundColor: 'rgba(255, 193, 7, 0.1)',
                tension: 0.1
            }, {
                label: 'Blink Rate (BPM)',
                data: [],
                borderColor: 'rgb(13, 110, 253)',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                tension: 0.1,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    min: 0,
                    max: 100
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    min: 0,
                    max: 30,
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            },
            plugins: {
                legend: {
                    display: true
                }
            }
        }
    });
}

// Setup event listeners for dashboard controls
function setupEventListeners() {
    // Session control buttons
    document.getElementById('startSessionBtn').addEventListener('click', startSession);
    document.getElementById('stopSessionBtn').addEventListener('click', stopSession);
    document.getElementById('exportBtn').addEventListener('click', exportSessionData);
    document.getElementById('previewBtn').addEventListener('click', previewSessionData);

    // Settings sliders
    document.getElementById('drowsinessThreshold').addEventListener('input', updateThreshold);
    document.getElementById('normalBlinkRate').addEventListener('input', updateBlinkRate);
    
    // Export format change
    document.getElementById('exportFormat').addEventListener('change', updateExportButtons);
}

// Start monitoring session
function startSession() {
    isSessionActive = true;
    sessionStartTime = new Date();
    sessionData = [];
    totalAlerts = 0;

    updateSessionStatus(true);
    updateSessionControls(true);

    console.log('Session started at:', sessionStartTime);

    // For demo: mark connection as available and start simulator
    updateConnectionStatus(true);
    startSimulator();

    resetChart();
    document.getElementById('blinkRate').textContent = '-- BPM';
    document.getElementById('blinkRateBar').style.width = '0%';
    document.getElementById('drowsinessLevel').textContent = '--%';
    document.getElementById('drowsinessBar').style.width = '0%';
    document.getElementById('pitchValue').textContent = '--°';
    document.getElementById('rollValue').textContent = '--°';
    document.getElementById('yawValue').textContent = '--°';
    document.getElementById('batteryLevel').textContent = '--%';
    document.getElementById('batteryBar').style.width = '0%';
    document.getElementById('lastDataTime').textContent = 'Never';
    document.getElementById('totalAlerts').textContent = '0';
    document.getElementById('sessionDuration').textContent = '00:00:00';
    document.getElementById('avgBlinkRate').textContent = '-- BPM';
    document.getElementById('peakDrowsiness').textContent = '--%';
    clearAlert();
    updateExportButtons();
}

// Stop monitoring session
function stopSession() {
    isSessionActive = false;

    updateSessionStatus(false);
    updateSessionControls(false);

    console.log('Session ended. Total alerts:', totalAlerts);
    console.log('Session data points:', sessionData.length);

    // Stop simulator when session stops
    stopSimulator();

    saveRecentSession();
    renderRecentSessions();
}

// Export session data
function exportSessionData() {
    if (sessionData.length === 0) {
        alert('No session data available to export. Please start a session first.');
        return;
    }

    const format = document.getElementById('exportFormat').value;

    switch (format) {
        case 'pdf':
            generatePDFReport();
            break;
        case 'csv':
            generateCSVExport();
            break;
        case 'txt':
            generateTextSummary();
            break;
    }
}

// Preview session data
function previewSessionData() {
    if (sessionData.length === 0) {
        alert('No session data available to preview. Please start a session first.');
        return;
    }

    const format = document.getElementById('exportFormat').value;
    let previewContent = '';

    switch (format) {
        case 'csv':
            previewContent = generateCSVContent();
            break;
        case 'txt':
            previewContent = generateTextContent();
            break;
        case 'pdf':
            alert('PDF preview is not available. Please use CSV or Text format for preview.');
            return;
    }

    // Show preview in a modal or new window
    showPreviewModal(previewContent, format);
}

// Update export buttons based on data availability
function updateExportButtons() {
    const hasData = sessionData.length > 0;
    const format = document.getElementById('exportFormat').value;
    
    document.getElementById('exportBtn').disabled = !hasData;
    document.getElementById('previewBtn').disabled = !hasData || format === 'pdf';
}

// Update connection status indicator
function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    if (isConnected) {
        statusElement.className = 'badge bg-success';
        statusElement.textContent = '🟢 ESP32 Connected';
    } else {
        statusElement.className = 'badge bg-danger';
        statusElement.textContent = '🔴 ESP32 Disconnected';
    }
}

// Update session status indicator
function updateSessionStatus(isActive) {
    const statusElement = document.getElementById('sessionStatus');
    if (isActive) {
        statusElement.className = 'badge bg-success';
        statusElement.textContent = 'Session Active';
    } else {
        statusElement.className = 'badge bg-secondary';
        statusElement.textContent = 'Session Inactive';
    }
}

// Update session control buttons
function updateSessionControls(isActive) {
    document.getElementById('startSessionBtn').disabled = isActive;
    document.getElementById('stopSessionBtn').disabled = !isActive;
    updateExportButtons();
}

// Update drowsiness threshold setting
function updateThreshold() {
    const value = document.getElementById('drowsinessThreshold').value;
    document.getElementById('thresholdValue').textContent = value + '%';
}

// Update normal blink rate setting
function updateBlinkRate() {
    const value = document.getElementById('normalBlinkRate').value;
    document.getElementById('normalBlinkValue').textContent = value + ' BPM';
}

// Process sensor data from ESP32
function processSensorData(data) {
    // Validate data
    if (!data || !data.headMovement || typeof data.eyeBlinkRate !== 'number' || typeof data.drowsinessLevel !== 'number') {
        console.error('Invalid sensor data:', data);
        return;
    }

    // Store data for session
    sessionData.push(data);

    // Update dashboard displays
    updateDashboardDisplays(data);

    // Update chart
    updateChart(data);

    // Check for alerts
    checkForAlerts(data);

    // Update session statistics
    updateSessionStatistics();
}

// Update dashboard display elements
function updateDashboardDisplays(data) {
    // Update blink rate
    document.getElementById('blinkRate').textContent = data.eyeBlinkRate.toFixed(1) + ' BPM';
    const blinkRatePercent = Math.min((data.eyeBlinkRate / 30) * 100, 100);
    document.getElementById('blinkRateBar').style.width = blinkRatePercent + '%';

    // Update drowsiness level
    document.getElementById('drowsinessLevel').textContent = data.drowsinessLevel.toFixed(1) + '%';
    document.getElementById('drowsinessBar').style.width = data.drowsinessLevel + '%';

    // Update head movement
    document.getElementById('pitchValue').textContent = data.headMovement.pitch.toFixed(1) + '°';
    document.getElementById('rollValue').textContent = data.headMovement.roll.toFixed(1) + '°';
    document.getElementById('yawValue').textContent = data.headMovement.yaw.toFixed(1) + '°';

    // Update device status
    document.getElementById('batteryLevel').textContent = data.batteryLevel.toFixed(0) + '%';
    document.getElementById('batteryBar').style.width = data.batteryLevel + '%';

    // Update last data time
    document.getElementById('lastDataTime').textContent = data.timestamp.toLocaleTimeString();
}

// Update real-time chart
function updateChart(data) {
    const timeLabel = data.timestamp.toLocaleTimeString();

    // Add new data point
    drowsinessChart.data.labels.push(timeLabel);
    drowsinessChart.data.datasets[0].data.push(data.drowsinessLevel);
    drowsinessChart.data.datasets[1].data.push(data.eyeBlinkRate);

    // Keep only last 20 data points
    if (drowsinessChart.data.labels.length > 20) {
        drowsinessChart.data.labels.shift();
        drowsinessChart.data.datasets[0].data.shift();
        drowsinessChart.data.datasets[1].data.shift();
    }

    drowsinessChart.update('none');
}

// Check for drowsiness alerts
function checkForAlerts(data) {
    // Use the computed alert flag (covers drowsiness threshold and >30° tilt)
    if (data.alertTriggered) {
        triggerAlert(data);
    } else {
        clearAlert();
    }
}

// Trigger drowsiness alert
function triggerAlert(data) {
    totalAlerts++;
    document.getElementById('totalAlerts').textContent = totalAlerts;

    // Update alert status display
    const alertStatus = document.getElementById('alertStatus');
    alertStatus.innerHTML = '<i class="fas fa-exclamation-triangle fa-2x text-danger"></i><div class="mt-2">Drowsiness Alert!</div>';

    console.log('Drowsiness alert triggered at', data.drowsinessLevel.toFixed(1) + '%');
}

// Clear alert status
function clearAlert() {
    const alertStatus = document.getElementById('alertStatus');
    alertStatus.innerHTML = '<i class="fas fa-check-circle fa-2x text-success"></i><div class="mt-2">All Clear</div>';
}

// Update session statistics
function updateSessionStatistics() {
    if (sessionData.length === 0) return;

    // Calculate session duration
    const duration = new Date() - sessionStartTime;
    const hours = Math.floor(duration / 3600000);
    const minutes = Math.floor((duration % 3600000) / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    document.getElementById('sessionDuration').textContent =
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Calculate average blink rate
    const avgBlinkRate = sessionData.reduce((sum, data) => sum + data.eyeBlinkRate, 0) / sessionData.length;
    document.getElementById('avgBlinkRate').textContent = avgBlinkRate.toFixed(1) + ' BPM';

    // Calculate peak drowsiness
    const peakDrowsiness = Math.max(...sessionData.map(data => data.drowsinessLevel));
    document.getElementById('peakDrowsiness').textContent = peakDrowsiness.toFixed(1) + '%';
}

// Generate PDF report using jsPDF
function generatePDFReport() {
    console.log('Generating PDF report...');
    
    // Import jsPDF dynamically
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = function() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Add title
        doc.setFontSize(20);
        doc.text('Drowsiness Detection Session Report', 20, 30);
        
        // Add session info
        doc.setFontSize(12);
        doc.text(`Session Date: ${sessionStartTime.toLocaleDateString()}`, 20, 50);
        doc.text(`Session Duration: ${document.getElementById('sessionDuration').textContent}`, 20, 60);
        doc.text(`Total Alerts: ${totalAlerts}`, 20, 70);
        doc.text(`Data Points: ${sessionData.length}`, 20, 80);
        
        // Add statistics
        if (sessionData.length > 0) {
            const avgBlinkRate = sessionData.reduce((sum, data) => sum + data.eyeBlinkRate, 0) / sessionData.length;
            const peakDrowsiness = Math.max(...sessionData.map(data => data.drowsinessLevel));
            
            doc.text(`Average Blink Rate: ${avgBlinkRate.toFixed(1)} BPM`, 20, 100);
            doc.text(`Peak Drowsiness: ${peakDrowsiness.toFixed(1)}%`, 20, 110);
        }
        
        // Add data table
        doc.text('Session Data:', 20, 130);
        let yPos = 140;
        
        // Table headers
        doc.setFontSize(10);
        doc.text('Time', 20, yPos);
        doc.text('Blink Rate', 50, yPos);
        doc.text('Drowsiness %', 80, yPos);
        doc.text('Pitch', 110, yPos);
        doc.text('Roll', 130, yPos);
        doc.text('Yaw', 150, yPos);
        doc.text('Alert', 170, yPos);
        yPos += 10;
        
        // Add data rows (limit to fit page)
        const maxRows = Math.min(sessionData.length, 20);
        for (let i = 0; i < maxRows; i++) {
            const data = sessionData[i];
            doc.text(data.timestamp.toLocaleTimeString(), 20, yPos);
            doc.text(data.eyeBlinkRate.toFixed(1), 50, yPos);
            doc.text(data.drowsinessLevel.toFixed(1), 80, yPos);
            doc.text(data.headMovement.pitch.toFixed(1), 110, yPos);
            doc.text(data.headMovement.roll.toFixed(1), 130, yPos);
            doc.text(data.headMovement.yaw.toFixed(1), 150, yPos);
            doc.text(data.alertTriggered ? 'Yes' : 'No', 170, yPos);
            yPos += 6;
        }
        
        // Download the PDF
        const fileName = `drowsiness_report_${sessionStartTime.toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
    };
    document.head.appendChild(script);
}

// Generate CSV export
function generateCSVExport() {
    console.log('Generating CSV export...');
    
    const csvContent = generateCSVContent();
    downloadFile(csvContent, `drowsiness_data_${sessionStartTime.toISOString().split('T')[0]}.csv`, 'text/csv');
}

// Generate CSV content
function generateCSVContent() {
    const headers = ['Timestamp', 'Blink Rate (BPM)', 'Drowsiness Level (%)', 'Pitch (°)', 'Roll (°)', 'Yaw (°)', 'Alert Triggered', 'Battery Level (%)'];
    const csvRows = [headers.join(',')];
    
    sessionData.forEach(data => {
        const row = [
            data.timestamp.toISOString(),
            data.eyeBlinkRate.toFixed(2),
            data.drowsinessLevel.toFixed(2),
            data.headMovement.pitch.toFixed(2),
            data.headMovement.roll.toFixed(2),
            data.headMovement.yaw.toFixed(2),
            data.alertTriggered ? 'Yes' : 'No',
            data.batteryLevel.toFixed(1)
        ];
        csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
}

// Generate text summary
function generateTextSummary() {
    console.log('Generating text summary...');
    
    const textContent = generateTextContent();
    downloadFile(textContent, `drowsiness_summary_${sessionStartTime.toISOString().split('T')[0]}.txt`, 'text/plain');
}

// Generate text content
function generateTextContent() {
    let content = 'DROWSINESS DETECTION SESSION SUMMARY\n';
    content += '=====================================\n\n';
    
    content += `Session Date: ${sessionStartTime.toLocaleDateString()}\n`;
    content += `Session Time: ${sessionStartTime.toLocaleTimeString()}\n`;
    content += `Session Duration: ${document.getElementById('sessionDuration').textContent}\n`;
    content += `Total Data Points: ${sessionData.length}\n`;
    content += `Total Alerts: ${totalAlerts}\n\n`;
    
    if (sessionData.length > 0) {
        const avgBlinkRate = sessionData.reduce((sum, data) => sum + data.eyeBlinkRate, 0) / sessionData.length;
        const peakDrowsiness = Math.max(...sessionData.map(data => data.drowsinessLevel));
        const avgDrowsiness = sessionData.reduce((sum, data) => sum + data.drowsinessLevel, 0) / sessionData.length;
        
        content += 'STATISTICS\n';
        content += '----------\n';
        content += `Average Blink Rate: ${avgBlinkRate.toFixed(2)} BPM\n`;
        content += `Average Drowsiness Level: ${avgDrowsiness.toFixed(2)}%\n`;
        content += `Peak Drowsiness Level: ${peakDrowsiness.toFixed(2)}%\n\n`;
        
        content += 'DETAILED DATA\n';
        content += '-------------\n';
        content += 'Time\t\tBlink Rate\tDrowsiness\tPitch\tRoll\tYaw\tAlert\n';
        content += '----\t\t----------\t----------\t-----\t----\t---\t-----\n';
        
        sessionData.forEach(data => {
            content += `${data.timestamp.toLocaleTimeString()}\t${data.eyeBlinkRate.toFixed(1)}\t\t${data.drowsinessLevel.toFixed(1)}%\t\t${data.headMovement.pitch.toFixed(1)}°\t${data.headMovement.roll.toFixed(1)}°\t${data.headMovement.yaw.toFixed(1)}°\t${data.alertTriggered ? 'Yes' : 'No'}\n`;
        });
    }
    
    return content;
}

// Download file utility function
function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

// Show preview modal
function showPreviewModal(content, format) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Preview ${format.toUpperCase()} Export</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <pre style="max-height: 400px; overflow-y: auto; background: #f8f9fa; padding: 15px; border-radius: 5px;">${content}</pre>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-primary" onclick="exportSessionData(); bootstrap.Modal.getInstance(this.closest('.modal')).hide();">Download</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Remove modal when hidden
    modal.addEventListener('hidden.bs.modal', () => {
        document.body.removeChild(modal);
    });
}

// TODO: Implement WebSocket/SignalR connection to ESP32
function connectToESP32() {
    console.log('Connecting to ESP32...');
    // SignalR connection will be implemented here
}

// TODO: Implement ESP32 data reception
function onESP32DataReceived(data) {
    console.log('Data received from ESP32:', data);
    processSensorData(data);
}
