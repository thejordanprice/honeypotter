// Helper function to format dates
function formatDateToLocalTime(isoString) {
    return formatUtils.formatDateToLocalTime(isoString);
}

// Initialize map with light/dark theme support
const map = L.map('map').setView([20, 0], 2);
let currentTileLayer;
let heatLayer;

// Make map variables accessible globally
window.map = map;
window.currentTileLayer = currentTileLayer;
window.heatLayer = heatLayer;

// Function to center map on most active region
function centerMapOnMostActiveRegion(attempts) {
    return dataModel.centerMapOnMostActiveRegion(attempts);
}

const lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
});

const darkTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    className: 'dark-tiles'
});

// Make tile layers accessible globally
window.lightTileLayer = lightTileLayer;
window.darkTileLayer = darkTileLayer;

// Initialize the appropriate tile layer based on theme
const isDarkMode = document.documentElement.classList.contains('dark');
currentTileLayer = isDarkMode ? darkTileLayer : lightTileLayer;
currentTileLayer.addTo(map);
window.currentTileLayer = currentTileLayer;

// Function to update map with heat data
function updateMap(attempt) {
    if (!attempt.latitude || !attempt.longitude) return;
    
    // Make sure map is properly initialized
    dataModel.ensureMapInitialized();

    // Remove existing heat layer if it exists
    if (window.heatLayer) {
        window.map.removeLayer(window.heatLayer);
    }

    // Get all attempts with valid coordinates
    // Use filtered attempts instead of all attempts
    const attempts = websocketManager.getAttempts();
    const filteredAttempts = dataModel.filterAttempts(attempts);
    const validAttempts = filteredAttempts.filter(a => a.latitude && a.longitude);
    
    // Create heatmap data points with intensity based on frequency
    const locationFrequency = {};
    validAttempts.forEach(a => {
        const key = `${a.latitude},${a.longitude}`;
        locationFrequency[key] = (locationFrequency[key] || 0) + 1;
    });

    const heatData = validAttempts.map(a => {
        const key = `${a.latitude},${a.longitude}`;
        const intensity = Math.min(locationFrequency[key] / 5, 1); // Normalize intensity
        return [a.latitude, a.longitude, intensity];
    });

    // Create and add the heat layer
    window.heatLayer = L.heatLayer(heatData, {
        radius: 15,
        blur: 10,
        maxZoom: 10,
        max: 1.0,
        gradient: {
            0.4: 'blue',
            0.6: 'lime',
            0.8: 'yellow',
            1.0: 'red'
        }
    }).addTo(window.map);
}

const attemptsDiv = document.getElementById("attempts");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const protocolSelect = document.getElementById("protocolSelect");
const connectionStatus = document.getElementById("connectionStatus");
let attempts = [];
let socket = null;

