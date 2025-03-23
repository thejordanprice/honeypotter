// Helper function to format dates
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

// Initialize theme based on user preference or system settings
if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
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
    const themeText = document.getElementById('themeText');
    if (themeText) {
        themeText.textContent = 'Dark Mode';
    }
}

// Initialize map with light/dark theme support
const map = L.map('map').setView([20, 0], 2);
let currentTileLayer;

// Function to center map on most active region
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

// Initial theme setup
setMapTheme(document.documentElement.classList.contains('dark'));

// Store map markers to prevent duplicate markers at same location
const markers = new Map();

function updateMap(attempt) {
    if (attempt.latitude && attempt.longitude) {
        const key = `${attempt.latitude},${attempt.longitude}`;
        let marker = markers.get(key);
        
        if (!marker) {
            marker = {
                leaflet: L.marker([attempt.latitude, attempt.longitude]),
                attempts: new Set()
            };
            markers.set(key, marker);
            marker.leaflet.addTo(map);
        }

        const attemptKey = `${attempt.timestamp}_${attempt.client_ip}_${attempt.username}_${attempt.protocol}`;
        const previousSize = marker.attempts.size;
        marker.attempts.add(attemptKey);
        
        if (marker.attempts.size > previousSize) {
            console.log(`New unique attempt at ${key}: ${attemptKey}`);
            console.log(`Location now has ${marker.attempts.size} unique attempts`);
        }
        
        const location = [
            attempt.city,
            attempt.region,
            attempt.country
        ].filter(Boolean).join(', ');

        const passwordDisplay = attempt.protocol === 'rdp' ? '[Password Unavailable]' : attempt.password;

        const popupContent = `
            <div class="location-popup">
                <strong>${location}</strong><br>
                Total Attempts: ${marker.attempts.size}<br>
                Latest: ${attempt.username}@${attempt.client_ip}
            </div>
        `;
        
        marker.leaflet.bindPopup(popupContent);
    }
}

const attemptsDiv = document.getElementById("attempts");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const protocolSelect = document.getElementById("protocolSelect");
const connectionStatus = document.getElementById("connectionStatus");
let attempts = [];
let socket = null;

function updateConnectionStatus(status, isError = false) {
    const indicator = document.getElementById('connectionStatusIndicator');
    const svg = indicator.querySelector('svg');
    
    if (status.includes('Connected')) {
        indicator.className = 'connected';
        svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
        svg.classList.remove('animate-spin');
    } else if (status.includes('Connecting')) {
        indicator.className = 'reconnecting';
        svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>';
        svg.classList.add('animate-spin');
    } else {
        indicator.className = 'disconnected';
        svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
        svg.classList.remove('animate-spin');
    }
}

function toggleLoadingOverlay(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            overlay.style.visibility = 'visible';
        });
    } else {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
        document.body.style.overflow = '';
        
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 300);
    }
}

// Show loading overlay initially
toggleLoadingOverlay(true);

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    updateConnectionStatus('Connecting to WebSocket...');
    
    socket = new WebSocket(wsUrl);

    socket.onopen = function() {
        updateConnectionStatus('Connected to WebSocket');
        fetch('/api/attempts')
            .then(response => response.json())
            .then(data => {
                attempts = data;
                
                const currentFilters = {
                    search: searchInput.value.toLowerCase().trim(),
                    filter: filterSelect.value,
                    protocol: protocolSelect.value
                };
                
                const filteredAttempts = filterAttempts(attempts);
                
                updateUI();
                
                setTimeout(() => toggleLoadingOverlay(false), 500);
            })
            .catch(error => {
                console.error('Error fetching data:', error);
                toggleLoadingOverlay(false);
            });
    };

    socket.onmessage = function(event) {
        try {
            const newAttempt = JSON.parse(event.data);
            console.log('Received new attempt:', newAttempt);
            
            attempts.unshift(newAttempt);
            
            document.getElementById('totalAttempts').textContent = attempts.length;
            
            updateMap(newAttempt);
            
            currentPage = 1;
            updateUI();
            
            const indicator = document.getElementById('connectionStatusIndicator');
            indicator.style.transform = 'scale(1.2)';
            setTimeout(() => {
                indicator.style.transform = 'scale(1)';
            }, 200);
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    };

    socket.onerror = function(error) {
        updateConnectionStatus('WebSocket error: ' + error.message, true);
        console.error('WebSocket error:', error);
        toggleLoadingOverlay(false);
    };

    socket.onclose = function() {
        updateConnectionStatus('WebSocket connection closed. Reconnecting...', true);
        toggleLoadingOverlay(false);
        setTimeout(connectWebSocket, 5000);
    };
}

