// Helper function to format dates
function formatDateToLocalTime(isoString) {
    return dataModel.formatDateToLocalTime(isoString);
}

// Menu and overlay utilities
const menuUtils = {
    hideMenu: function(menu) {
        if (!menu) return;
        domUtils.hide(menu);
    },
    
    showMenu: function(menu) {
        if (!menu) return;
        domUtils.show(menu);
    },
    
    createOverlay: function() {
        const overlay = document.createElement('div');
        overlay.className = 'menu-overlay';
        document.body.appendChild(overlay);
        
        // Force a reflow before adding the active class
        domUtils.forceReflow(overlay);
        domUtils.addClass(overlay, 'active');
        return overlay;
    },
    
    removeOverlay: function(overlay) {
        if (!overlay) return;
        domUtils.removeClass(overlay, 'active');
        overlay.addEventListener('transitionend', () => {
            overlay.remove();
        }, { once: true });
    },
    
    closeMenu: function(menu) {
        this.hideMenu(menu);
        const overlay = document.querySelector('.menu-overlay');
        if (overlay) {
            this.removeOverlay(overlay);
        }
    }
};

// DOM utilities
const domUtils = {
    // Get element by ID with optional fallback value
    getElement: function(id, fallback = null) {
        const element = document.getElementById(id);
        return element || fallback;
    },
    
    // Get elements by query selector
    getElements: function(selector) {
        return document.querySelectorAll(selector);
    },
    
    // Update text content if element exists
    setText: function(id, text) {
        const element = this.getElement(id);
        if (element) {
            element.textContent = text;
            return true;
        }
        return false;
    },
    
    // Add/remove/toggle classes safely
    addClass: function(element, className) {
        if (element && element.classList) {
            element.classList.add(className);
        }
    },
    
    removeClass: function(element, className) {
        if (element && element.classList) {
            element.classList.remove(className);
        }
    },
    
    toggleClass: function(element, className) {
        if (element && element.classList) {
            return element.classList.toggle(className);
        }
        return false;
    },
    
    // Animation helper
    animateElement: function(element, className, duration = 200) {
        if (!element) return;
        this.addClass(element, className);
        setTimeout(() => {
            this.removeClass(element, className);
        }, duration);
    },
    
    // Show/hide elements
    show: function(element) {
        if (element) {
            this.removeClass(element, 'hidden');
        }
    },
    
    hide: function(element) {
        if (element) {
            this.addClass(element, 'hidden');
        }
    },
    
    // Force reflow (used for animations)
    forceReflow: function(element) {
        if (element) {
            void element.offsetHeight;
        }
    }
};

// Initialize map with light/dark theme support
const map = L.map('map').setView([20, 0], 2);
let currentTileLayer;
let heatLayer;

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

// Function to set the appropriate tile layer
function setMapTheme(isDark) {
    if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
    }
    currentTileLayer = isDark ? darkTileLayer : lightTileLayer;
    currentTileLayer.addTo(map);
}

// Initial theme setup is now handled in init.setupTheme()

function updateMap(attempt) {
    if (!attempt.latitude || !attempt.longitude) return;

    // Remove existing heat layer if it exists
    if (heatLayer) {
        map.removeLayer(heatLayer);
    }

    // Get all attempts with valid coordinates
    const validAttempts = attempts.filter(a => a.latitude && a.longitude);
    
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
    heatLayer = L.heatLayer(heatData, {
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
    }).addTo(map);
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
        const element = domUtils.getElement(elementId);
        if (!element) return;
        
        const currentValue = parseInt(element.textContent) || 0;
        
        if (currentValue !== newValue) {
            element.textContent = newValue;
            domUtils.removeClass(element, 'metric-update');
            void element.offsetWidth; // Trigger reflow
            domUtils.addClass(element, 'metric-update');
        }
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
                    <span class="text-gray-500 text-sm">${formatDateToLocalTime(attempt.timestamp)}</span>
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
        const filteredAttempts = filterAttempts(attempts);
        const totalItems = filteredAttempts.length;
        
        paginationUtils.updateControls(totalItems);
        
        const paginatedAttempts = paginationUtils.getCurrentPageData(filteredAttempts);
        attemptsDiv.innerHTML = paginatedAttempts
            .map(createAttemptElement)
            .join('');

        updateVisualizations(filteredAttempts);
    }
    
    return {
        updateLoadingPercentage: updateLoadingPercentage,
        toggleLoadingOverlay: toggleLoadingOverlay,
        updateLoadingPercentageWithDelay: updateLoadingPercentageWithDelay,
        updateConnectionStatus: updateConnectionStatus,
        updateCounterWithAnimation: updateCounterWithAnimation,
        createAttemptElement: createAttemptElement,
        updateUI: updateUI
    };
})();

