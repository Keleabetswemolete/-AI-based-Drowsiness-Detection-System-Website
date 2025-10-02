// Dashboard JavaScript - Skeleton for ESP32 integration
// This file will handle real-time data updates and ESP32 communication

// Global variables for dashboard state
let isSessionActive = false;
let sessionStartTime = null;
let drowsinessChart = null;
let totalAlerts = 0;
let sessionData = [];

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function () {
    initializeDashboard();
    initializeChart();
    setupEventListeners();
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

    // Settings sliders
    document.getElementById('drowsinessThreshold').addEventListener('input', updateThreshold);
    document.getElementById('normalBlinkRate').addEventListener('input', updateBlinkRate);
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

    // TODO: Connect to ESP32 via WebSocket/SignalR
    // connectToESP32();
}

// Stop monitoring session
function stopSession() {
    isSessionActive = false;

    updateSessionStatus(false);
    updateSessionControls(false);

    console.log('Session ended. Total alerts:', totalAlerts);
    console.log('Session data points:', sessionData.length);
}

// Export session data
function exportSessionData() {
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
    document.getElementById('exportBtn').disabled = !isActive || sessionData.length === 0;
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

// Simulate ESP32 data reception (for testing)
function simulateESP32Data() {
    if (!isSessionActive) return;

    const mockData = {
        timestamp: new Date(),
        eyeBlinkRate: 15 + Math.random() * 10,
        eyeClosureDuration: Math.random() * 2,
        headMovement: {
            pitch: (Math.random() - 0.5) * 20,
            roll: (Math.random() - 0.5) * 20,
            yaw: (Math.random() - 0.5) * 20
        },
        drowsinessLevel: Math.random() * 100,
        alertTriggered: false,
        batteryLevel: 85 + Math.random() * 15
    };

    // Process received data
    processSensorData(mockData);
}

// Process sensor data from ESP32
function processSensorData(data) {
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
    const threshold = parseInt(document.getElementById('drowsinessThreshold').value);

    if (data.drowsinessLevel >= threshold) {
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

    // Play alert sound (if enabled)
    // playAlertSound();

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

// Generate PDF report (placeholder)
function generatePDFReport() {
    console.log('Generating PDF report...');
    // TODO: Implement PDF generation using jsPDF or server-side generation
    alert('PDF export functionality will be implemented with server-side PDF generation');
}

// Generate CSV export (placeholder)
function generateCSVExport() {
    console.log('Generating CSV export...');
    // TODO: Implement CSV generation
    alert('CSV export functionality will be implemented');
}

// Generate text summary (placeholder)
function generateTextSummary() {
    console.log('Generating text summary...');
    // TODO: Implement text summary generation
    alert('Text summary functionality will be implemented');
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
