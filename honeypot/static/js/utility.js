// Common utility functions for the Honeypot application

// DOM utilities
const domUtils = (function() {
    // Cache for DOM elements
    const elementCache = {};
    
    // Get element by ID with caching
    function getElement(id, fallback = null) {
        if (!elementCache[id]) {
            elementCache[id] = document.getElementById(id);
        }
        return elementCache[id] || fallback;
    }
    
    // Get elements by query selector
    function getElements(selector) {
        return document.querySelectorAll(selector);
    }
    
    // Update text content if element exists
    function setText(id, text) {
        const element = getElement(id);
        if (element) {
            element.textContent = text;
            return true;
        }
        return false;
    }
    
    // Add/remove/toggle classes safely
    function addClass(element, className) {
        if (element && element.classList) {
            element.classList.add(className);
        }
    }
    
    function removeClass(element, className) {
        if (element && element.classList) {
            element.classList.remove(className);
        }
    }
    
    function toggleClass(element, className) {
        if (element && element.classList) {
            return element.classList.toggle(className);
        }
        return false;
    }
    
    // Animation helper
    function animateElement(element, className, duration = 200) {
        if (!element) return;
        addClass(element, className);
        setTimeout(() => {
            removeClass(element, className);
        }, duration);
    }
    
    // Show/hide elements
    function show(element) {
        if (element) {
            removeClass(element, 'hidden');
        }
    }
    
    function hide(element) {
        if (element) {
            addClass(element, 'hidden');
        }
    }
    
    // Force reflow (used for animations)
    function forceReflow(element) {
        if (element) {
            void element.offsetHeight;
        }
    }
    
    // Initialize commonly used elements
    function initializeElementCache() {
        const elementsToCache = [
            'attempts', 'searchInput', 'filterSelect', 'protocolSelect',
            'connectionStatus', 'connectionStatusIndicator', 'loadingOverlay',
            'loadingPercentage', 'loadingBar', 'loadingDetail', 'loadingText',
            'uniqueAttackers', 'totalAttempts', 'prevPage', 'nextPage',
            'startRange', 'endRange', 'totalItems', 'hamburgerBtn',
            'mobileMenu', 'exportDataButton', 'exportIPs', 'exportJSON', 'exportCSV',
            'darkModeToggleMenu', 'lightIconMenu', 'darkIconMenu', 'themeText',
            'faqButton', 'faqModal', 'closeFaqModal', 'exportDataModal', 'closeExportDataModal',
            'cpuPercent', 'cpuBar', 'memoryPercent', 'memoryBar', 'diskPercent', 'diskBar',
            'networkSent', 'networkReceived', 'networkConnections', 'systemUptime',
            'load1min', 'load5min', 'externalIP', 'serviceStatus', 'systemStatusModal'
        ];
        
        elementsToCache.forEach(id => {
            elementCache[id] = document.getElementById(id);
        });
    }
    
    // Clear cache (useful for testing or when DOM changes)
    function clearCache() {
        for (const key in elementCache) {
            delete elementCache[key];
        }
    }
    
    return {
        getElement,
        getElements,
        setText,
        addClass,
        removeClass,
        toggleClass,
        animateElement,
        show,
        hide,
        forceReflow,
        initializeElementCache,
        clearCache
    };
})();

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