// Replace original functions with module functions to maintain compatibility
function updateLoadingPercentage(percentage) {
    return uiManager.updateLoadingPercentage(percentage);
}

function toggleLoadingOverlay(show, percentage = null) {
    return uiManager.toggleLoadingOverlay(show, percentage);
}

function updateLoadingPercentageWithDelay(percentage) {
    return uiManager.updateLoadingPercentageWithDelay(percentage);
}

function updateConnectionStatus(status, isError = false) {
    return uiManager.updateConnectionStatus(status, isError);
}

function updateCounterWithAnimation(elementId, newValue) {
    return uiManager.updateCounterWithAnimation(elementId, newValue);
}

function createAttemptElement(attempt) {
    return uiManager.createAttemptElement(attempt);
}

function updateUI() {
    return uiManager.updateUI();
}

// Add function to count unique attackers
function updateUniqueAttackersCount() {
    const attempts = websocketManager.getAttempts();
    const uniqueCount = dataModel.getUniqueAttackers(attempts);
    const currentCount = parseInt(domUtils.getElement('uniqueAttackers')?.textContent) || 0;
    
    if (currentCount !== uniqueCount) {
        updateCounterWithAnimation('uniqueAttackers', uniqueCount);
    }
}

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
            updateCounterWithAnimation('totalAttempts', attempts.length);
            
            // Only update unique attackers if this is a new IP
            if (isNewAttacker) {
                updateUniqueAttackersCount();
            }
            
            updateMap(newAttempt);
            
            // Reset to page 1 when new attempt comes in
            paginationUtils.currentPage = 1;
            updateUI();
            
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
            updateLoadingPercentageWithDelay(70).then(() => {
                // Initialize the counters with animation
                updateCounterWithAnimation('totalAttempts', attempts.length);
                updateUniqueAttackersCount();
                
                return updateLoadingPercentageWithDelay(90);
            }).then(() => {
                // Initialize UI with the data
                updateUI();
                centerMapOnMostActiveRegion(attempts);
                
                return updateLoadingPercentageWithDelay(100);
            }).then(() => {
                // Hide loading overlay
                setTimeout(() => toggleLoadingOverlay(false), 500);
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
        
        updateConnectionStatus('Connecting to WebSocket...');
        updateLoadingPercentageWithDelay(10); // Start at 10%
        
        socket = new WebSocket(wsUrl);
        // Explicitly set socket on window object to make it accessible from other scripts
        window.socket = socket;

        socket.onopen = async function() {
            updateConnectionStatus('Connected to WebSocket');
            await updateLoadingPercentageWithDelay(30); // WebSocket connected
            
            // Explicitly request external IP data to make sure it's available
            if (socket.readyState === WebSocket.OPEN) {
                console.log('Requesting external IP on connection');
                socket.send(JSON.stringify({
                    type: 'request_external_ip'
                }));
            }
            
            // No need to fetch data separately now, as it will come via WebSocket
            await updateLoadingPercentageWithDelay(50); // Data request sent
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
            updateConnectionStatus('WebSocket error: ' + error.message, true);
            console.error('WebSocket error:', error);
            
            // Fallback to traditional GET request if WebSocket fails
            fallbackToTraditionalFetch();
        };

        socket.onclose = function() {
            updateConnectionStatus('WebSocket connection closed. Reconnecting...', true);
            
            // Clear the window.socket reference since it's no longer valid
            window.socket = null;
            
            // If we haven't loaded data yet, use fallback
            if (attempts.length === 0) {
                fallbackToTraditionalFetch();
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
        updateLoadingPercentageWithDelay(40).then(() => {
            return fetch('/api/attempts');
        }).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        }).then(async data => {
            await updateLoadingPercentageWithDelay(60);
            attempts = data;
            
            await updateLoadingPercentageWithDelay(80);
            
            // Initialize the counters with animation
            updateCounterWithAnimation('totalAttempts', attempts.length);
            updateUniqueAttackersCount();
            
            await updateLoadingPercentageWithDelay(90);
            
            // Initialize UI with the data
            updateUI();
            centerMapOnMostActiveRegion(attempts);
            
            await updateLoadingPercentageWithDelay(100);
            
            setTimeout(() => toggleLoadingOverlay(false), 500);
            
            // Try to reconnect WebSocket in the background
            setTimeout(connect, 5000);
        }).catch(error => {
            console.error('Error in fallback fetch:', error);
            toggleLoadingOverlay(false);
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
        connect: connect,
        sendMessage: sendMessage,
        fallbackFetch: fallbackFetch,
        getAttempts: getAttempts
    };
})();

// Replace old functions with the new module
function connectWebSocket() {
    websocketManager.connect();
}

function fallbackToTraditionalFetch() {
    websocketManager.fallbackFetch();
}

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
            map.setView(hotspotCenter, zoom, { animate: true });
        }
    }

    // Format date for UI display
    function formatDateToLocalTime(isoString) {
        const date = new Date(isoString + 'Z');  // Ensure UTC interpretation
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }

    return {
        filterAttempts: filterAttempts,
        getUniqueAttackers: getUniqueAttackers,
        centerMapOnMostActiveRegion: centerMapOnMostActiveRegion,
        formatDateToLocalTime: formatDateToLocalTime
    };
})();