// UI utilities module
const uiManager = (function() {
    function updateLoadingStatus(statusText, detailText) {
        // Update the loading status elements
        const loadingText = domUtils.getElement('loadingText');
        const loadingDetail = domUtils.getElement('loadingDetail');
        
        if (loadingText && statusText) {
            loadingText.textContent = statusText;
        }
        
        if (loadingDetail && detailText) {
            loadingDetail.textContent = detailText;
            // Log the status update to console for tracking
            console.log(`Loading Status: ${statusText || "(unchanged)"} - ${detailText}`);
        }
    }
    
    function updateLoadingPercentage(percentage) {
        const percentageElement = domUtils.getElement('loadingPercentage');
        const loadingBar = domUtils.getElement('loadingBar');
        const loadingDetail = domUtils.getElement('loadingDetail');
        const loadingText = domUtils.getElement('loadingText');
        
        if (percentageElement && loadingBar) {
            const currentPercentage = parseInt(percentageElement.textContent) || 0;
            const targetPercentage = Math.round(percentage);
            
            // If the target is less than current, just update directly
            if (targetPercentage <= currentPercentage) {
                percentageElement.textContent = `${targetPercentage}%`;
                loadingBar.style.width = `${targetPercentage}%`;
            } else {
                // Animate from current to target percentage
                const minDuration = 10; // Minimum milliseconds between increments
                const maxDuration = 25; // Maximum milliseconds between increments
                const steps = targetPercentage - currentPercentage;
                
                // Cancel any existing animation
                if (window.loadingAnimationId) {
                    clearTimeout(window.loadingAnimationId);
                    window.loadingAnimationId = null;
                }
                
                let currentStep = 0;
                const animate = () => {
                    if (currentStep >= steps) return;
                    
                    currentStep++;
                    const newPercentage = currentPercentage + currentStep;
                    
                    percentageElement.textContent = `${newPercentage}%`;
                    loadingBar.style.width = `${newPercentage}%`;
                    
                    // Update loading detail text based on percentage, but only during initial loading
                    // Don't change messages during batch loading (when isReceivingBatches is true)
                    if (loadingDetail && loadingText && !window.isReceivingBatches) {
                        let statusText = loadingText.textContent;
                        let detailText = loadingDetail.textContent;
                        
                        if (newPercentage <= 10) {
                            statusText = 'Initializing...';
                            detailText = 'Preparing connection parameters';
                        } else if (newPercentage <= 20) {
                            statusText = 'Connecting...';
                            detailText = 'Establishing WebSocket connection';
                        } else if (newPercentage <= 30) {
                            statusText = 'Connected';
                            detailText = 'WebSocket connected, requesting data';
                        } else if (newPercentage <= 50) {
                            statusText = 'Loading Data...';
                            detailText = 'Receiving data from server';
                        } else if (newPercentage <= 70) {
                            statusText = 'Processing...';
                            detailText = 'Processing data and attack patterns';
                        } else if (newPercentage <= 90) {
                            statusText = 'Finalizing...';
                            detailText = 'Setting up interface components';
                        } else {
                            statusText = 'Complete';
                            detailText = 'Application ready';
                        }
                        
                        // Only update if they would change
                        if (statusText !== loadingText.textContent || detailText !== loadingDetail.textContent) {
                            updateLoadingStatus(statusText, detailText);
                        }
                    }
                    
                    if (currentStep < steps) {
                        // Calculate dynamic duration - faster as we get closer to target
                        // or when there are large jumps to make
                        let dynamicDuration;
                        if (steps > 20) {
                            // For large jumps, use very short duration
                            dynamicDuration = minDuration;
                        } else {
                            // Linear interpolation between min and max duration
                            const progress = currentStep / steps;
                            dynamicDuration = maxDuration - (progress * (maxDuration - minDuration));
                        }
                        
                        window.loadingAnimationId = setTimeout(animate, dynamicDuration);
                    }
                };
                
                animate();
            }
        }
    }
    
    function toggleLoadingOverlay(show, percentage = null) {
        const overlay = domUtils.getElement('loadingOverlay');
        if (!overlay) return;
        
        if (show) {
            domUtils.removeClass(overlay, 'hidden');
            document.body.style.overflow = 'hidden';
            
            if (percentage !== null) {
                updateLoadingPercentage(percentage);
            }
            
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                overlay.style.visibility = 'visible';
            });
        } else {
            // Cancel any running loading animation
            if (window.loadingAnimationId) {
                clearTimeout(window.loadingAnimationId);
                window.loadingAnimationId = null;
                
                // Force the loading bar to 100% before hiding
                const percentageElement = domUtils.getElement('loadingPercentage');
                const loadingBar = domUtils.getElement('loadingBar');
                if (percentageElement) percentageElement.textContent = '100%';
                if (loadingBar) loadingBar.style.width = '100%';
            }
            
            overlay.style.opacity = '0';
            overlay.style.visibility = 'hidden';
            document.body.style.overflow = '';
            
            setTimeout(() => {
                domUtils.addClass(overlay, 'hidden');
                updateLoadingPercentage(0);
            }, 300);
        }
    }
    
    function updateLoadingPercentageWithDelay(percentage) {
        return new Promise(resolve => {
            setTimeout(() => {
                updateLoadingPercentage(percentage);
                resolve();
            }, 300); // Increased delay to 300ms for smoother transitions
        });
    }
    
    function updateConnectionStatus(status, isError = false) {
        const indicator = domUtils.getElement('connectionStatusIndicator');
        if (!indicator) return;
        
        const svg = indicator.querySelector('svg');
        if (!svg) return;
        
        if (status.includes('Connected')) {
            indicator.className = 'connected';
            svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
            domUtils.removeClass(svg, 'animate-spin');
        } else if (status.includes('Connecting')) {
            indicator.className = 'reconnecting';
            svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>';
            domUtils.addClass(svg, 'animate-spin');
        } else {
            indicator.className = 'disconnected';
            svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
            domUtils.removeClass(svg, 'animate-spin');
        }
    }
    
    function updateCounterWithAnimation(elementId, newValue) {
        animationUtils.updateElementWithAnimation(elementId, newValue);
    }
    
    function createAttemptElement(attempt) {
        const location = [
            attempt.city,
            attempt.region,
            attempt.country
        ].filter(Boolean).join(', ');

        const usernameDisplay = attempt.username ? attempt.username : '[User Null]';
        const passwordDisplay = attempt.protocol === 'rdp' ? '[Password Unavailable]' : 
                              (attempt.password ? attempt.password : '[Password Null]');

        return `
            <div class="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                <div class="flex flex-col sm:flex-row justify-between gap-2">
                    <span class="font-semibold break-all">
                        ${usernameDisplay}@${attempt.client_ip}
                        <span class="inline-block px-2 py-1 text-xs rounded-full ml-2">
                            ${attempt.protocol.toUpperCase()}
                        </span>
                    </span>
                    <span class="text-gray-500 text-sm">${formatUtils.formatDateToLocalTime(attempt.timestamp)}</span>
                </div>
                <div class="text-gray-600 mt-2">
                    <div class="break-all">Password: ${passwordDisplay}</div>
                    ${location ? `<div class="text-sm mt-1">Location: ${location}</div>` : ''}
                </div>
            </div>
        `;
    }
    
    function updateUI() {
        const attemptsDiv = document.getElementById("attempts");
        const attempts = websocketManager.getAttempts();
        const filteredAttempts = dataModel.filterAttempts(attempts);
        const totalItems = filteredAttempts.length;
        
        paginationUtils.updateControls(totalItems);
        
        const paginatedAttempts = paginationUtils.getCurrentPageData(filteredAttempts);
        attemptsDiv.innerHTML = paginatedAttempts
            .map(createAttemptElement)
            .join('');

        updateVisualizations(filteredAttempts);
        
        // Update map to reflect current filtered data
        updateMap({latitude: 0, longitude: 0});
    }
    
    function updateUniqueAttackersCount() {
        const attempts = websocketManager.getAttempts();
        const uniqueCount = dataModel.getUniqueAttackers(attempts);
        const currentCount = parseInt(domUtils.getElement('uniqueAttackers')?.textContent) || 0;
        
        if (currentCount !== uniqueCount) {
            updateCounterWithAnimation('uniqueAttackers', uniqueCount);
        }
    }
    
    return {
        updateLoadingPercentage,
        toggleLoadingOverlay,
        updateLoadingPercentageWithDelay,
        updateConnectionStatus,
        updateCounterWithAnimation,
        createAttemptElement,
        updateUI,
        updateUniqueAttackersCount,
        updateLoadingStatus
    };
})();