function createAttemptElement(attempt) {
    const location = [
        attempt.city,
        attempt.region,
        attempt.country
    ].filter(Boolean).join(', ');

    const passwordDisplay = attempt.protocol === 'rdp' ? '[Password Unavailable]' : attempt.password;

    return `
        <div class="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
            <div class="flex flex-col sm:flex-row justify-between gap-2">
                <span class="font-semibold break-all">
                    ${attempt.username}@${attempt.client_ip}
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

function filterAttempts(attempts) {
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

let currentPage = 1;
const itemsPerPage = 10;

function updateUI() {
    const filteredAttempts = filterAttempts(attempts);
    const totalItems = filteredAttempts.length;
    
    document.getElementById('totalAttempts').textContent = attempts.length;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    
    document.getElementById('startRange').textContent = totalItems ? startIndex + 1 : 0;
    document.getElementById('endRange').textContent = endIndex;
    document.getElementById('totalItems').textContent = totalItems;
    
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = endIndex >= totalItems;
    
    const paginatedAttempts = filteredAttempts.slice(startIndex, endIndex);
    attemptsDiv.innerHTML = paginatedAttempts
        .map(attempt => createAttemptElement(attempt))
        .join('');

    updateVisualizations(filteredAttempts);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
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
                const overlay = document.createElement('div');
                overlay.className = 'menu-overlay';
                document.body.appendChild(overlay);
                
                requestAnimationFrame(() => {
                    overlay.classList.add('active');
                });
            } else {
                const overlay = document.querySelector('.menu-overlay');
                if (overlay) {
                    overlay.classList.remove('active');
                    setTimeout(() => overlay.remove(), 300);
                }
            }
        });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (mobileMenu && !mobileMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
            mobileMenu.classList.add('hidden');
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
            }
        }
    });

    // Prevent menu from closing when clicking inside
    if (mobileMenu) {
        mobileMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Menu item click handlers
    if (exportIPsMenu) {
        exportIPsMenu.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
            }
            window.open('/api/export/plaintext', '_blank');
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
            mobileMenu.classList.add('hidden');
            
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
            }

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
            mobileMenu.classList.add('hidden');
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
            }
            faqModal.classList.remove('hidden');
        });
    }

    if (closeFaqModal && faqModal) {
        closeFaqModal.addEventListener('click', () => {
            faqModal.classList.add('hidden');
        });

        faqModal.addEventListener('click', (e) => {
            if (e.target === faqModal) {
                faqModal.classList.add('hidden');
            }
        });
    }

    // Close modals on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.add('hidden');
                const overlay = document.querySelector('.menu-overlay');
                if (overlay) {
                    overlay.classList.remove('active');
                    setTimeout(() => overlay.remove(), 300);
                }
            }
            
            if (faqModal && !faqModal.classList.contains('hidden')) {
                faqModal.classList.add('hidden');
            }
        }
    });

    // Initialize WebSocket connection
    connectWebSocket();
});

// Add pagination event listeners
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        updateUI();
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    const filteredAttempts = filterAttempts(attempts);
    const totalPages = Math.ceil(filteredAttempts.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        updateUI();
    }
});

// Search and filter event listeners
searchInput.addEventListener('input', () => {
    currentPage = 1;
    updateUI();
});

filterSelect.addEventListener('change', () => {
    currentPage = 1;
    updateUI();
});

protocolSelect.addEventListener('change', () => {
    currentPage = 1;
    updateUI();
}); 