// Replace old functions with the new module
function filterAttempts(attempts) {
    return dataModel.filterAttempts(attempts);
}

function centerMapOnMostActiveRegion(attempts) {
    return dataModel.centerMapOnMostActiveRegion(attempts);
}

function formatDateToLocalTime(isoString) {
    return dataModel.formatDateToLocalTime(isoString);
}

// Pagination utilities
const paginationUtils = {
    currentPage: 1,
    itemsPerPage: 10,
    
    // Get current page of data
    getCurrentPageData: function(data) {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, data.length);
        return data.slice(startIndex, endIndex);
    },
    
    // Update pagination controls
    updateControls: function(totalItems) {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, totalItems);
        
        domUtils.setText('startRange', totalItems ? startIndex + 1 : 0);
        domUtils.setText('endRange', endIndex);
        domUtils.setText('totalItems', totalItems);
        
        const prevButton = domUtils.getElement('prevPage');
        const nextButton = domUtils.getElement('nextPage');
        
        if (prevButton) {
            prevButton.disabled = this.currentPage === 1;
        }
        
        if (nextButton) {
            nextButton.disabled = endIndex >= totalItems;
        }
    },
    
    goToPage: function(page, data, updateCallback) {
        this.currentPage = page;
        this.updateControls(data.length);
        
        if (typeof updateCallback === 'function') {
            updateCallback(this.getCurrentPageData(data));
        }
    },
    
    nextPage: function(data, updateCallback) {
        const totalPages = Math.ceil(data.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.goToPage(this.currentPage + 1, data, updateCallback);
        }
    },
    
    prevPage: function(data, updateCallback) {
        if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1, data, updateCallback);
        }
    }
};

let currentPage = 1;

