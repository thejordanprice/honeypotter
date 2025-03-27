/**
 * Map Controls Fix - Ensures proper visibility of Leaflet control icons
 */

document.addEventListener('DOMContentLoaded', function() {
    // Wait for map to be initialized
    function checkAndFixFullscreenControl() {
        const fullscreenControl = document.querySelector('.leaflet-control-fullscreen a');
        
        if (fullscreenControl) {
            // Force clear the existing content
            fullscreenControl.innerHTML = '';
            updateFullscreenIcon();
            
            // Add event listener to update icon when fullscreen state changes
            document.addEventListener('fullscreenchange', updateFullscreenIcon);
            document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
            document.addEventListener('mozfullscreenchange', updateFullscreenIcon);
            document.addEventListener('MSFullscreenChange', updateFullscreenIcon);
            
            // Monitor for hover events to fix potential hidden icon issues
            fullscreenControl.addEventListener('mouseenter', function() {
                if (!fullscreenControl.style.backgroundImage) {
                    updateFullscreenIcon();
                }
            });
            
            console.log('Fullscreen control icon fixed');
            return true;
        }
        return false;
    }
    
    function updateFullscreenIcon() {
        const fullscreenControl = document.querySelector('.leaflet-control-fullscreen a');
        if (!fullscreenControl) return;
        
        // First determine if we're in fullscreen mode
        const isFullscreen = document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.mozFullScreenElement || 
                           document.msFullscreenElement;
        
        // Check if map container has fullscreen class
        const mapContainer = document.querySelector('#map');
        const hasFullscreenClass = mapContainer && mapContainer.parentElement && 
                                 mapContainer.parentElement.classList.contains('leaflet-fullscreen');
        
        // Also check if the control itself has the fullscreen class
        const controlHasFullscreenClass = fullscreenControl.closest('.leaflet-control-fullscreen-button') ||
                                        fullscreenControl.closest('.leaflet-control').classList.contains('leaflet-fullscreen');
        
        // Get the leaflet container and check if it has the fullscreen-on class
        const leafletContainer = document.querySelector('.leaflet-container');
        const containerFullscreenOn = leafletContainer && leafletContainer.classList.contains('leaflet-fullscreen-on');
        
        // Combining all checks to determine if we're in fullscreen mode
        const effectivelyFullscreen = isFullscreen || hasFullscreenClass || controlHasFullscreenClass || containerFullscreenOn;
        
        if (effectivelyFullscreen) {
            // Exit fullscreen icon
            fullscreenControl.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'244 4039 20 20\' width=\'20\' height=\'20\' fill=\'%23000000\'%3E%3Cpath d=\'M262.4445,4039 L256.0005,4039 L256.0005,4041 L262.0005,4041 L262.0005,4047 L264.0005,4047 L264.0005,4039.955 L264.0005,4039 L262.4445,4039 Z M262.0005,4057 L256.0005,4057 L256.0005,4059 L262.4445,4059 L264.0005,4059 L264.0005,4055.955 L264.0005,4051 L262.0005,4051 L262.0005,4057 Z M246.0005,4051 L244.0005,4051 L244.0005,4055.955 L244.0005,4059 L246.4445,4059 L252.0005,4059 L252.0005,4057 L246.0005,4057 L246.0005,4051 Z M246.0005,4047 L244.0005,4047 L244.0005,4039.955 L244.0005,4039 L246.4445,4039 L252.0005,4039 L252.0005,4041 L246.0005,4041 L246.0005,4047 Z\'%3E%3C/path%3E%3C/svg%3E")';
        } else {
            // Enter fullscreen icon
            fullscreenControl.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'244 4039 20 20\' width=\'20\' height=\'20\' fill=\'%23000000\'%3E%3Cpath d=\'M262.4445,4039 L256.0005,4039 L256.0005,4041 L262.0005,4041 L262.0005,4047 L264.0005,4047 L264.0005,4039.955 L264.0005,4039 L262.4445,4039 Z M262.0005,4057 L256.0005,4057 L256.0005,4059 L262.4445,4059 L264.0005,4059 L264.0005,4055.955 L264.0005,4051 L262.0005,4051 L262.0005,4057 Z M246.0005,4051 L244.0005,4051 L244.0005,4055.955 L244.0005,4059 L246.4445,4059 L252.0005,4059 L252.0005,4057 L246.0005,4057 L246.0005,4051 Z M246.0005,4047 L244.0005,4047 L244.0005,4039.955 L244.0005,4039 L246.4445,4039 L252.0005,4039 L252.0005,4041 L246.0005,4041 L246.0005,4047 Z\'%3E%3C/path%3E%3C/svg%3E")';
        }
        
        // Apply additional styling to ensure visibility
        fullscreenControl.style.backgroundSize = '20px 20px';
        fullscreenControl.style.backgroundPosition = 'center';
        fullscreenControl.style.backgroundRepeat = 'no-repeat';
        fullscreenControl.style.fontSize = '0';
        fullscreenControl.style.textIndent = '-9999px';
        fullscreenControl.style.color = 'transparent';
        
        // Force the style to be applied with !important equivalent
        fullscreenControl.setAttribute('style', fullscreenControl.getAttribute('style') + ' !important');
    }
    
    // Observe for changes in the map container that indicate fullscreen mode
    function observeMapContainer() {
        const mapContainer = document.querySelector('#map');
        if (!mapContainer) return;
        
        if (window.MutationObserver) {
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.attributeName === 'class') {
                        updateFullscreenIcon();
                    }
                });
            });
            
            observer.observe(mapContainer, { attributes: true, childList: false, subtree: false });
            
            // Also observe the Leaflet container
            const leafletContainer = document.querySelector('.leaflet-container');
            if (leafletContainer) {
                observer.observe(leafletContainer, { attributes: true, childList: false, subtree: false });
            }
        }
    }
    
    // Wait for the map to be fully initialized
    let attempts = 0;
    const maxAttempts = 20;
    const checkInterval = setInterval(function() {
        if ((checkAndFixFullscreenControl() && observeMapContainer()) || attempts >= maxAttempts) {
            clearInterval(checkInterval);
            
            // Set up a periodic check for icon visibility issues
            setInterval(function() {
                const fullscreenControl = document.querySelector('.leaflet-control-fullscreen a');
                if (fullscreenControl && !fullscreenControl.style.backgroundImage) {
                    updateFullscreenIcon();
                }
            }, 2000);
        }
        attempts++;
    }, 250);
    
    // Add click handler to fix icon after clicking
    document.addEventListener('click', function(e) {
        if (e.target.closest('.leaflet-control-fullscreen')) {
            // Delayed update after click to catch state change
            setTimeout(updateFullscreenIcon, 100);
        }
    });
}); 