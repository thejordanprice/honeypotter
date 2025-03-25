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
    const validAttempts = websocketManager.getAttempts().filter(a => a.latitude && a.longitude);
    
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
    function updateLoadingPercentage(percentage) {
        const percentageElement = domUtils.getElement('loadingPercentage');
        const loadingBar = domUtils.getElement('loadingBar');
        const loadingDetail = domUtils.getElement('loadingDetail');
        const loadingText = domUtils.getElement('loadingText');
        
        if (percentageElement && loadingBar) {
            const roundedPercentage = Math.round(percentage);
            percentageElement.textContent = `${roundedPercentage}%`;
            loadingBar.style.width = `${roundedPercentage}%`;
            
            // Update loading detail text based on percentage
            if (loadingDetail && loadingText) {
                if (percentage <= 10) {
                    loadingText.textContent = 'Initializing...';
                    loadingDetail.textContent = 'Preparing connection';
                } else if (percentage <= 30) {
                    loadingText.textContent = 'Connecting...';
                    loadingDetail.textContent = 'Establishing WebSocket connection';
                } else if (percentage <= 50) {
                    loadingText.textContent = 'Loading...';
                    loadingDetail.textContent = 'Fetching attack data';
                } else if (percentage <= 70) {
                    loadingText.textContent = 'Processing...';
                    loadingDetail.textContent = 'Analyzing attack patterns';
                } else if (percentage <= 90) {
                    loadingText.textContent = 'Finalizing...';
                    loadingDetail.textContent = 'Preparing visualization';
                } else {
                    loadingText.textContent = 'Complete';
                    loadingDetail.textContent = 'Starting application';
                }
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
        updateUniqueAttackersCount
    };
})();

// WebSocket module
const websocketManager = (function() {
    let socket = null;
    let attempts = [];
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
        
        initial_attempts: function(data) {
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
        uiManager.updateLoadingPercentageWithDelay(10); // Start at 10%
        
        socket = new WebSocket(wsUrl);
        // Explicitly set socket on window object to make it accessible from other scripts
        window.socket = socket;

        socket.onopen = async function() {
            uiManager.updateConnectionStatus('Connected to WebSocket');
            await uiManager.updateLoadingPercentageWithDelay(30); // WebSocket connected
            
            // Explicitly request external IP data to make sure it's available
            if (socket.readyState === WebSocket.OPEN) {
                console.log('Requesting external IP on connection');
                socket.send(JSON.stringify({
                    type: 'request_external_ip'
                }));
            }
            
            // No need to fetch data separately now, as it will come via WebSocket
            await uiManager.updateLoadingPercentageWithDelay(50); // Data request sent
        };

        socket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                console.log('Received WebSocket message:', message);
                
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
            
            // Fallback to traditional GET request if WebSocket fails
            fallbackFetch();
        };

        socket.onclose = function() {
            uiManager.updateConnectionStatus('WebSocket connection closed. Reconnecting...', true);
            
            // Clear the window.socket reference since it's no longer valid
            window.socket = null;
            
            // If we haven't loaded data yet, use fallback
            if (attempts.length === 0) {
                fallbackFetch();
            } else {
                setTimeout(connect, 5000);
            }
        };
    }

    function sendMessage(type, data = {}) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: type,
                data: data
            }));
            return true;
        }
        return false;
    }

    function fallbackFetch() {
        console.log('Falling back to traditional fetch method');
        uiManager.updateLoadingPercentageWithDelay(40).then(() => {
            return fetch('/api/attempts');
        }).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        }).then(async data => {
            await uiManager.updateLoadingPercentageWithDelay(60);
            attempts = data;
            
            await uiManager.updateLoadingPercentageWithDelay(80);
            
            // Initialize the counters with animation
            uiManager.updateCounterWithAnimation('totalAttempts', attempts.length);
            uiManager.updateUniqueAttackersCount();
            
            await uiManager.updateLoadingPercentageWithDelay(90);
            
            // Initialize UI with the data
            uiManager.updateUI();
            dataModel.centerMapOnMostActiveRegion(attempts);
            
            await uiManager.updateLoadingPercentageWithDelay(100);
            
            setTimeout(() => uiManager.toggleLoadingOverlay(false), 500);
            
            // Try to reconnect WebSocket in the background
            setTimeout(connect, 5000);
        }).catch(error => {
            console.error('Error in fallback fetch:', error);
            uiManager.toggleLoadingOverlay(false);
            // Show error message to user
            const message = `Failed to load data. Please refresh the page to try again. Error: ${error.message}`;
            console.error(message);
            alert(message);
        });
    }

    function getAttempts() {
        return attempts;
    }

    return {
        connect,
        sendMessage,
        fallbackFetch,
        getAttempts
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
            });
        }
        
        if (filterSelect) {
            filterSelect.addEventListener('change', () => {
                paginationUtils.currentPage = 1;
                uiManager.updateUI();
            });
        }
        
        if (protocolSelect) {
            protocolSelect.addEventListener('change', () => {
                paginationUtils.currentPage = 1;
                uiManager.updateUI();
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