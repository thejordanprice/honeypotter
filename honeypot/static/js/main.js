// Helper function to format dates
function formatDateToLocalTime(isoString) {
    return formatUtils.formatDateToLocalTime(isoString);
}

// Global variables
if (!window.attackAnimations) {
    window.attackAnimations = [];
}

// Initialize map with light/dark theme support
const map = L.map('map', {
    fullscreenControl: true,
    fullscreenControlOptions: {
        position: 'topleft'
    }
}).setView([20, 0], 2);
let currentTileLayer;
let heatLayer;
let heatmapEnabled = true; // Track if heatmap is enabled
let animationsEnabled = true; // Track if attack animations are enabled

// Make map variables accessible globally
window.map = map;
window.currentTileLayer = currentTileLayer;
window.heatLayer = heatLayer;
window.heatmapEnabled = heatmapEnabled;
window.animationsEnabled = animationsEnabled;
window.connectionFailed = false; // Add a flag to track connection failure state
window.lastActiveTimestamp = Date.now(); // Track when the page was last active
window.reconnectAttempts = 0; // Move reconnect attempts to global scope
window.reconnectTimeout = null; // Track reconnect timeout
window.pingTimeout = null; // Track ping timeout
window.reconnectDelay = 1000; // Start with 1s delay, will increase exponentially
window.batchTimeout = null; // Timeout for batch loading
window.pendingBatchRequest = false;
window.heartbeatInterval = null; // Interval for sending heartbeats
window.lastHeartbeatResponse = null; // Timestamp of last heartbeat response
window.heartbeatTimeout = null; // Timeout for detecting missed heartbeats
window.maxReconnectAttempts = 10; // Maximum number of reconnection attempts
window.isReconnecting = false; // Flag to prevent multiple simultaneous reconnections
window.serverCoordinates = null; // Server coordinates for attack animation