// Formatting functions
const formatUtils = {
    // Format date for UI display
    formatDateToLocalTime: function(isoString) {
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
    },
    
    // Format date for charts
    formatDate: function(date) {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    },

    // Format hour for charts
    formatHour: function(hour) {
        const h = hour % 12 || 12;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${h}${ampm}`;
    },

    // Format time with minutes for charts
    formatTimeWithMinutes: function(hour, minutes) {
        const h = hour % 12 || 12;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${h}:${minutes.toString().padStart(2, '0')}${ampm}`;
    },
    
    // Format bytes to human readable format
    formatBytes: function(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Format uptime to human readable format
    formatUptime: function(seconds) {
        const days = Math.floor(seconds / (24 * 3600));
        const hours = Math.floor((seconds % (24 * 3600)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m ${remainingSeconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${remainingSeconds}s`;
        }
    }
};

// UI animation utilities
const animationUtils = {
    // Function to update element with animation
    updateElementWithAnimation: function(elementId, newValue) {
        const element = domUtils.getElement(elementId);
        if (element && element.textContent !== newValue) {
            element.textContent = newValue;
            element.classList.remove('metric-update');
            void element.offsetWidth; // Trigger reflow
            element.classList.add('metric-update');
        }
    }
};

// Theme management module
const themeManager = (function() {
    function setMapTheme(isDark) {
        // Safely access global variables
        const globalMap = window.map;
        const globalLightTileLayer = window.lightTileLayer;
        const globalDarkTileLayer = window.darkTileLayer;
        
        // Check if map and tile layers are defined
        if (!globalMap || !globalLightTileLayer || !globalDarkTileLayer) {
            console.warn('Map or tile layers not available in the global scope');
            return;
        }
        
        // Remove existing tile layer if it exists
        if (window.currentTileLayer) {
            globalMap.removeLayer(window.currentTileLayer);
        }
        
        // Add the appropriate tile layer
        window.currentTileLayer = isDark ? globalDarkTileLayer : globalLightTileLayer;
        window.currentTileLayer.addTo(globalMap);
    }
    
    // Check if dark theme is currently active
    function isDarkTheme() {
        return document.documentElement.classList.contains('dark');
    }
    
    function updateAllChartThemes(isDark) {
        if (typeof updateChartColors !== 'function') return;
        
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
    }
    
    function toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        const lightIconMenu = domUtils.getElement('lightIconMenu');
        const darkIconMenu = domUtils.getElement('darkIconMenu');
        const themeText = domUtils.getElement('themeText');
        
        if (lightIconMenu && darkIconMenu) {
            lightIconMenu.classList.toggle('hidden');
            darkIconMenu.classList.toggle('hidden');
        }
        
        if (themeText) {
            themeText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
        }
        
        localStorage.theme = isDark ? 'dark' : 'light';
        setMapTheme(isDark);
        updateAllChartThemes(isDark);
        
        // Make sure heatmap toggle button looks correct with new theme
        if (window.heatmapToggleControl && 
            window.heatmapToggleControl._updateHeatmapState) {
            window.heatmapToggleControl._updateHeatmapState();
        }
        
        // Make sure animation toggle button looks correct with new theme
        if (window.animationToggleControl && 
            window.animationToggleControl._updateAnimationState) {
            window.animationToggleControl._updateAnimationState();
        }
        
        return isDark;
    }
    
    function setupTheme() {
        // Initialize theme based on user preference, system preference, or default to light mode
        const isDark = localStorage.theme === 'dark' || 
            (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.theme = 'dark';
            const lightIconMenu = domUtils.getElement('lightIconMenu');
            const darkIconMenu = domUtils.getElement('darkIconMenu');
            const themeText = domUtils.getElement('themeText');
            if (lightIconMenu && darkIconMenu) {
                lightIconMenu.classList.remove('hidden');
                darkIconMenu.classList.add('hidden');
            }
            if (themeText) {
                themeText.textContent = 'Light Mode';
            }
        } else {
            // Default to light mode if no preference is set or system is light mode
            document.documentElement.classList.remove('dark');
            localStorage.theme = 'light';
            const themeText = domUtils.getElement('themeText');
            if (themeText) {
                themeText.textContent = 'Dark Mode';
            }
        }
        
        // Ensure map theme is set correctly if map exists
        if (window.map && window.lightTileLayer && window.darkTileLayer) {
            setMapTheme(isDark);
        }
        
        // Ensure chart colors are updated correctly
        updateAllChartThemes(isDark);
    }
    
    return {
        setMapTheme,
        updateAllChartThemes,
        toggleTheme,
        setupTheme,
        isDarkTheme
    };
})();

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