// WebSocket module
const websocketManager = (function() {
    let socket = null;
    let attempts = [];
    let batchesPending = 0;
    let batchesReceived = 0;
    let totalBatches = 0;
    let isReceivingBatches = false;
    let reconnectAttempts = 0;
    let maxReconnectAttempts = 10; // Increased from 5 to 10 for more resilience
    let reconnectDelay = 1000; // Start with 1s delay, will increase exponentially
    let batchTimeout = null; // Timeout for batch loading
    let pendingBatchRequest = false;
    
    // Expose isReceivingBatches to the window to prevent automatic status updates during batch loading
    window.isReceivingBatches = false;
    
    const messageHandlers = {
        login_attempt: function(data) {
            const newAttempt = data;
            console.log('Received new attempt:', newAttempt);
            
            // Check if this IP is new before adding the attempt
            const isNewAttacker = !attempts.some(attempt => attempt.client_ip === newAttempt.client_ip);
            
            attempts.unshift(newAttempt);
            uiManager.updateCounterWithAnimation('totalAttempts', attempts.length);
            
            // Only update unique attackers if this is a new IP
            if (isNewAttacker) {
                uiManager.updateUniqueAttackersCount();
            }
            
            updateMap(newAttempt);
            
            // Reset to page 1 when new attempt comes in
            paginationUtils.currentPage = 1;
            uiManager.updateUI();
            
            const indicator = domUtils.getElement('connectionStatusIndicator');
            if (indicator) {
                indicator.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    indicator.style.transform = 'scale(1)';
                }, 200);
            }
        },
        
        batch_start: function(data) {
            console.log('Starting batch data transfer', data);
            isReceivingBatches = true;
            window.isReceivingBatches = true; // Update window variable
            totalBatches = data.total_batches;
            batchesReceived = 0;
            batchesPending = totalBatches;
            attempts = [];
            
            // Update loading progress to indicate batch transfer is starting
            uiManager.updateLoadingPercentageWithDelay(35).then(() => {
                uiManager.updateLoadingStatus('Loading Data...', 
                    `Starting data transfer: 0/${totalBatches} batches`);
            });
            
            // Set a timeout to detect stalled batch transfers
            clearTimeout(batchTimeout);
            batchTimeout = setTimeout(() => {
                if (isReceivingBatches && batchesPending > 0) {
                    console.warn(`Batch transfer stalled at ${batchesReceived}/${totalBatches} batches`);
                    uiManager.updateLoadingStatus('Transfer Stalled', 
                        `Data transfer stalled at ${batchesReceived}/${totalBatches} batches`);
                    requestMissingBatches();
                }
            }, 10000); // 10 second timeout
        },
        
        batch_data: function(data) {
            console.log(`Received batch ${data.batch_number}/${totalBatches}`);
            
            // Reset timeout on receiving batch data
            clearTimeout(batchTimeout);
            batchTimeout = setTimeout(() => {
                if (isReceivingBatches && batchesPending > 0) {
                    console.warn(`Batch transfer stalled at ${batchesReceived}/${totalBatches} batches`);
                    uiManager.updateLoadingStatus('Transfer Stalled', 
                        `Data transfer stalled at ${batchesReceived}/${totalBatches} batches`);
                    requestMissingBatches();
                }
            }, 10000); // 10 second timeout
            
            // Validate batch data
            if (!Array.isArray(data.attempts)) {
                console.error('Received invalid batch data structure');
                uiManager.updateLoadingStatus('Error', 'Error: Received invalid data structure from server');
                return;
            }
            
            // Add the batch data to our attempts array
            attempts.push(...data.attempts);
            
            batchesReceived++;
            batchesPending--;
            
            // Calculate progress percentage (35-70% range)
            const progressPercent = (batchesReceived / totalBatches) * 100;
            const scaledProgress = 35 + (progressPercent * 0.35);
            
            // Update UI with progress but only update the loading bar, not status via updateLoadingPercentage
            const percentageElement = domUtils.getElement('loadingPercentage');
            const loadingBar = domUtils.getElement('loadingBar');
            if (percentageElement) percentageElement.textContent = `${Math.round(scaledProgress)}%`;
            if (loadingBar) loadingBar.style.width = `${Math.round(scaledProgress)}%`;
            
            // Directly update loading status text without triggering automatic status changes
            uiManager.updateLoadingStatus('Loading Data...', 
                `Receiving data: ${batchesReceived}/${totalBatches} batches (${Math.round(progressPercent)}%)`);
            
            // Send acknowledgment to server that we received this batch
            sendMessage('batch_ack', { batch_number: data.batch_number });
        },
        
        batch_complete: function(data) {
            console.log('Batch transfer complete');
            isReceivingBatches = false;
            window.isReceivingBatches = false; // Update window variable
            
            // Clear batch timeout
            clearTimeout(batchTimeout);
            
            // Verify we received all batches
            if (batchesReceived !== totalBatches) {
                console.warn(`Batch transfer completed but only received ${batchesReceived}/${totalBatches} batches`);
                // Request missing batches if any
                uiManager.updateLoadingStatus('Transfer Stalled', 
                    `Transfer incomplete, requesting missing data`);
                requestMissingBatches();
            } else {
                console.log(`Successfully received all ${totalBatches} batches with ${attempts.length} total attempts`);
                // Skip the transfer complete message and go straight to processing
                uiManager.updateLoadingStatus('Processing...', 
                    `Processing ${attempts.length} login attempts`);
                finalizeBatchLoading();
            }
        },
        
        batch_error: function(data) {
            console.error('Batch transfer error:', data.error, data.message);
            
            // Update UI to show error
            uiManager.updateLoadingStatus('Error', 
                `Data transfer error, reconnecting...`);
            
            // Clear batch timeout and state
            clearTimeout(batchTimeout);
            isReceivingBatches = false;
            window.isReceivingBatches = false; // Update window variable
            
            // Force reconnection after a brief delay
            setTimeout(() => {
                if (socket) {
                    socket.close();
                } else {
                    reconnect();
                }
            }, 2000);
        },
        
        initial_attempts: function(data) {
            // This is kept for backward compatibility
            attempts = data;
            
            // Update loading progress
            uiManager.updateLoadingPercentageWithDelay(70).then(() => {
                // Initialize the counters with animation
                uiManager.updateCounterWithAnimation('totalAttempts', attempts.length);
                uiManager.updateUniqueAttackersCount();
                
                return uiManager.updateLoadingPercentageWithDelay(90);
            }).then(() => {
                // Initialize UI with the data
                uiManager.updateUI();
                dataModel.centerMapOnMostActiveRegion(attempts);
                
                return uiManager.updateLoadingPercentageWithDelay(100);
            }).then(() => {
                // Hide loading overlay
                setTimeout(() => uiManager.toggleLoadingOverlay(false), 500);
            });
        },
        
        data_progress: function(data) {
            // Handle progress updates during data transfer
            if (data && typeof data.progress === 'number') {
                // Scale the progress to be between 30% and 70%
                // 0% from server = 30% on UI, 100% from server = 70% on UI
                const scaledProgress = 30 + (data.progress * 0.4);
                uiManager.updateLoadingPercentage(scaledProgress);
                
                // Update loading text based on progress
                const loadingDetail = domUtils.getElement('loadingDetail');
                if (loadingDetail) {
                    loadingDetail.textContent = `Downloading data: ${Math.round(data.progress)}%`;
                }
            }
        },
        
        system_metrics: function(data) {
            console.log('Received system metrics');
            if (typeof processSystemMetrics === 'function') {
                processSystemMetrics(data);
            }
        },
        
        service_status: function(data) {
            console.log('Received service status');
            if (typeof processServiceStatus === 'function') {
                processServiceStatus(data);
            }
        },
        
        external_ip: function(data) {
            console.log('Received external IP data', data);
            if (typeof processExternalIP === 'function') {
                // Pass the entire data object to allow proper handling
                processExternalIP(data);
                
                // Also log what we're receiving to help debug
                console.log('External IP data details:', {
                    dataType: typeof data,
                    hasIpProperty: data && typeof data === 'object' ? 'ip' in data : 'N/A',
                    raw: JSON.stringify(data)
                });
            }
        }
    };

    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        uiManager.updateConnectionStatus('Connecting to WebSocket...');
        uiManager.updateLoadingPercentageWithDelay(10).then(() => {
            uiManager.updateLoadingStatus('Initializing...', 'Preparing connection parameters');
        });
        
        socket = new WebSocket(wsUrl);
        // Explicitly set socket on window object to make it accessible from other scripts
        window.socket = socket;

        socket.onopen = async function() {
            // Reset reconnect attempts on successful connection
            reconnectAttempts = 0;
            reconnectDelay = 1000;
            
            uiManager.updateConnectionStatus('Connected to WebSocket');
            await uiManager.updateLoadingPercentageWithDelay(25); // WebSocket connected - update to 25%
            
            // Update loading detail to show we're waiting for data
            uiManager.updateLoadingStatus('Connected', 'WebSocket connected, requesting data');
            
            // Request data in batches
            sendMessage('request_data_batches');
            pendingBatchRequest = true;
            
            // Set a timeout for the initial batch start response
            clearTimeout(batchTimeout);
            batchTimeout = setTimeout(() => {
                if (pendingBatchRequest) {
                    console.warn('No batch_start response received, retrying request');
                    uiManager.updateLoadingStatus('Waiting...', 'Server delayed, retrying data request');
                    sendMessage('request_data_batches');
                    
                    // Set another timeout for another retry
                    batchTimeout = setTimeout(() => {
                        if (pendingBatchRequest) {
                            console.warn('Still no batch response, forcing reconnection');
                            pendingBatchRequest = false;
                            
                            uiManager.updateLoadingStatus('Reconnecting...', 
                                `Connection lost. Reconnecting in ${Math.round(delay/1000)}s (${reconnectAttempts}/${maxReconnectAttempts})`);
                            
                            // Force reconnection instead of falling back to HTTP
                            if (socket) {
                                socket.close();
                            } else {
                                reconnect();
                            }
                        }
                    }, 10000);
                }
            }, 5000);
            
            // Explicitly request external IP data to make sure it's available
            if (socket.readyState === WebSocket.OPEN) {
                console.log('Requesting external IP on connection');
                socket.send(JSON.stringify({
                    type: 'request_external_ip'
                }));
            }
        };

        socket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                console.log('Received WebSocket message:', message);
                
                // If receiving batch_start, clear pending batch request flag
                if (message.type === 'batch_start') {
                    pendingBatchRequest = false;
                    clearTimeout(batchTimeout);
                }
                
                // Use the appropriate handler based on message type
                if (message.type && messageHandlers[message.type]) {
                    messageHandlers[message.type](message.data);
                } else {
                    console.warn('Unknown message type:', message.type);
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };

        socket.onerror = function(error) {
            uiManager.updateConnectionStatus('WebSocket error: ' + error.message, true);
            console.error('WebSocket error:', error);
            
            // Clear pending batch request timeout
            clearTimeout(batchTimeout);
            pendingBatchRequest = false;
            
            // Always try to reconnect when there's an error
            reconnect();
        };

        socket.onclose = function() {
            uiManager.updateConnectionStatus('WebSocket connection closed. Reconnecting...', true);
            
            // Clear the window.socket reference since it's no longer valid
            window.socket = null;
            
            // Clear pending batch request timeout
            clearTimeout(batchTimeout);
            pendingBatchRequest = false;
            
            // Always try to reconnect on close
            reconnect();
        };
    }

    function reconnect() {
        reconnectAttempts++;
        
        // Make sure we reset the receiving batches state
        isReceivingBatches = false;
        window.isReceivingBatches = false;
        
        if (reconnectAttempts <= maxReconnectAttempts) {
            // Exponential backoff for reconnect attempts
            const delay = Math.min(30000, reconnectDelay * Math.pow(1.5, reconnectAttempts - 1));
            console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts}) in ${delay/1000} seconds...`);
            
            setTimeout(() => {
                connect();
            }, delay);
            
            // Update UI to show reconnection attempt
            uiManager.updateLoadingStatus('Reconnecting...', 
                `Connection lost. Reconnecting in ${Math.round(delay/1000)}s (${reconnectAttempts}/${maxReconnectAttempts})`);
            
            // Show loading overlay if it's not already visible
            const loadingOverlay = domUtils.getElement('loadingOverlay');
            if (loadingOverlay && loadingOverlay.classList.contains('hidden')) {
                uiManager.toggleLoadingOverlay(true, 15);
            }
        } else {
            console.error('Maximum reconnection attempts reached');
            uiManager.updateConnectionStatus('Connection failed after multiple attempts. Please refresh the page.', true);
            
            // Update UI to show failure
            uiManager.updateLoadingStatus('Connection Failed', 
                'Connection failed. Please refresh the page');
            
            // Update loading percentage to 100% to allow user to dismiss the overlay
            uiManager.updateLoadingPercentage(100);
            
            // Add a refresh button to the loading overlay
            const loadingActions = domUtils.getElement('loadingActions');
            if (loadingActions) {
                loadingActions.innerHTML = '<button id="refreshPageButton" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Refresh Page</button>';
                
                // Add event listener to the refresh button
                const refreshButton = document.getElementById('refreshPageButton');
                if (refreshButton) {
                    refreshButton.addEventListener('click', () => {
                        window.location.reload();
                    });
                }
            }
        }
    }

    function sendMessage(type, data = {}) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({
                    type: type,
                    data: data
                }));
                return true;
            } catch (error) {
                console.error('Error sending WebSocket message:', error);
                return false;
            }
        }
        console.warn('Cannot send message, socket not open');
        return false;
    }
    
    function requestMissingBatches() {
        if (batchesPending <= 0) return;
        
        console.log(`Requesting ${batchesPending} missing batches`);
        isReceivingBatches = true;
        window.isReceivingBatches = true; // Update window variable
        
        // Calculate which batches we're missing
        const receivedBatchNumbers = new Set();
        for (let i = 0; i < batchesReceived; i++) {
            receivedBatchNumbers.add(i + 1);
        }
        
        const missingBatches = [];
        for (let i = 1; i <= totalBatches; i++) {
            if (!receivedBatchNumbers.has(i)) {
                missingBatches.push(i);
            }
        }
        
        // Update UI to show we're waiting for missing batches
        const batchesStr = missingBatches.length <= 5 
            ? missingBatches.join(', ') 
            : `${missingBatches.slice(0, 3).join(', ')}... (${missingBatches.length} total)`;
        
        uiManager.updateLoadingStatus('Recovery Mode', `Requesting missing batches`);
        
        // Request missing batches
        const success = sendMessage('request_missing_batches', { batch_numbers: missingBatches });
        
        // Set a timeout to detect if we don't receive the missing batches
        if (success) {
            clearTimeout(batchTimeout);
            batchTimeout = setTimeout(() => {
                if (isReceivingBatches && batchesPending > 0) {
                    console.warn('Did not receive missing batches in time, forcing reconnection');
                    
                    uiManager.updateLoadingStatus('Recovery Failed', 
                        'Missing batches timeout, reconnecting');
                    
                    // Reset the receiving batches state
                    isReceivingBatches = false;
                    window.isReceivingBatches = false;
                    
                    // Force a reconnection instead of falling back to HTTP
                    if (socket) {
                        socket.close();
                    } else {
                        reconnect();
                    }
                }
            }, 15000); // 15 second timeout for missing batches
        } else {
            // If we couldn't even send the request, force reconnection
            console.warn('Failed to request missing batches, forcing reconnection');
            
            uiManager.updateLoadingStatus('Recovery Failed', 
                'Unable to request missing data, reconnecting');
            
            // Reset the receiving batches state
            isReceivingBatches = false;
            window.isReceivingBatches = false;
            
            if (socket) {
                socket.close();
            } else {
                reconnect();
            }
        }
    }
    
    function finalizeBatchLoading() {
        clearTimeout(batchTimeout);
        
        uiManager.updateLoadingPercentageWithDelay(70).then(() => {
            // Initialize the counters with animation
            uiManager.updateCounterWithAnimation('totalAttempts', attempts.length);
            uiManager.updateUniqueAttackersCount();
            
            // Keep the same message format and similar length for consistency
            uiManager.updateLoadingStatus('Processing...', 'Preparing data visualization and attack map');
            
            return uiManager.updateLoadingPercentageWithDelay(85);
        }).then(() => {
            // Initialize UI with the data
            uiManager.updateUI();
            dataModel.centerMapOnMostActiveRegion(attempts);
            
            // Keep similar text length for consistent layout
            uiManager.updateLoadingStatus('Finalizing...', 'Setting up interface components and controls');
            
            return uiManager.updateLoadingPercentageWithDelay(100);
        }).then(() => {
            // Use a short message for completion to avoid layout shifts
            uiManager.updateLoadingStatus('Complete', 'Application ready');
            
            // Hide loading overlay after a short delay to show the "ready" message
            setTimeout(() => uiManager.toggleLoadingOverlay(false), 800);
        });
    }

    function getAttempts() {
        return attempts;
    }
    
    function isBatchComplete() {
        return !isReceivingBatches || batchesPending === 0;
    }

    return {
        connect,
        sendMessage,
        getAttempts,
        isBatchComplete,
        requestMissingBatches,
        reconnect
    };
})();

// Data model module
const dataModel = (function() {
    function filterAttempts(attempts) {
        const searchInput = document.getElementById("searchInput");
        const filterSelect = document.getElementById("filterSelect");
        const protocolSelect = document.getElementById("protocolSelect");
        
        const searchTerm = searchInput.value.toLowerCase().trim();
        const filterValue = filterSelect.value;
        const protocolValue = protocolSelect.value;
        const now = new Date();

        return attempts.filter(attempt => {
            const matchesSearch = searchTerm === '' || 
                attempt.username.toLowerCase().includes(searchTerm) ||
                attempt.client_ip.includes(searchTerm) ||
                attempt.password.toLowerCase().includes(searchTerm);

            const matchesProtocol = protocolValue === 'all' || attempt.protocol === protocolValue;

            const timestamp = new Date(attempt.timestamp + 'Z');
            let matchesFilter = true;

            switch (filterValue) {
                case 'lastHour':
                    matchesFilter = (now - timestamp) <= (60 * 60 * 1000);
                    break;
                case 'today':
                    const attemptDate = new Date(timestamp.toLocaleDateString());
                    const todayDate = new Date(now.toLocaleDateString());
                    matchesFilter = attemptDate.getTime() === todayDate.getTime();
                    break;
                case 'thisWeek':
                    const weekAgo = new Date(now);
                    weekAgo.setDate(now.getDate() - 7);
                    matchesFilter = timestamp >= weekAgo;
                    break;
                case 'all':
                default:
                    matchesFilter = true;
                    break;
            }

            return matchesSearch && matchesFilter && matchesProtocol;
        });
    }

    function getUniqueAttackers(attempts) {
        return new Set(attempts.map(attempt => attempt.client_ip)).size;
    }

    function centerMapOnMostActiveRegion(attempts) {
        if (!attempts || attempts.length === 0) return;
    
        // Create a grid to count attacks in different regions
        const grid = {};
        const validAttempts = attempts.filter(a => a.latitude && a.longitude);
        
        if (validAttempts.length === 0) return;
    
        // Round coordinates to create grid cells (1 degree resolution)
        validAttempts.forEach(attempt => {
            const lat = Math.round(attempt.latitude);
            const lng = Math.round(attempt.longitude);
            const key = `${lat},${lng}`;
            grid[key] = (grid[key] || 0) + 1;
        });
    
        // Find the cell with most attacks
        let maxCount = 0;
        let hotspotCenter = null;
        
        for (const [coords, count] of Object.entries(grid)) {
            if (count > maxCount) {
                maxCount = count;
                const [lat, lng] = coords.split(',').map(Number);
                hotspotCenter = [lat, lng];
            }
        }
    
        // If we found a hotspot, center the map there with appropriate zoom
        if (hotspotCenter) {
            const zoom = window.innerWidth <= 768 ? 2 : 3;
            if (window.map) {
                window.map.setView(hotspotCenter, zoom, { animate: true });
            }
        }
    }

    // Make sure the map is properly initialized
    function ensureMapInitialized() {
        console.log("Checking map initialization");
        if (!window.map || !window.map._loaded) {
            console.warn("Map not properly initialized, attempting to fix");
            return false;
        }
        
        if (!window.currentTileLayer) {
            console.warn("Tile layer not properly initialized, attempting to fix");
            const isDarkMode = document.documentElement.classList.contains('dark');
            window.currentTileLayer = isDarkMode ? window.darkTileLayer : window.lightTileLayer;
            
            if (window.currentTileLayer) {
                window.currentTileLayer.addTo(window.map);
                console.log("Tile layer re-initialized");
            }
        }
        
        return true;
    }

    // Format date for UI display
    function formatDateToLocalTime(isoString) {
        return formatUtils.formatDateToLocalTime(isoString);
    }

    return {
        filterAttempts,
        getUniqueAttackers,
        centerMapOnMostActiveRegion,
        formatDateToLocalTime,
        ensureMapInitialized
    };
})();

let currentPage = 1;

// Initialization module
const init = (function() {
    function setupEventListeners() {
        // Initialize the element cache first
        domUtils.initializeElementCache();
        
        // Pagination event listeners
        const prevPageBtn = domUtils.getElement('prevPage');
        const nextPageBtn = domUtils.getElement('nextPage');
        
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                paginationUtils.prevPage(dataModel.filterAttempts(websocketManager.getAttempts()), () => uiManager.updateUI());
            });
        }
        
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                paginationUtils.nextPage(dataModel.filterAttempts(websocketManager.getAttempts()), () => uiManager.updateUI());
            });
        }
        
        // Search and filter event listeners
        const searchInput = domUtils.getElement('searchInput');
        const filterSelect = domUtils.getElement('filterSelect');
        const protocolSelect = domUtils.getElement('protocolSelect');
        
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                paginationUtils.currentPage = 1;
                uiManager.updateUI();
                // Update map to reflect filtered data
                updateMap({latitude: 0, longitude: 0});
            });
        }
        
        if (filterSelect) {
            filterSelect.addEventListener('change', () => {
                paginationUtils.currentPage = 1;
                uiManager.updateUI();
                // Update map to reflect filtered data
                updateMap({latitude: 0, longitude: 0});
            });
        }
        
        if (protocolSelect) {
            protocolSelect.addEventListener('change', () => {
                paginationUtils.currentPage = 1;
                uiManager.updateUI();
                // Update map to reflect filtered data
                updateMap({latitude: 0, longitude: 0});
            });
        }
        
        // Hamburger Menu
        const hamburgerBtn = domUtils.getElement('hamburgerBtn');
        const mobileMenu = domUtils.getElement('mobileMenu');
        const exportIPsMenu = domUtils.getElement('exportIPsMenu');
        const darkModeToggleMenu = domUtils.getElement('darkModeToggleMenu');
        const faqButton = domUtils.getElement('faqButton');
        const faqModal = domUtils.getElement('faqModal');
        const closeFaqModal = domUtils.getElement('closeFaqModal');

        if (hamburgerBtn && mobileMenu) {
            hamburgerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                mobileMenu.classList.toggle('hidden');
                
                if (!mobileMenu.classList.contains('hidden')) {
                    menuUtils.createOverlay();
                } else {
                    const overlay = document.querySelector('.menu-overlay');
                    menuUtils.removeOverlay(overlay);
                }
            });
        }

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (mobileMenu && !mobileMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                menuUtils.closeMenu(mobileMenu);
            }
        });

        // Menu item click handlers
        if (exportIPsMenu) {
            exportIPsMenu.addEventListener('click', () => {
                menuUtils.closeMenu(mobileMenu);
                window.open('/api/export/plaintext', '_blank');
            });
        }

        const exportJSONMenu = domUtils.getElement('exportJSONMenu');
        if (exportJSONMenu) {
            exportJSONMenu.addEventListener('click', () => {
                menuUtils.closeMenu(mobileMenu);
                window.open('/api/export/json', '_blank');
            });
        }

        const exportCSVMenu = domUtils.getElement('exportCSVMenu');
        if (exportCSVMenu) {
            exportCSVMenu.addEventListener('click', () => {
                menuUtils.closeMenu(mobileMenu);
                window.open('/api/export/csv', '_blank');
            });
        }

        if (darkModeToggleMenu) {
            darkModeToggleMenu.addEventListener('click', () => {
                themeManager.toggleTheme();
                menuUtils.closeMenu(mobileMenu);
            });
        }

        // FAQ Modal handlers
        if (faqButton && faqModal) {
            faqButton.addEventListener('click', () => {
                menuUtils.closeMenu(mobileMenu);
                menuUtils.showMenu(faqModal);
                // Force a reflow before any animations
                faqModal.offsetHeight;
            });
        }

        if (closeFaqModal && faqModal) {
            closeFaqModal.addEventListener('click', () => {
                menuUtils.hideMenu(faqModal);
            });

            faqModal.addEventListener('click', (e) => {
                if (e.target === faqModal) {
                    menuUtils.hideMenu(faqModal);
                }
            });
        }

        // Close modals on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                    menuUtils.closeMenu(mobileMenu);
                }
                
                if (faqModal && !faqModal.classList.contains('hidden')) {
                    menuUtils.hideMenu(faqModal);
                }
                
                const systemStatusModal = domUtils.getElement('systemStatusModal');
                if (systemStatusModal && !systemStatusModal.classList.contains('hidden')) {
                    // Use the closeSystemStatusModal function from system-monitor.js
                    if (typeof closeSystemStatusModal === 'function') {
                        closeSystemStatusModal();
                    }
                }
            }
        });
        
        // Make sure map is initialized with the correct tile layer
        if (!window.currentTileLayer && window.map) {
            const isDarkMode = document.documentElement.classList.contains('dark');
            window.currentTileLayer = isDarkMode ? window.darkTileLayer : window.lightTileLayer;
            window.currentTileLayer.addTo(window.map);
        }
    }
    
    function startApplication() {
        themeManager.setupTheme();
        setupEventListeners();
        
        // Make sure map is initialized
        if (window.map && window.lightTileLayer && window.darkTileLayer) {
            const isDarkMode = document.documentElement.classList.contains('dark');
            if (!window.currentTileLayer) {
                window.currentTileLayer = isDarkMode ? window.darkTileLayer : window.lightTileLayer;
                window.currentTileLayer.addTo(window.map);
                console.log("Map initialized during startup");
            }
        } else {
            console.warn("Map elements not available during startup");
        }
        
        // Show loading overlay
        uiManager.toggleLoadingOverlay(true);
        
        // Connect to WebSocket
        websocketManager.connect();
    }
    
    return {
        start: startApplication
    };
})();

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init.start);

// Clean up global event listeners that are now in the init module
// No need to repeat the event listener registrations here 