// Create custom heatmap toggle control
L.Control.HeatmapToggle = L.Control.extend({
    options: {
        position: 'topleft'
    },

    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-control-heatmap leaflet-bar leaflet-control');
        this._link = L.DomUtil.create('a', window.heatmapEnabled ? 'leaflet-control-heatmap-active' : '', container);
        this._link.href = '#';
        this._link.title = 'Toggle Heatmap';
        this._link.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M10.0284 1.11813C9.69728 1.2952 9.53443 1.61638 9.49957 1.97965C9.48456 2.15538 9.46201 2.32986 9.43136 2.50363C9.3663 2.87248 9.24303 3.3937 9.01205 3.98313C8.5513 5.15891 7.67023 6.58926 5.96985 7.65195C3.57358 9.14956 2.68473 12.5146 3.06456 15.527C3.45234 18.6026 5.20871 21.7903 8.68375 22.9486C9.03 23.0641 9.41163 22.9817 9.67942 22.7337C10.0071 22.4303 10.0238 22.0282 9.94052 21.6223C9.87941 21.3244 9.74999 20.5785 9.74999 19.6875C9.74999 19.3992 9.76332 19.1034 9.79413 18.8068C10.3282 20.031 11.0522 20.9238 11.7758 21.5623C12.8522 22.5121 13.8694 22.8574 14.1722 22.9466C14.402 23.0143 14.6462 23.0185 14.8712 22.9284C17.5283 21.8656 19.2011 20.4232 20.1356 18.7742C21.068 17.1288 21.1993 15.3939 20.9907 13.8648C20.7833 12.3436 20.2354 10.9849 19.7537 10.0215C19.3894 9.29292 19.0534 8.77091 18.8992 8.54242C18.7101 8.26241 18.4637 8.04626 18.1128 8.00636C17.8332 7.97456 17.5531 8.06207 17.3413 8.24739L15.7763 9.61686C15.9107 7.44482 15.1466 5.61996 14.1982 4.24472C13.5095 3.24609 12.7237 2.47913 12.1151 1.96354C11.8094 1.70448 11.5443 1.50549 11.3525 1.36923C11.2564 1.30103 11.1784 1.24831 11.1224 1.21142C10.7908 0.99291 10.3931 0.923125 10.0284 1.11813ZM7.76396 20.256C7.75511 20.0744 7.74999 19.8842 7.74999 19.6875C7.75 18.6347 7.89677 17.3059 8.47802 16.0708C8.67271 15.6572 8.91614 15.254 9.21914 14.8753C9.47408 14.5566 9.89709 14.4248 10.2879 14.5423C10.6787 14.6598 10.959 15.003 10.9959 15.4094C11.2221 17.8977 12.2225 19.2892 13.099 20.0626C13.5469 20.4579 13.979 20.7056 14.292 20.8525C15.5 20.9999 17.8849 18.6892 18.3955 17.7882C19.0569 16.6211 19.1756 15.356 19.0091 14.1351C18.8146 12.7092 18.2304 11.3897 17.7656 10.5337L14.6585 13.2525C14.3033 13.5634 13.779 13.5835 13.401 13.3008C13.023 13.018 12.8942 12.5095 13.092 12.0809C14.4081 9.22933 13.655 6.97987 12.5518 5.38019C12.1138 4.74521 11.6209 4.21649 11.18 3.80695C11.0999 4.088 10.9997 4.39262 10.8742 4.71284C10.696 5.16755 10.4662 5.65531 10.1704 6.15187C9.50801 7.26379 8.51483 8.41987 7.02982 9.34797C5.57752 10.2556 4.71646 12.6406 5.04885 15.2768C5.29944 17.2643 6.20241 19.1244 7.76396 20.256Z" fill="currentColor"/>
        </svg>`;

        // Add strike-through line initially if disabled
        if (!window.heatmapEnabled) {
            setTimeout(() => {
                const svg = this._link.querySelector('svg');
                if (svg && !svg.querySelector('.strike-through-line')) {
                    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    line.setAttribute("x1", "4");
                    line.setAttribute("y1", "4");
                    line.setAttribute("x2", "20");
                    line.setAttribute("y2", "20");
                    line.setAttribute("stroke", "#ff0000");
                    line.setAttribute("stroke-width", "2");
                    line.setAttribute("class", "strike-through-line");
                    
                    // Set initial state for animation
                    line.style.opacity = '0';
                    line.style.strokeDasharray = '24';
                    line.style.strokeDashoffset = '24';
                    line.style.transition = 'opacity 0.3s ease, stroke-dashoffset 0.3s ease';
                    
                    svg.appendChild(line);
                    
                    // Trigger animation
                    setTimeout(() => {
                        line.style.opacity = '1';
                        line.style.strokeDashoffset = '0';
                    }, 10);
                }
            }, 0);
        }

        L.DomEvent.on(this._link, 'click', this._click, this);
        L.DomEvent.disableClickPropagation(container);

        return container;
    },

    _click: function(e) {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        
        window.heatmapEnabled = !window.heatmapEnabled;
        this._updateHeatmapState();
    },
    
    _updateHeatmapState: function() {
        if (window.heatmapEnabled) {
            L.DomUtil.addClass(this._link, 'leaflet-control-heatmap-active');
            
            // Animate heatmap layer in if it exists
            if (window.heatLayer) {
                // Create a fade-in effect by manipulating the opacity
                // First check if _canvas exists (which is the correct property for leaflet.heat)
                if (window.heatLayer._canvas && window.heatLayer._canvas.style) {
                    // First add the layer with opacity 0
                    window.heatLayer._canvas.style.opacity = '0';
                    window.map.addLayer(window.heatLayer);
                    
                    // Then animate to full opacity
                    setTimeout(() => {
                        window.heatLayer._canvas.style.transition = 'opacity 0.4s ease-in';
                        window.heatLayer._canvas.style.opacity = '1';
                    }, 10);
                } 
                // Fallback to _heat property
                else if (window.heatLayer._heat && window.heatLayer._heat.style) {
                    // First add the layer with opacity 0
                    window.heatLayer._heat.style.opacity = '0';
                    window.map.addLayer(window.heatLayer);
                    
                    // Then animate to full opacity
                    setTimeout(() => {
                        window.heatLayer._heat.style.transition = 'opacity 0.4s ease-in';
                        window.heatLayer._heat.style.opacity = '1';
                    }, 10);
                } 
                // Fallback to general container
                else if (window.heatLayer._container && window.heatLayer._container.style) {
                    // First add the layer with opacity 0
                    window.heatLayer._container.style.opacity = '0';
                    window.map.addLayer(window.heatLayer);
                    
                    // Then animate to full opacity
                    setTimeout(() => {
                        window.heatLayer._container.style.transition = 'opacity 0.4s ease-in';
                        window.heatLayer._container.style.opacity = '1';
                    }, 10);
                } else {
                    // Fallback if we can't access the style directly
                    window.map.addLayer(window.heatLayer);
                }
            }
            
            // Animate strike-through line removal if it exists
            const svg = this._link.querySelector('svg');
            const strikeLine = svg.querySelector('.strike-through-line');
            if (strikeLine) {
                // Animate out
                strikeLine.style.transition = 'opacity 0.3s ease, stroke-dashoffset 0.3s ease';
                strikeLine.style.opacity = '0';
                strikeLine.style.strokeDasharray = '24';
                strikeLine.style.strokeDashoffset = '24';
                
                // Remove after animation completes
                setTimeout(() => {
                    if (strikeLine.parentNode) {
                        svg.removeChild(strikeLine);
                    }
                }, 300);
            }
        } else {
            L.DomUtil.removeClass(this._link, 'leaflet-control-heatmap-active');
            
            // Animate heatmap layer out if it exists
            if (window.heatLayer) {
                // First check if _canvas exists
                if (window.heatLayer._canvas && window.heatLayer._canvas.style) {
                    // Animate to zero opacity
                    window.heatLayer._canvas.style.transition = 'opacity 0.4s ease-out';
                    window.heatLayer._canvas.style.opacity = '0';
                    
                    // Remove the layer after animation completes
                    setTimeout(() => {
                        window.map.removeLayer(window.heatLayer);
                    }, 400);
                }
                // Fallback to _heat property
                else if (window.heatLayer._heat && window.heatLayer._heat.style) {
                    // Animate to zero opacity
                    window.heatLayer._heat.style.transition = 'opacity 0.4s ease-out';
                    window.heatLayer._heat.style.opacity = '0';
                    
                    // Remove the layer after animation completes
                    setTimeout(() => {
                        window.map.removeLayer(window.heatLayer);
                    }, 400);
                }
                // Fallback to general container
                else if (window.heatLayer._container && window.heatLayer._container.style) {
                    // Animate to zero opacity
                    window.heatLayer._container.style.transition = 'opacity 0.4s ease-out';
                    window.heatLayer._container.style.opacity = '0';
                    
                    // Remove the layer after animation completes
                    setTimeout(() => {
                        window.map.removeLayer(window.heatLayer);
                    }, 400);
                } else {
                    // Fallback if we can't access the style directly
                    window.map.removeLayer(window.heatLayer);
                }
            }
            
            // Add and animate strike-through line if it doesn't exist
            const svg = this._link.querySelector('svg');
            if (!svg.querySelector('.strike-through-line')) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", "4");
                line.setAttribute("y1", "4");
                line.setAttribute("x2", "20");
                line.setAttribute("y2", "20");
                line.setAttribute("stroke", "#ff0000");
                line.setAttribute("stroke-width", "2");
                line.setAttribute("class", "strike-through-line");
                
                // Set initial state for animation
                line.style.opacity = '0';
                line.style.strokeDasharray = '24';
                line.style.strokeDashoffset = '24';
                line.style.transition = 'opacity 0.3s ease, stroke-dashoffset 0.3s ease';
                
                svg.appendChild(line);
                
                // Trigger animation
                setTimeout(() => {
                    line.style.opacity = '1';
                    line.style.strokeDashoffset = '0';
                }, 10);
            }
        }
    }
});

L.control.heatmapToggle = function(options) {
    return new L.Control.HeatmapToggle(options);
};

// Add the heatmap toggle control to the map
window.heatmapToggleControl = L.control.heatmapToggle();
window.heatmapToggleControl.addTo(map);

// Add this to ensure map is ready before adding layers
window.map.whenReady(function() {
    console.log("Map is ready, ensuring proper initialization");
    setTimeout(function() {
        // Force map to refresh size
        window.map.invalidateSize();
        
        // Initialize empty heat layer if needed
        if (!window.heatLayer) {
            console.log("Creating initial empty heat layer");
            window.heatLayer = L.heatLayer([], {
                radius: 20,
                blur: 15,
                maxZoom: 10
            }).addTo(window.map);
        }
    }, 200);
});

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
const isDarkMode = themeManager.isDarkTheme();
currentTileLayer = isDarkMode ? darkTileLayer : lightTileLayer;
currentTileLayer.addTo(map);
window.currentTileLayer = currentTileLayer;

// Class for handling attack animations
const AttackAnimator = {
    // Create a curved line between attacker and server
    createAttackPath: function(attackerCoords, serverCoords) {
        // Don't create animation if animations are disabled
        if (!window.animationsEnabled) {
            console.log("Attack animations are disabled, skipping animation creation");
            return null;
        }
        
        if (!attackerCoords || !serverCoords) {
            console.error("Missing coordinates for attack animation", { attacker: attackerCoords, server: serverCoords });
            return null;
        }
        
        console.log("Creating attack path from", attackerCoords, "to", serverCoords);
        
        // Calculate distance for scaling the curve
        const distance = this.getDistance(attackerCoords, serverCoords);
        
        // Generate a smooth curve with multiple points
        const curvePoints = this.generateCurvePoints(attackerCoords, serverCoords, 15);
        
        // Determine if dark mode is active
        const isDarkMode = themeManager.isDarkTheme();
        
        // Choose color based on theme - keep line color the same
        const lineColor = isDarkMode ? '#ffffff' : '#3b82f6'; // White for dark mode, blue for light mode
        
        // Create a curved polyline with animation - start with opacity 0 for fade-in
        const path = L.polyline(curvePoints, {
            color: lineColor,
            weight: 2.5,
            opacity: 0, // Start with opacity 0, will be animated in
            smoothFactor: 1,
            className: 'attack-path'
        }).addTo(window.map);
        
        // Add CSS fade-in transition to the path element
        if (path) {
            const pathElement = path._path || 
                              (path._renderer && path._renderer._rootGroup) || 
                              path._container;
                              
            if (pathElement && pathElement.style) {
                pathElement.style.transition = 'opacity 0.4s ease-in';
                setTimeout(() => {
                    pathElement.style.opacity = '1';
                }, 10);
            }
        }
        
        // Add a pulsing marker at the attacker location - ALWAYS red regardless of theme
        const attackerMarker = L.circleMarker(attackerCoords, {
            radius: 3,
            color: '#ef4444', // Always red for attacker
            fillColor: '#ef4444',
            fillOpacity: 0, // Start with opacity 0, will be animated in
            weight: 1.5
        }).addTo(window.map);
        
        // Add fade-in transition to the attacker marker
        if (attackerMarker) {
            const attackerElement = attackerMarker._path || 
                                  (attackerMarker._renderer && attackerMarker._renderer._rootGroup) || 
                                  attackerMarker._container;
                                  
            if (attackerElement && attackerElement.style) {
                attackerElement.style.transition = 'opacity 0.4s ease-in';
                setTimeout(() => {
                    attackerElement.style.opacity = '1';
                }, 10);
            }
        }
        
        // Add a pulsing marker at the server location - ALWAYS blue regardless of theme
        const serverMarker = L.circleMarker(serverCoords, {
            radius: 3,
            color: '#3b82f6', // Always blue for server
            fillColor: '#3b82f6',
            fillOpacity: 0, // Start with opacity 0, will be animated in
            weight: 1.5
        }).addTo(window.map);
        
        // Add fade-in transition to the server marker
        if (serverMarker) {
            const serverElement = serverMarker._path || 
                                (serverMarker._renderer && serverMarker._renderer._rootGroup) || 
                                serverMarker._container;
                                
            if (serverElement && serverElement.style) {
                serverElement.style.transition = 'opacity 0.4s ease-in';
                setTimeout(() => {
                    serverElement.style.opacity = '1';
                }, 10);
            }
        }
        
        // Create an object to track this animation
        const animation = {
            path: path,
            attackerMarker: attackerMarker,
            serverMarker: serverMarker,
            progress: 0,
            finished: false,
            created: Date.now()
        };
        
        // Add to active animations array
        window.attackAnimations.push(animation);
        
        // Start the animation
        this.animateAttack(animation);
        
        return animation;
    },
    
    // Generate a smooth curve with many points
    generateCurvePoints: function(start, end, numPoints) {
        const points = [];
        
        // Calculate midpoint
        const midLat = (start[0] + end[0]) / 2;
        const midLng = (start[1] + end[1]) / 2;
        
        // Calculate the distance for scaling the curve height
        const distance = this.getDistance(start, end);
        
        // Increase the arc height based on distance (increased by ~50%)
        const arcHeight = Math.min(Math.max(distance / 60, 1.1), 4.5);
        
        // Control point for the quadratic Bézier curve (raised midpoint)
        const ctrlPoint = [midLat + arcHeight, midLng];
        
        // Generate points along a quadratic Bézier curve
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            
            // Quadratic Bézier curve formula: B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
            // where P₀ is start, P₁ is control point, P₂ is end
            const lat = Math.pow(1-t, 2) * start[0] + 
                       2 * (1-t) * t * ctrlPoint[0] + 
                       Math.pow(t, 2) * end[0];
            
            const lng = Math.pow(1-t, 2) * start[1] + 
                       2 * (1-t) * t * ctrlPoint[1] + 
                       Math.pow(t, 2) * end[1];
            
            points.push([lat, lng]);
        }
        
        return points;
    },
    
    // Animate the attack path
    animateAttack: function(animation) {
        // If already finished, don't continue
        if (animation.finished) return;
        
        // Update progress - even slower for longer animation duration
        animation.progress += 0.005;  // Reduced from 0.007 for longer animation
        
        // Calculate opacity based on progress
        let opacity;
        if (animation.progress < 0.2) {
            // Fade in
            opacity = animation.progress * 5;
        } else if (animation.progress > 0.8) {
            // Fade out 
            opacity = (1 - animation.progress) * 5;
        } else {
            // Full opacity during middle of animation
            opacity = 1;
        }
        
        // Apply opacity
        animation.path.setStyle({ opacity: opacity });
        
        // Pulse the attacker marker - smaller amplitude
        const markerRadius = 3 + (Math.sin(animation.progress * 10) + 1) * 2;  // Base 3, max +2
        animation.attackerMarker.setRadius(markerRadius);
        
        // Pulse the server marker (out of phase with attacker marker) - smaller amplitude
        const serverMarkerRadius = 3 + (Math.sin((animation.progress * 10) + Math.PI) + 1) * 2;  // Base 3, max +2
        animation.serverMarker.setRadius(serverMarkerRadius);
        
        // Continue animation until complete
        if (animation.progress < 1) {
            requestAnimationFrame(() => this.animateAttack(animation));
        } else {
            // Mark as finished and remove from map after a delay
            animation.finished = true;
            setTimeout(() => {
                window.map.removeLayer(animation.path);
                window.map.removeLayer(animation.attackerMarker);
                window.map.removeLayer(animation.serverMarker);
                // Remove from animations array
                const index = window.attackAnimations.indexOf(animation);
                if (index > -1) {
                    window.attackAnimations.splice(index, 1);
                }
            }, 100);
        }
    },
    
    // Get random color for attack path
    getRandomAttackColor: function() {
        // Brighter colors that will stand out better
        const colors = ['#ff0000', '#ff4500', '#ffa500', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'];
        return colors[Math.floor(Math.random() * colors.length)];
    },
    
    // Calculate distance between two coordinates
    getDistance: function(point1, point2) {
        const R = 6371; // Radius of the earth in km
        const dLat = this.deg2rad(point2[0] - point1[0]);
        const dLon = this.deg2rad(point2[1] - point1[1]);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(point1[0])) * Math.cos(this.deg2rad(point2[0])) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distance in km
    },
    
    // Convert degrees to radians
    deg2rad: function(deg) {
        return deg * (Math.PI/180);
    },
    
    // Get a midpoint for the curve, elevated based on distance
    getMidPoint: function(point1, point2, distance) {
        // Calculate midpoint
        const lat = (point1[0] + point2[0]) / 2;
        const lon = (point1[1] + point2[1]) / 2;
        
        // Create a proper parabola by calculating arc height 
        // based on the distance but using a more pronounced curve
        const arcHeight = Math.min(Math.max(distance / 30, 3), 15);
        
        // Move the midpoint to create a parabolic arc
        return [lat + arcHeight, lon];
    },
    
    // Function to fetch server coordinates using IP
    fetchServerCoordinates: function(serverIP) {
        if (!serverIP || serverIP === '-' || serverIP === 'Unknown' || serverIP === 'Error fetching IP') {
            // Use a default location if no IP available
            console.log('Using default server coordinates (San Francisco)');
            return Promise.resolve([37.7749, -122.4194]); // San Francisco
        }
        
        console.log(`Fetching coordinates for IP: ${serverIP}`);
        
        return fetch(`https://ipapi.co/${serverIP}/json/`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                if (data && data.latitude && data.longitude) {
                    console.log('Server coordinates resolved:', [data.latitude, data.longitude]);
                    return [data.latitude, data.longitude];
                } else {
                    console.warn('Invalid location data received:', data);
                    throw new Error('Invalid location data');
                }
            })
            .catch(error => {
                console.error('Error fetching server coordinates:', error);
                // Use a default location if there's an error
                return [37.7749, -122.4194]; // San Francisco
            });
    },
    
    // Check if server coordinates are ok for animation
    validateCoordinates: function(coords) {
        const valid = Array.isArray(coords) && 
               coords.length === 2 && 
               !isNaN(coords[0]) && 
               !isNaN(coords[1]);
               
        if (!valid) {
            console.warn("Invalid coordinates detected:", coords);
        }
        
        return valid;
    },
    
    // Create a test animation to verify functionality
    createTestAnimation: function() {
        if (!window.serverCoordinates) {
            window.serverCoordinates = [37.7749, -122.4194]; // San Francisco
        }
        
        // Create a random point somewhere in the world
        const randomLat = (Math.random() * 140) - 70; // -70 to 70
        const randomLng = (Math.random() * 360) - 180; // -180 to 180
        
        console.log("Creating test animation from", [randomLat, randomLng], "to", window.serverCoordinates);
        
        return this.createAttackPath([randomLat, randomLng], window.serverCoordinates);
    }
};