// Initialization module
const init = (function() {
    function setupEventListeners() {
        // Pagination event listeners
        document.getElementById('prevPage')?.addEventListener('click', () => {
            paginationUtils.prevPage(filterAttempts(websocketManager.getAttempts()), () => updateUI());
        });
        
        document.getElementById('nextPage')?.addEventListener('click', () => {
            paginationUtils.nextPage(filterAttempts(websocketManager.getAttempts()), () => updateUI());
        });
        
        // Search and filter event listeners
        const searchInput = document.getElementById("searchInput");
        const filterSelect = document.getElementById("filterSelect");
        const protocolSelect = document.getElementById("protocolSelect");
        
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                paginationUtils.currentPage = 1;
                updateUI();
            });
        }
        
        if (filterSelect) {
            filterSelect.addEventListener('change', () => {
                paginationUtils.currentPage = 1;
                updateUI();
            });
        }
        
        if (protocolSelect) {
            protocolSelect.addEventListener('change', () => {
                paginationUtils.currentPage = 1;
                updateUI();
            });
        }
        
        // Hamburger Menu
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const mobileMenu = document.getElementById('mobileMenu');
        const exportIPsMenu = document.getElementById('exportIPsMenu');
        const darkModeToggleMenu = document.getElementById('darkModeToggleMenu');
        const faqButton = document.getElementById('faqButton');
        const faqModal = document.getElementById('faqModal');
        const closeFaqModal = document.getElementById('closeFaqModal');

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

        const exportJSONMenu = document.getElementById('exportJSONMenu');
        if (exportJSONMenu) {
            exportJSONMenu.addEventListener('click', () => {
                menuUtils.closeMenu(mobileMenu);
                window.open('/api/export/json', '_blank');
            });
        }

        const exportCSVMenu = document.getElementById('exportCSVMenu');
        if (exportCSVMenu) {
            exportCSVMenu.addEventListener('click', () => {
                menuUtils.closeMenu(mobileMenu);
                window.open('/api/export/csv', '_blank');
            });
        }

        if (darkModeToggleMenu) {
            darkModeToggleMenu.addEventListener('click', () => {
                const isDark = document.documentElement.classList.toggle('dark');
                const lightIconMenu = document.getElementById('lightIconMenu');
                const darkIconMenu = document.getElementById('darkIconMenu');
                const themeText = document.getElementById('themeText');
                
                if (lightIconMenu && darkIconMenu) {
                    lightIconMenu.classList.toggle('hidden');
                    darkIconMenu.classList.toggle('hidden');
                }
                
                if (themeText) {
                    themeText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
                }
                
                localStorage.theme = isDark ? 'dark' : 'light';
                menuUtils.closeMenu(mobileMenu);
                setMapTheme(isDark);

                // Update chart colors
                const chartTextColor = isDark ? '#f3f4f6' : '#1f2937';
                const gridColor = isDark ? '#374151' : '#e5e7eb';
                
                if (typeof attemptsChart !== 'undefined') {
                    updateChartColors(attemptsChart, isDark, chartTextColor, gridColor);
                }
                if (typeof usernamesChart !== 'undefined') {
                    updateChartColors(usernamesChart, isDark, chartTextColor, gridColor);
                }
                if (typeof ipsChart !== 'undefined') {
                    updateChartColors(ipsChart, isDark, chartTextColor, gridColor);
                }
                if (typeof countriesChart !== 'undefined') {
                    updateChartColors(countriesChart, isDark, chartTextColor, gridColor);
                }
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
            }
        });
    }
    
    function setupTheme() {
        // Initialize theme based on user preference, system preference, or default to light mode
        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
            localStorage.theme = 'dark';
            const lightIconMenu = document.getElementById('lightIconMenu');
            const darkIconMenu = document.getElementById('darkIconMenu');
            const themeText = document.getElementById('themeText');
            if (lightIconMenu && darkIconMenu) {
                lightIconMenu.classList.remove('hidden');
                darkIconMenu.classList.add('hidden');
            }
            if (themeText) {
                themeText.textContent = 'Light Mode';
            }
        } else {
            // Default to light mode if no preference is set or system is light mode
            localStorage.theme = 'light';
            const themeText = document.getElementById('themeText');
            if (themeText) {
                themeText.textContent = 'Dark Mode';
            }
        }
    }
    
    function setupMap() {
        // Set the appropriate tile layer
        setMapTheme(document.documentElement.classList.contains('dark'));
    }
    
    function startApplication() {
        setupTheme();
        setupMap();
        setupEventListeners();
        
        // Show loading overlay
        toggleLoadingOverlay(true);
        
        // Connect to WebSocket
        connectWebSocket();
    }
    
    return {
        start: startApplication
    };
})();

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init.start);

// Clean up global event listeners that are now in the init module
// No need to repeat the event listener registrations here 