// Add this anywhere after the AttackAnimator is defined
// This global function allows triggering a test animation from the console
window.testAttackAnimation = function() {
    if (AttackAnimator && typeof AttackAnimator.createTestAnimation === 'function') {
        console.log("Triggering test attack animation via console command");
        return AttackAnimator.createTestAnimation();
    } else {
        console.error("AttackAnimator is not available");
        return null;
    }
};

// Modify updateMap function to add attack animations
function updateMap(attempt) {
    console.log("Updating heatmap...");
    
    // Make sure map is properly initialized
    dataModel.ensureMapInitialized();

    // If the heatLayer exists, update its data instead of removing and recreating it
    if (window.heatLayer) {
        // Only update the data without recreating the layer
        updateHeatmapData(attempt);
    } else {
        // Create new heat layer if it doesn't exist yet
        createNewHeatLayer(attempt);
    }
}

// New function to update heatmap data without recreating the layer
function updateHeatmapData(attempt) {
    // Get all attempts with valid coordinates
    const attempts = websocketManager.getAttempts();
    const filteredAttempts = dataModel.filterAttempts(attempts);
    const validAttempts = filteredAttempts.filter(a => a.latitude && a.longitude);
    
    if (validAttempts.length > 0) {
        // Create heatmap data points with intensity based on frequency
        const locationFrequency = {};
        validAttempts.forEach(a => {
            const key = `${a.latitude},${a.longitude}`;
            locationFrequency[key] = (locationFrequency[key] || 0) + 1;
        });

        // Find max frequency for better normalization
        const maxFrequency = Math.max(...Object.values(locationFrequency));
        
        const heatData = validAttempts.map(a => {
            const key = `${a.latitude},${a.longitude}`;
            // Scale intensity based on relative frequency, with minimum value of 0.3
            const intensity = Math.max(0.3, (locationFrequency[key] / (maxFrequency || 1)));
            return [a.latitude, a.longitude, intensity];
        });

        // Update the existing heat layer data
        if (window.heatLayer && typeof window.heatLayer.setLatLngs === 'function') {
            window.heatLayer.setLatLngs(heatData);
        }
        
        console.log("Heatmap data updated successfully");
    }
    
    // Process new attack animation if needed
    processNewAttackAnimation(attempt);
}

// Helper function to process new attack animation
function processNewAttackAnimation(attempt) {
    // If this is a new attempt with valid coordinates, animate it
    if (attempt && attempt.latitude && attempt.longitude && window.animationsEnabled) {
        console.log("Processing new attack for animation:", attempt);
        
        // Ensure the coordinate values are properly parsed as numbers
        let attackerLat = parseFloat(attempt.latitude);
        let attackerLng = parseFloat(attempt.longitude);
        
        console.log("Parsed coordinates:", attackerLat, attackerLng);
        
        if (isNaN(attackerLat) || isNaN(attackerLng)) {
            console.warn("Invalid coordinates in attack data:", attempt);
            return;
        }
        
        const attackerCoords = [attackerLat, attackerLng];
        
        // Ensure we have server coordinates
        if (!window.serverCoordinates || !AttackAnimator.validateCoordinates(window.serverCoordinates)) {
            console.log("No server coordinates available for animation, fetching now");
            
            // Get the external IP element
            const ipElement = document.getElementById('externalIP');
            const serverIP = ipElement ? ipElement.textContent : null;
            
            // Use default coordinates if no IP available
            if (!serverIP || serverIP === '-' || serverIP === 'Unknown') {
                window.serverCoordinates = [37.7749, -122.4194]; // San Francisco default
                console.log("Using default server coordinates for animation");
                AttackAnimator.createAttackPath(attackerCoords, window.serverCoordinates);
                return;
            }
            
            // Fetch server coordinates if we have a valid IP
            console.log(`Fetching server coordinates for attack animation. Current IP: ${serverIP}`);
            AttackAnimator.fetchServerCoordinates(serverIP)
                .then(coords => {
                    if (AttackAnimator.validateCoordinates(coords)) {
                        window.serverCoordinates = coords;
                        // Now create the attack animation
                        console.log("Creating attack animation with newly fetched server coordinates");
                        AttackAnimator.createAttackPath(attackerCoords, window.serverCoordinates);
                    } else {
                        console.warn("Invalid server coordinates returned:", coords);
                        // Use default coordinates as fallback
                        window.serverCoordinates = [37.7749, -122.4194];
                        AttackAnimator.createAttackPath(attackerCoords, window.serverCoordinates);
                    }
                })
                .catch(err => {
                    console.error("Error fetching server coordinates:", err);
                    // Use default coordinates on error
                    window.serverCoordinates = [37.7749, -122.4194];
                    AttackAnimator.createAttackPath(attackerCoords, window.serverCoordinates);
                });
        } else {
            // Create attack animation directly if we already have server coordinates
            console.log(`Creating attack path from ${attackerCoords} to ${window.serverCoordinates}`);
            AttackAnimator.createAttackPath(attackerCoords, window.serverCoordinates);
        }
    }
}

// Helper function to create a new heat layer with fade-in effect
function createNewHeatLayer(attempt) {
    // Get all attempts with valid coordinates
    const attempts = websocketManager.getAttempts();
    const filteredAttempts = dataModel.filterAttempts(attempts);
    const validAttempts = filteredAttempts.filter(a => a.latitude && a.longitude);
    
    console.log(`Found ${validAttempts.length} valid attempts with coordinates for heatmap`);
    
    // Only proceed if we have valid attempts with coordinates
    if (validAttempts.length > 0) {
        // Create heatmap data points with intensity based on frequency
        const locationFrequency = {};
        validAttempts.forEach(a => {
            const key = `${a.latitude},${a.longitude}`;
            locationFrequency[key] = (locationFrequency[key] || 0) + 1;
        });

        // Find max frequency for better normalization
        const maxFrequency = Math.max(...Object.values(locationFrequency));
        console.log(`Max attack frequency: ${maxFrequency}`);

        const heatData = validAttempts.map(a => {
            const key = `${a.latitude},${a.longitude}`;
            // Scale intensity based on relative frequency, with minimum value of 0.3
            const intensity = Math.max(0.3, (locationFrequency[key] / (maxFrequency || 1)));
            return [a.latitude, a.longitude, intensity];
        });

        // Create the heat layer with adjusted settings
        window.heatLayer = L.heatLayer(heatData, {
            radius: 20,           // Increased radius for better visibility
            blur: 15,             // Increased blur for smoother appearance
            maxZoom: 10,          
            max: 1.0,
            gradient: {
                0.2: 'blue',      // Start color at lower intensity
                0.4: 'cyan',      // Add cyan for better color transition
                0.6: 'lime',
                0.8: 'yellow',
                1.0: 'red'
            }
        });
        
        // Only add the heat layer to the map if heatmap is enabled
        if (window.heatmapEnabled) {
            window.map.addLayer(window.heatLayer);
            
            // Add fade-in effect
            if (window.heatLayer._canvas && window.heatLayer._canvas.style) {
                // Start with opacity 0
                window.heatLayer._canvas.style.opacity = '0';
                
                // Fade in
                setTimeout(() => {
                    window.heatLayer._canvas.style.transition = 'opacity 0.4s ease-in';
                    window.heatLayer._canvas.style.opacity = '1';
                }, 10);
            }
            else if (window.heatLayer._heat && window.heatLayer._heat.style) {
                // Start with opacity 0
                window.heatLayer._heat.style.opacity = '0';
                
                // Fade in
                setTimeout(() => {
                    window.heatLayer._heat.style.transition = 'opacity 0.4s ease-in';
                    window.heatLayer._heat.style.opacity = '1';
                }, 10);
            }
            else if (window.heatLayer._container && window.heatLayer._container.style) {
                // Start with opacity 0
                window.heatLayer._container.style.opacity = '0';
                
                // Fade in
                setTimeout(() => {
                    window.heatLayer._container.style.transition = 'opacity 0.4s ease-in';
                    window.heatLayer._container.style.opacity = '1';
                }, 10);
            }
            
            console.log("Heatmap added to map with fade-in effect");
        } else {
            console.log("Heatmap updated but not displayed (disabled by user)");
        }
        
        console.log("Heatmap created successfully");
    } else {
        console.log("No valid coordinates found for heatmap");
        
        // Create an empty heat layer
        window.heatLayer = L.heatLayer([], {
            radius: 20,
            blur: 15,
            maxZoom: 10
        });
        
        // Only add to map if enabled
        if (window.heatmapEnabled) {
            window.map.addLayer(window.heatLayer);
        }
    }
    
    // Process new attack animation if needed
    processNewAttackAnimation(attempt);
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
        
        // Skip automatic status updates if connection has failed
        if (window.connectionFailed && !statusText.includes('Connection Failed')) {
            console.log(`Skipping automatic status update during connection failure: ${statusText} - ${detailText}`);
            return;
        }
        
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
                    // Don't change messages during batch loading or connection failure
                    if (loadingDetail && loadingText && !window.isReceivingBatches && !window.connectionFailed) {
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
            // Show the loading overlay
            overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            
            // If percentage is provided, update the loading percentage
            if (percentage !== null) {
                updateLoadingPercentage(percentage);
                
                // If percentage is less than 100, make sure we don't add refresh button yet
                if (percentage < 100) {
                    const loadingActions = domUtils.getElement('loadingActions');
                    if (loadingActions) {
                        loadingActions.innerHTML = '';
                    }
                }
            }
            
            // Animate appearance
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                overlay.style.visibility = 'visible';
            });
            
            // Add reconnecting class if we're in reconnection mode (only after the first connection attempt)
            // Check if this is a genuine reconnection (not an initial page load)
            if (window.reconnectAttempts > 0 && window.isReconnecting) {
                overlay.classList.add('reconnecting');
                
                // Add buttons only if we've reached the maximum number of reconnection attempts
                const loadingActions = domUtils.getElement('loadingActions');
                if (loadingActions) {
                    if (window.reconnectAttempts >= window.maxReconnectAttempts) {
                        // Show both buttons when max attempts reached
                        loadingActions.innerHTML = '<button id="reconnectNowButton" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded shadow hover:shadow-md transition-all mr-2">Reconnect Now</button>' +
                                                  '<button id="refreshPageButton" class="px-4 py-2 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white rounded shadow hover:shadow-md transition-all">Refresh Page</button>';
                        
                        // Add event listeners to the buttons
                        const reconnectButton = document.getElementById('reconnectNowButton');
                        const refreshButton = document.getElementById('refreshPageButton');
                        
                        if (reconnectButton) {
                            reconnectButton.addEventListener('click', () => {
                                // Clear any pending reconnect timers
                                if (window.reconnectTimeout) {
                                    clearTimeout(window.reconnectTimeout);
                                    window.reconnectTimeout = null;
                                }
                                
                                // Set reconnection attempts to 0 to avoid exponential backoff
                                window.reconnectAttempts = 0;
                                
                                // Try to reconnect immediately
                                websocketManager.reconnect();
                                
                                // Update the loading status
                                updateLoadingStatus('Reconnecting...', 'Attempting to reconnect now');
                            });
                        }
                        
                        if (refreshButton) {
                            refreshButton.addEventListener('click', () => {
                                // Reset the connection failed flag when refreshing
                                window.connectionFailed = false;
                                window.location.reload();
                            });
                        }
                    } else {
                        // When still trying automatic reconnections, show a message instead of buttons
                        const attemptInfo = `Reconnection Attempt ${window.reconnectAttempts} of ${window.maxReconnectAttempts}`;
                        loadingActions.innerHTML = `<div class="py-2 px-4 bg-blue-100 dark:bg-gray-800 text-blue-800 dark:text-gray-200 rounded text-center font-medium">${attemptInfo}</div>`;
                    }
                }
            } else {
                overlay.classList.remove('reconnecting');
                
                // Clear any reconnection messages during initial connection
                const loadingActions = domUtils.getElement('loadingActions');
                if (loadingActions) {
                    loadingActions.innerHTML = '';
                }
            }
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
            
            // Animate disappearance
            overlay.style.opacity = '0';
            overlay.style.visibility = 'hidden';
            document.body.style.overflow = '';
            
            // Hide after animation completes
            setTimeout(() => {
                overlay.classList.add('hidden');
                
                // Reset classes
                overlay.classList.remove('reconnecting');
                overlay.classList.remove('connection-failed');
                
                // Reset loading bar
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
    // Store active connection and data
    let socket = null;
    let attempts = [];
    let isReceivingBatches = false; // Flag to track when we're receiving batch data
    let totalBatches = 0; // Track total number of batches expected
    let batchesReceived = 0; // Track number of batches received
    let batchesPending = 0; // Track number of batches still pending
    
    // Expose isReceivingBatches to the window to prevent automatic status updates during batch loading
    window.isReceivingBatches = false;
    
    // Add the message handlers  
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
            clearTimeout(window.batchTimeout);
            window.batchTimeout = setTimeout(() => {
                if (isReceivingBatches && batchesPending > 0) {
                    console.warn(`Batch transfer stalled at ${batchesReceived}/${totalBatches} batches`);
                    uiManager.updateLoadingStatus('Transfer Stalled', 
                        `Data transfer stalled at ${batchesReceived}/${totalBatches} batches`);
                    requestMissingBatches();
                }
            }, 10000); // 10 second timeout
        },
        
        // New message handlers for heartbeat mechanism
        heartbeat_response: function(data) {
            // Server responded to our heartbeat
            window.lastHeartbeatResponse = new Date();
            console.debug('Received heartbeat response:', data);
            
            // Clear any pending heartbeat timeout
            if (window.heartbeatTimeout) {
                clearTimeout(window.heartbeatTimeout);
                window.heartbeatTimeout = null;
            }
            
            // Update connection indicator to show healthy connection
            const indicator = domUtils.getElement('connectionStatusIndicator');
            if (indicator) {
                indicator.classList.remove('error');
                indicator.classList.add('connected');
            }
        },
        
        server_heartbeat: function(data) {
            // Server sent us a heartbeat
            console.debug('Received server heartbeat:', data);
            
            // Update connection status
            const uptime = data.uptime ? Math.round(data.uptime / 60) : '?';
            uiManager.updateConnectionStatus(`Connected (${uptime} min uptime)`);
            
            // Send a response heartbeat
            sendMessage('heartbeat', { timestamp: new Date().toISOString() });
            
            // Update connection indicator
            const indicator = domUtils.getElement('connectionStatusIndicator');
            if (indicator) {
                indicator.classList.remove('error');
                indicator.classList.add('connected');
                
                // Pulse effect on indicator
                indicator.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    indicator.style.transform = 'scale(1)';
                }, 150);
            }
        },
        
        // Add new ping/pong handler
        pong: function(data) {
            console.log('Received pong response from server');
            // If there's a ping timeout, clear it
            if (window.pingTimeout) {
                clearTimeout(window.pingTimeout);
                window.pingTimeout = null;
            }
            
            // Reset the active timestamp
            window.lastActiveTimestamp = Date.now();
            
            // Update connection indicator to show healthy connection
            const indicator = domUtils.getElement('connectionStatusIndicator');
            if (indicator) {
                indicator.classList.remove('error');
                indicator.classList.add('connected');
            }
        },
        
        batch_data: function(data) {
            console.log(`Received batch ${data.batch_number}/${totalBatches}`);
            
            // Reset timeout on receiving batch data
            clearTimeout(window.batchTimeout);
            window.batchTimeout = setTimeout(() => {
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
            clearTimeout(window.batchTimeout);
            
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
            clearTimeout(window.batchTimeout);
            isReceivingBatches = false;
            window.isReceivingBatches = false; // Update window variable
            
            // Force reconnection after a brief delay
            setTimeout(() => {
                if (!window.isReconnecting) {
                    if (socket) {
                        socket.close();
                    } else {
                        reconnect();
                    }
                } else {
                    console.log('Batch error reconnection skipped - reconnection already in progress');
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
        
        // Make sure we're not in reconnecting mode for the initial connection
        window.isReconnecting = false;
        
        // Initial page load should not count as a reconnection attempt
        if (document.readyState !== 'complete') {
            window.reconnectAttempts = 0;
        }
        
        uiManager.updateConnectionStatus('Connecting to WebSocket...');
        uiManager.updateLoadingPercentageWithDelay(10).then(() => {
            uiManager.updateLoadingStatus('Initializing...', 'Preparing connection parameters');
        });
        
        socket = new WebSocket(wsUrl);
        // Explicitly set socket on window object to make it accessible from other scripts
        window.socket = socket;
        window.lastActiveTimestamp = Date.now(); // Reset active timestamp on new connection

        socket.onopen = async function() {
            // Reset reconnect attempts on successful connection
            window.reconnectAttempts = 0;
            window.reconnectDelay = 1000;
            window.isReconnecting = false; // Reset the reconnecting flag
            
            // Reset connection failed flag on successful connection
            window.connectionFailed = false;
            
            uiManager.updateConnectionStatus('Connected to WebSocket');
            await uiManager.updateLoadingPercentageWithDelay(25); // WebSocket connected - update to 25%
            
            // Update loading detail to show we're waiting for data
            uiManager.updateLoadingStatus('Connected', 'WebSocket connected, requesting data');
            
            // Start heartbeat mechanism for connection health monitoring
            startHeartbeat();
            
            // Request data in batches
            sendMessage('request_data_batches');
            window.pendingBatchRequest = true;
            
            // Set a timeout for the initial batch start response
            clearTimeout(window.batchTimeout);
            window.batchTimeout = setTimeout(() => {
                if (window.pendingBatchRequest) {
                    console.warn('No batch_start response received, retrying request');
                    uiManager.updateLoadingStatus('Waiting...', 'Server delayed, retrying data request');
                    sendMessage('request_data_batches');
                    
                    // Set another timeout for another retry
                    window.batchTimeout = setTimeout(() => {
                        if (window.pendingBatchRequest) {
                            console.warn('Still no batch response, forcing reconnection');
                            window.pendingBatchRequest = false;
                            
                            uiManager.updateLoadingStatus('Reconnecting...', 
                                `Connection lost. Reconnecting soon...`);
                            
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
                
                // Update active timestamp on any message received
                window.lastActiveTimestamp = Date.now();
                
                // If we received a pong response, clear the ping timeout
                if (message.type === 'pong' && window.pingTimeout) {
                    console.log('Received pong response, connection is healthy');
                    clearTimeout(window.pingTimeout);
                    window.pingTimeout = null;
                }
                
                // If receiving batch_start, clear pending batch request flag
                if (message.type === 'batch_start') {
                    window.pendingBatchRequest = false;
                    clearTimeout(window.batchTimeout);
                }
                
                // Use the appropriate handler based on message type
                if (message.type && messageHandlers[message.type]) {
                    messageHandlers[message.type](message.data);
                    
                    // Update isReceivingBatches state for batch operations
                    if (message.type === 'batch_start') {
                        isReceivingBatches = true;
                        window.isReceivingBatches = true;
                    } else if (message.type === 'batch_complete') {
                        isReceivingBatches = false;
                        window.isReceivingBatches = false;
                    }
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
            console.log(`Socket error event fired. Current reconnect status: attempts=${window.reconnectAttempts}, isReconnecting=${window.isReconnecting}`);
            
            // Clear pending batch request timeout
            clearTimeout(window.batchTimeout);
            window.pendingBatchRequest = false;
            
            // Clear any loading animation in progress
            if (window.loadingAnimationId) {
                clearTimeout(window.loadingAnimationId);
                window.loadingAnimationId = null;
            }
            
            // Stop heartbeat
            stopHeartbeat();
            
            // Show the loading overlay if it's not already visible
            const loadingOverlay = domUtils.getElement('loadingOverlay');
            if (loadingOverlay && loadingOverlay.classList.contains('hidden')) {
                uiManager.toggleLoadingOverlay(true, 15);
            }
            
            // Always try to reconnect when there's an error
            reconnect();
        };

        socket.onclose = function() {
            uiManager.updateConnectionStatus('WebSocket connection closed. Reconnecting...', true);
            console.log(`Socket close event fired. Current reconnect status: attempts=${window.reconnectAttempts}, isReconnecting=${window.isReconnecting}`);
            
            // Clear the window.socket reference since it's no longer valid
            window.socket = null;
            
            // Clear pending batch request timeout
            clearTimeout(window.batchTimeout);
            window.pendingBatchRequest = false;
            
            // Clear any loading animation in progress
            if (window.loadingAnimationId) {
                clearTimeout(window.loadingAnimationId);
                window.loadingAnimationId = null;
            }
            
            // If we've already reached max reconnects, don't try again
            if (window.reconnectAttempts >= window.maxReconnectAttempts) {
                console.warn("Already reached maximum reconnection attempts, not attempting again");
                return;
            }
            
            // Stop heartbeat
            stopHeartbeat();
            
            // Show the loading overlay if it's not already visible
            const loadingOverlay = domUtils.getElement('loadingOverlay');
            if (loadingOverlay && loadingOverlay.classList.contains('hidden')) {
                uiManager.toggleLoadingOverlay(true, 15);
            }
            
            // Always try to reconnect on close
            reconnect();
        };
    }

    function startHeartbeat() {
        // Clear any existing heartbeat interval
        stopHeartbeat();
        
        // Initialize lastHeartbeatResponse with current time
        window.lastHeartbeatResponse = new Date();
        
        // Start sending heartbeats every 30 seconds
        window.heartbeatInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                console.debug('Sending client heartbeat');
                sendMessage('heartbeat', { timestamp: new Date().toISOString() });
                
                // Set timeout to detect missed responses (wait 10 seconds for response)
                window.heartbeatTimeout = setTimeout(() => {
                    const now = new Date();
                    const lastResponseAge = Math.round((now - window.lastHeartbeatResponse) / 1000);
                    
                    if (lastResponseAge > 40) { // Allow for some network delay
                        console.warn(`No heartbeat response for ${lastResponseAge} seconds, connection may be stale`);
                        
                        // Update connection indicator
                        const indicator = domUtils.getElement('connectionStatusIndicator');
                        if (indicator) {
                            indicator.classList.remove('connected');
                            indicator.classList.add('error');
                        }
                        
                        // Update connection status in UI
                        uiManager.updateConnectionStatus('Connection unstable - awaiting server response', true);
                        
                        // If we miss multiple heartbeats, force reconnection
                        if (lastResponseAge > 120) { // 2 minutes without response
                            console.error('Connection unresponsive, forcing reconnection');
                            
                            // Only reconnect if not already reconnecting
                            if (!window.isReconnecting) {
                                if (socket) {
                                    socket.close();
                                } else {
                                    reconnect();
                                }
                            } else {
                                console.log('Heartbeat reconnection skipped - reconnection already in progress');
                            }
                        }
                    }
                }, 10000);
            }
        }, 30000);
        
        console.log('Started WebSocket heartbeat monitoring');
    }
    
    function stopHeartbeat() {
        if (window.heartbeatInterval) {
            clearInterval(window.heartbeatInterval);
            window.heartbeatInterval = null;
        }
        
        if (window.heartbeatTimeout) {
            clearTimeout(window.heartbeatTimeout);
            window.heartbeatTimeout = null;
        }
    }

    function reconnect() {
        // If already reconnecting, don't start another reconnection process
        if (window.isReconnecting) {
            console.log('Reconnection already in progress, ignoring duplicate request');
            return;
        }
        
        // Calculate the call stack trace to identify what triggered the reconnection
        let callStack;
        try {
            throw new Error("Reconnection trace");
        } catch (e) {
            callStack = e.stack.split('\n').slice(1, 3).join('\n');
        }
        
        // Check if this is an initial page load or a genuine reconnection attempt
        const isInitialPageLoad = window.reconnectAttempts === 0 && document.readyState !== 'complete';
        
        // Only increment reconnectAttempts for genuine reconnection attempts, not initial page load
        if (!isInitialPageLoad) {
            window.reconnectAttempts++;
        }
        
        console.log(`Starting reconnection attempt ${window.reconnectAttempts} of ${window.maxReconnectAttempts}`);
        console.log(`Triggered by: ${callStack}`);
        
        // Special handling for the first reconnection attempt
        // If this is the first reconnection attempt during initial page load, treat it differently
        const isFirstStartupReconnect = window.reconnectAttempts === 1 && 
                                      document.readyState !== 'complete';
        
        // Set isReconnecting based on whether this is a first startup attempt or not
        // Don't set isReconnecting to true for initial page load
        window.isReconnecting = !isFirstStartupReconnect && !isInitialPageLoad;
        
        // Make sure we reset the receiving batches state
        isReceivingBatches = false;
        window.isReceivingBatches = false;
        
        if (window.reconnectAttempts <= window.maxReconnectAttempts) {
            // Exponential backoff for reconnect attempts
            const delay = Math.min(30000, window.reconnectDelay * Math.pow(1.5, window.reconnectAttempts - 1));
            console.log(`Attempting to reconnect (${window.reconnectAttempts}/${window.maxReconnectAttempts}) in ${delay/1000} seconds...`);
            
            // Show loading overlay if it's not already visible
            const loadingOverlay = domUtils.getElement('loadingOverlay');
            if (loadingOverlay && loadingOverlay.classList.contains('hidden')) {
                uiManager.toggleLoadingOverlay(true, 15);
            } else {
                // Update UI to show reconnection attempt before starting the timer
                uiManager.updateLoadingStatus('Reconnecting...', 
                    `Connection lost. Reconnecting in ${Math.round(delay/1000)}s (${window.reconnectAttempts}/${window.maxReconnectAttempts})`);
                
                // Update the loading actions with attempt info
                const loadingActions = domUtils.getElement('loadingActions');
                if (loadingActions) {
                    const attemptInfo = `Reconnection Attempt ${window.reconnectAttempts} of ${window.maxReconnectAttempts}`;
                    loadingActions.innerHTML = `<div class="py-2 px-4 bg-blue-100 dark:bg-gray-800 text-blue-800 dark:text-gray-200 rounded text-center font-medium">${attemptInfo}</div>`;
                }
                
                // Add reconnecting class to overlay if not already present
                if (!loadingOverlay.classList.contains('reconnecting')) {
                    loadingOverlay.classList.add('reconnecting');
                }
            }
            
            // Clear any existing reconnect timeout
            if (window.reconnectTimeout) {
                clearTimeout(window.reconnectTimeout);
            }
            
            // Set a new reconnect timeout
            window.reconnectTimeout = setTimeout(() => {
                window.reconnectTimeout = null; // Clear the reference once it's executed
                window.isReconnecting = false; // Reset the reconnecting flag before connecting
                connect();
            }, delay);
        } else {
            console.error('Maximum reconnection attempts reached');
            // Set the connection failed flag to prevent automatic status updates
            window.connectionFailed = true;
            window.isReconnecting = false; // Reset the reconnecting flag
            
            uiManager.updateConnectionStatus('Connection failed after multiple attempts. Please refresh the page.', true);
            
            // Get the loading overlay and add a connection-failed class for styling
            const loadingOverlay = domUtils.getElement('loadingOverlay');
            if (loadingOverlay) {
                domUtils.addClass(loadingOverlay, 'connection-failed');
            }
            
            // Update UI to show failure with a more descriptive message
            uiManager.updateLoadingStatus('Connection Failed', 
                'Unable to connect to server after multiple attempts. The server may be down for maintenance. Please try again later.');
            
            // Update loading percentage to 100% to allow user to dismiss the overlay
            uiManager.updateLoadingPercentage(100);
            
            // Add a refresh button to the loading overlay
            const loadingActions = domUtils.getElement('loadingActions');
            if (loadingActions) {
                loadingActions.innerHTML = '<button id="reconnectNowButton" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded shadow hover:shadow-md transition-all mr-2">Reconnect Now</button>' +
                                           '<button id="refreshPageButton" class="px-4 py-2 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white rounded shadow hover:shadow-md transition-all">Refresh Page</button>';
                
                // Add event listeners to the buttons
                const reconnectButton = document.getElementById('reconnectNowButton');
                const refreshButton = document.getElementById('refreshPageButton');
                
                if (reconnectButton) {
                    reconnectButton.addEventListener('click', () => {
                        // Reset the connection failed flag
                        window.connectionFailed = false;
                        
                        // Reset reconnection attempts to 0
                        window.reconnectAttempts = 0;
                        
                        // Try to reconnect immediately
                        connect();
                        
                        // Update the loading status
                        uiManager.updateLoadingStatus('Reconnecting...', 'Attempting to reconnect now');
                    });
                }
                
                if (refreshButton) {
                    refreshButton.addEventListener('click', () => {
                        // Reset the connection failed flag when refreshing
                        window.connectionFailed = false;
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
            clearTimeout(window.batchTimeout);
            window.batchTimeout = setTimeout(() => {
                if (isReceivingBatches && batchesPending > 0) {
                    console.warn('Did not receive missing batches in time, forcing reconnection');
                    
                    uiManager.updateLoadingStatus('Recovery Failed', 
                        'Missing batches timeout, reconnecting');
                    
                    // Reset the receiving batches state
                    isReceivingBatches = false;
                    window.isReceivingBatches = false;
                    
                    // Force a reconnection instead of falling back to HTTP
                    if (!window.isReconnecting) {
                        if (socket) {
                            socket.close();
                        } else {
                            reconnect();
                        }
                    } else {
                        console.log('Batch recovery reconnection skipped - reconnection already in progress');
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
            
            // Force a reconnection instead of falling back to HTTP
            if (!window.isReconnecting) {
                if (socket) {
                    socket.close();
                } else {
                    reconnect();
                }
            } else {
                console.log('Batch failure reconnection skipped - reconnection already in progress');
            }
        }
    }
    
    function finalizeBatchLoading() {
        clearTimeout(window.batchTimeout);
        
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
        // Initialize the element cache is now called in startApplication
        
        // Reset connection failed state on page load
        window.connectionFailed = false;
        
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
        const darkModeToggleMenu = domUtils.getElement('darkModeToggleMenu');
        const faqButton = domUtils.getElement('faqButton');
        const faqModal = domUtils.getElement('faqModal');
        const closeFaqModal = domUtils.getElement('closeFaqModal');
        const exportDataButton = domUtils.getElement('exportDataButton');
        const exportDataModal = domUtils.getElement('exportDataModal');
        const closeExportDataModal = domUtils.getElement('closeExportDataModal');

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

        // Export Data Modal handlers
        if (exportDataButton && exportDataModal) {
            exportDataButton.addEventListener('click', () => {
                menuUtils.closeMenu(mobileMenu);
                menuUtils.showMenu(exportDataModal);
                // Force a reflow before any animations
                exportDataModal.offsetHeight;
            });
        }

        if (closeExportDataModal && exportDataModal) {
            closeExportDataModal.addEventListener('click', () => {
                menuUtils.hideMenu(exportDataModal);
            });

            exportDataModal.addEventListener('click', (e) => {
                if (e.target === exportDataModal) {
                    menuUtils.hideMenu(exportDataModal);
                }
            });
        }

        // Export buttons inside modal
        const exportIPsButton = domUtils.getElement('exportIPs');
        if (exportIPsButton) {
            exportIPsButton.addEventListener('click', () => {
                menuUtils.hideMenu(exportDataModal);
                window.open('/api/export/plaintext', '_blank');
            });
        }

        const exportJSONButton = domUtils.getElement('exportJSON');
        if (exportJSONButton) {
            exportJSONButton.addEventListener('click', () => {
                menuUtils.hideMenu(exportDataModal);
                window.open('/api/export/json', '_blank');
            });
        }

        const exportCSVButton = domUtils.getElement('exportCSV');
        if (exportCSVButton) {
            exportCSVButton.addEventListener('click', () => {
                menuUtils.hideMenu(exportDataModal);
                window.open('/api/export/csv', '_blank');
            });
        }

        const exportMikrotikButton = domUtils.getElement('exportMikrotik');
        if (exportMikrotikButton) {
            exportMikrotikButton.addEventListener('click', () => {
                menuUtils.hideMenu(exportDataModal);
                window.open('/api/export/mikrotik', '_blank');
            });
        }

        const exportIPTablesButton = domUtils.getElement('exportIPTables');
        if (exportIPTablesButton) {
            exportIPTablesButton.addEventListener('click', () => {
                menuUtils.hideMenu(exportDataModal);
                window.open('/api/export/iptables', '_blank');
            });
        }

        const exportCiscoButton = domUtils.getElement('exportCisco');
        if (exportCiscoButton) {
            exportCiscoButton.addEventListener('click', () => {
                menuUtils.hideMenu(exportDataModal);
                window.open('/api/export/cisco', '_blank');
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
                
                if (exportDataModal && !exportDataModal.classList.contains('hidden')) {
                    menuUtils.hideMenu(exportDataModal);
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
        
        // Add event listener for map invalidation on container resize
        window.addEventListener('resize', function() {
            if (window.map) {
                setTimeout(function() {
                    console.log("Invalidating map size after resize");
                    window.map.invalidateSize();
                }, 100);
            }
        });
    }
    
    function startApplication() {
        // Initialize element cache first, before any DOM operations
        domUtils.initializeElementCache();
        
        // Then initialize other components
        themeManager.setupTheme();
        setupEventListeners();
        
        // Make sure map is initialized
        if (window.map && window.lightTileLayer && window.darkTileLayer) {
            const isDarkMode = themeManager.isDarkTheme();
            if (!window.currentTileLayer) {
                window.currentTileLayer = isDarkMode ? window.darkTileLayer : window.lightTileLayer;
                window.currentTileLayer.addTo(window.map);
                console.log("Map initialized during startup");
            }
            
            // Force map to refresh size after initialization
            setTimeout(function() {
                console.log("Invalidating map size on startup");
                window.map.invalidateSize();
                
                // Removed automatic test animation
            }, 500);
        } else {
            console.warn("Map elements not available during startup");
        }
        
        // Initialize server coordinates for attack animations
        // Get external IP from the DOM or fetch it
        const ipElement = document.getElementById('externalIP');
        if (ipElement && ipElement.textContent && ipElement.textContent !== '-') {
            // Use existing IP if available
            console.log("Getting server coordinates from existing IP");
            AttackAnimator.fetchServerCoordinates(ipElement.textContent)
                .then(coords => {
                    window.serverCoordinates = coords;
                    console.log("Server coordinates initialized:", coords);
                });
        } else {
            // Set default coordinates immediately so animations can work
            window.serverCoordinates = [37.7749, -122.4194]; // San Francisco default
            console.log("Using default server coordinates for initial setup");
            
            // Fetch server coordinates after a short delay (after IP might be loaded)
            setTimeout(() => {
                const ipElement = document.getElementById('externalIP');
                const ipValue = ipElement ? ipElement.textContent : null;
                
                if (ipValue && ipValue !== '-' && ipValue !== 'Unknown') {
                    console.log("Getting server coordinates with delayed IP:", ipValue);
                    AttackAnimator.fetchServerCoordinates(ipValue)
                        .then(coords => {
                            window.serverCoordinates = coords;
                            console.log("Server coordinates initialized with delay:", coords);
                        });
                }
            }, 3000); // Wait 3 seconds for IP to potentially load
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

// Function to check WebSocket health
function checkConnectionHealth() {
    console.log('Checking WebSocket connection health');
    
    // Skip health check during initial page load
    if (document.readyState !== 'complete') {
        console.log('Page still loading, skipping connection health check');
        return;
    }
    
    // If already reconnecting or reached max attempts, don't do anything
    if (window.isReconnecting) {
        console.log('Reconnection already in progress, skipping connection health check');
        return;
    }
    
    // If socket doesn't exist or we're already in a reconnection process, don't do anything
    if (!window.socket || window.reconnectAttempts > 0) {
        console.log('No socket or reconnection attempts > 0, initiating new connection');
        if (window.reconnectAttempts === 0) {
            // Show the loading overlay before reconnecting
            const loadingOverlay = domUtils.getElement('loadingOverlay');
            if (loadingOverlay && loadingOverlay.classList.contains('hidden')) {
                uiManager.toggleLoadingOverlay(true, 15);
            }
            websocketManager.reconnect();
        }
        return;
    }
    
    // Check if socket is in a healthy state
    const now = Date.now();
    const timeSinceActive = now - window.lastActiveTimestamp;
    const socketState = window.socket.readyState;
    
    console.log(`Connection check: Socket state=${socketState}, Time since active=${Math.round(timeSinceActive/1000)}s`);
    
    if (socketState === WebSocket.CLOSED || socketState === WebSocket.CLOSING) {
        console.log('Socket is closed or closing, reconnecting');
        // Show the loading overlay before reconnecting
        const loadingOverlay = domUtils.getElement('loadingOverlay');
        if (loadingOverlay && loadingOverlay.classList.contains('hidden')) {
            uiManager.toggleLoadingOverlay(true, 15);
        }
        websocketManager.reconnect();
        return;
    }
    
    // Even if socket appears OPEN, it might be stale if device was sleeping
    if (socketState === WebSocket.OPEN && timeSinceActive > 30000) {
        console.log('Socket appears open but may be stale, sending test message');
        
        // Try to send a ping message to verify connection
        const pingSuccess = websocketManager.sendMessage('ping', { timestamp: new Date().toISOString() });
        
        // Set a timeout to verify we get a response
        window.pingTimeout = setTimeout(() => {
            console.log('No ping response received, connection is stale. Reconnecting...');
            
            // Show the loading overlay before reconnecting
            const loadingOverlay = domUtils.getElement('loadingOverlay');
            if (loadingOverlay && loadingOverlay.classList.contains('hidden')) {
                uiManager.toggleLoadingOverlay(true, 15);
            }
            
            // Force reconnection
            if (window.socket) {
                window.socket.close();
            }
            websocketManager.reconnect();
        }, 2000);
    }
}

// Add event listeners for page visibility and network changes
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log('Page became visible, checking connection');
        window.lastActiveTimestamp = Date.now();
        checkConnectionHealth();
    }
});

// Handle focus events (useful for tab switching)
window.addEventListener('focus', () => {
    console.log('Window focused, checking connection');
    window.lastActiveTimestamp = Date.now();
    checkConnectionHealth();
});

// Handle online status changes
window.addEventListener('online', () => {
    console.log('Network connection restored');
    window.lastActiveTimestamp = Date.now();
    checkConnectionHealth();
});

window.addEventListener('offline', () => {
    console.log('Network connection lost');
    // No need to do anything, the WebSocket error handlers will trigger reconnection
});

// Update active timestamp periodically when page is visible
function updateActiveTimestamp() {
    if (document.visibilityState === 'visible') {
        window.lastActiveTimestamp = Date.now();
    }
}

// Update active timestamp every 10 seconds when page is visible
setInterval(updateActiveTimestamp, 10000); 

// Create custom animation toggle control
L.Control.AnimationToggle = L.Control.extend({
    options: {
        position: 'topleft'
    },

    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-control-animation leaflet-bar leaflet-control');
        this._link = L.DomUtil.create('a', window.animationsEnabled ? 'leaflet-control-animation-active' : '', container);
        this._link.href = '#';
        this._link.title = 'Toggle Attack Animations';
        this._link.innerHTML = `<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3V7M12 17V21M3 12H7M17 12H21M12 12H12.01M19 12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12C5 8.13401 8.13401 5 12 5C15.866 5 19 8.13401 19 12Z"/>
        </svg>`;

        // Add strike-through line initially if disabled
        if (!window.animationsEnabled) {
            setTimeout(() => {
                const svg = this._link.querySelector('svg');
                if (svg && !svg.querySelector('.strike-through-line')) {
                    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    line.setAttribute("x1", "4");
                    line.setAttribute("y1", "4");
                    line.setAttribute("x2", "20");
                    line.setAttribute("y2", "20");
                    line.setAttribute("stroke", "#ff0000");
                    line.setAttribute("stroke-width", "2");
                    line.setAttribute("class", "strike-through-line");
                    
                    // Set initial state for animation
                    line.style.opacity = '0';
                    line.style.strokeDasharray = '24';
                    line.style.strokeDashoffset = '24';
                    line.style.transition = 'opacity 0.3s ease, stroke-dashoffset 0.3s ease';
                    
                    svg.appendChild(line);
                    
                    // Trigger animation
                    setTimeout(() => {
                        line.style.opacity = '1';
                        line.style.strokeDashoffset = '0';
                    }, 10);
                }
            }, 0);
        }

        L.DomEvent.on(this._link, 'click', this._click, this);
        L.DomEvent.disableClickPropagation(container);

        return container;
    },

    _click: function(e) {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        
        window.animationsEnabled = !window.animationsEnabled;
        this._updateAnimationState();
    },
    
    _updateAnimationState: function() {
        if (window.animationsEnabled) {
            L.DomUtil.addClass(this._link, 'leaflet-control-animation-active');
            
            // Animate strike-through line removal if it exists
            const svg = this._link.querySelector('svg');
            const strikeLine = svg.querySelector('.strike-through-line');
            if (strikeLine) {
                // Animate out
                strikeLine.style.transition = 'opacity 0.3s ease, stroke-dashoffset 0.3s ease';
                strikeLine.style.opacity = '0';
                strikeLine.style.strokeDasharray = '24';
                strikeLine.style.strokeDashoffset = '24';
                
                // Remove after animation completes
                setTimeout(() => {
                    if (strikeLine.parentNode) {
                        svg.removeChild(strikeLine);
                    }
                }, 300);
            }
        } else {
            L.DomUtil.removeClass(this._link, 'leaflet-control-animation-active');
            
            // Fade out any ongoing animations
            if (window.attackAnimations && window.attackAnimations.length > 0) {
                // Add transition to all animation elements
                window.attackAnimations.forEach(animation => {
                    // Add fade-out animation to path
                    if (animation.path) {
                        // Try different ways to access the SVG element
                        const pathElement = animation.path._path || 
                                          (animation.path._renderer && animation.path._renderer._rootGroup) ||
                                          animation.path._container;
                        
                        if (pathElement && pathElement.style) {
                            pathElement.style.transition = 'opacity 0.4s ease-out';
                            pathElement.style.opacity = '0';
                        }
                    }
                    
                    // Add fade-out animation to markers
                    if (animation.attackerMarker) {
                        const attackerElement = animation.attackerMarker._path || 
                                              (animation.attackerMarker._renderer && animation.attackerMarker._renderer._rootGroup) ||
                                              animation.attackerMarker._container;
                        
                        if (attackerElement && attackerElement.style) {
                            attackerElement.style.transition = 'opacity 0.4s ease-out';
                            attackerElement.style.opacity = '0';
                        }
                    }
                    
                    if (animation.serverMarker) {
                        const serverElement = animation.serverMarker._path || 
                                            (animation.serverMarker._renderer && animation.serverMarker._renderer._rootGroup) ||
                                            animation.serverMarker._container;
                        
                        if (serverElement && serverElement.style) {
                            serverElement.style.transition = 'opacity 0.4s ease-out';
                            serverElement.style.opacity = '0';
                        }
                    }
                });
                
                // Remove animations after fade completes
                setTimeout(() => {
                    window.attackAnimations.forEach(animation => {
                        if (animation.path) window.map.removeLayer(animation.path);
                        if (animation.attackerMarker) window.map.removeLayer(animation.attackerMarker);
                        if (animation.serverMarker) window.map.removeLayer(animation.serverMarker);
                    });
                    window.attackAnimations = [];
                }, 400);
            }
            
            // Add and animate strike-through line if it doesn't exist
            const svg = this._link.querySelector('svg');
            if (!svg.querySelector('.strike-through-line')) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", "4");
                line.setAttribute("y1", "4");
                line.setAttribute("x2", "20");
                line.setAttribute("y2", "20");
                line.setAttribute("stroke", "#ff0000");
                line.setAttribute("stroke-width", "2");
                line.setAttribute("class", "strike-through-line");
                
                // Set initial state for animation
                line.style.opacity = '0';
                line.style.strokeDasharray = '24';
                line.style.strokeDashoffset = '24';
                line.style.transition = 'opacity 0.3s ease, stroke-dashoffset 0.3s ease';
                
                svg.appendChild(line);
                
                // Trigger animation
                setTimeout(() => {
                    line.style.opacity = '1';
                    line.style.strokeDashoffset = '0';
                }, 10);
            }
        }
    }
});

L.control.animationToggle = function(options) {
    return new L.Control.AnimationToggle(options);
};

// Add the animation toggle control to the map
window.animationToggleControl = L.control.animationToggle();
window.animationToggleControl.addTo(map);

// Add this function to inspect the heatmap object structure
function inspectHeatLayer() {
    console.log('Inspecting heatmap layer...');
    if (!window.heatLayer) {
        console.log('No heatLayer found in window object');
        return;
    }
    
    console.log('HeatLayer object keys:', Object.keys(window.heatLayer));
    
    // Try to find the actual DOM element
    for (const key in window.heatLayer) {
        if (key.startsWith('_')) {
            console.log(`Property ${key}:`, typeof window.heatLayer[key]);
            if (window.heatLayer[key] instanceof HTMLElement) {
                console.log(`Found HTMLElement: ${key}`);
            } else if (window.heatLayer[key] instanceof SVGElement) {
                console.log(`Found SVGElement: ${key}`);
            }
        }
    }
    
    // Check common properties used in Leaflet
    console.log('._container exists:', !!window.heatLayer._container);
    console.log('._heat exists:', !!window.heatLayer._heat);
    console.log('._el exists:', !!window.heatLayer._el);
    console.log('._canvas exists:', !!window.heatLayer._canvas);
    
    // If _heat exists, try to log its properties
    if (window.heatLayer._heat) {
        console.log('_heat type:', window.heatLayer._heat.constructor.name);
        console.log('_heat has style:', !!window.heatLayer._heat.style);
    }
    
    // If _canvas exists, try to log its properties
    if (window.heatLayer._canvas) {
        console.log('_canvas type:', window.heatLayer._canvas.constructor.name);
        console.log('_canvas has style:', !!window.heatLayer._canvas.style);
    }
}

// Call this function after the heatmap is created
const originalUpdateMap = updateMap;
// Remove the updateMap wrapper to restore original functionality
/*updateMap = function(attempt) {
    originalUpdateMap(attempt);
    // Add a delay to ensure the heatmap is fully created
    setTimeout(inspectHeatLayer, 500);
};*/

// Add this function to inspect the animation path elements
function inspectAnimationPaths() {
    console.log('Inspecting animation paths...');
    if (!window.attackAnimations || window.attackAnimations.length === 0) {
        console.log('No attackAnimations found or array is empty');
        return;
    }
    
    console.log('Number of attack animations:', window.attackAnimations.length);
    
    // Check the first animation
    const animation = window.attackAnimations[0];
    console.log('Animation object keys:', Object.keys(animation));
    
    // Check the path
    if (animation.path) {
        console.log('Path object keys:', Object.keys(animation.path));
        console.log('._path exists:', !!animation.path._path);
        
        if (animation.path._path) {
            console.log('_path type:', animation.path._path.constructor.name);
            console.log('_path has style:', !!animation.path._path.style);
        }
    }
    
    // Check the markers
    if (animation.attackerMarker) {
        console.log('attackerMarker object keys:', Object.keys(animation.attackerMarker));
        console.log('attackerMarker._path exists:', !!animation.attackerMarker._path);
        
        if (animation.attackerMarker._path) {
            console.log('attackerMarker._path type:', animation.attackerMarker._path.constructor.name);
            console.log('attackerMarker._path has style:', !!animation.attackerMarker._path.style);
        }
    }
}

// Test attack animations
window.testAnimationToggle = function() {
    // Create a test animation
    if (!window.animationsEnabled && window.attackAnimations.length === 0) {
        console.log('Creating test animation for debugging...');
        window.animationsEnabled = true;
        window.animationToggleControl._updateAnimationState();
        AttackAnimator.createTestAnimation();
        setTimeout(inspectAnimationPaths, 500);
    } else {
        console.log('Toggling animations off...');
        window.animationsEnabled = false;
        window.animationToggleControl._updateAnimationState();
    }
};

// Add a debug function to test the heatmap toggle
window.testHeatmapToggle = function() {
    console.log('Testing heatmap toggle...');
    console.log('Current heatmapEnabled state:', window.heatmapEnabled);
    
    // Toggle the heatmap
    window.heatmapEnabled = !window.heatmapEnabled;
    
    // Update the toggle button state
    if (window.heatmapToggleControl && window.heatmapToggleControl._updateHeatmapState) {
        window.heatmapToggleControl._updateHeatmapState();
        console.log('Toggled heatmap to:', window.heatmapEnabled);
    } else {
        console.log('Could not find heatmapToggleControl._updateHeatmapState');
    }
};