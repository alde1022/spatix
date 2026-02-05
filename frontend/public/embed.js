/**
 * Spatix Embed Script
 * 
 * Usage:
 * <div data-spatix-map="MAP_ID"></div>
 * <script src="https://spatix.io/embed.js"></script>
 * 
 * Or with options:
 * <div 
 *   data-spatix-map="MAP_ID"
 *   data-spatix-height="400"
 *   data-spatix-style="dark"
 * ></div>
 */
(function() {
  const SPATIX_URL = 'https://spatix.io';
  
  function initSpatixEmbeds() {
    const containers = document.querySelectorAll('[data-spatix-map]');
    
    containers.forEach(function(container) {
      const mapId = container.getAttribute('data-spatix-map');
      const height = container.getAttribute('data-spatix-height') || '400';
      
      if (!mapId) return;
      
      // Create iframe
      const iframe = document.createElement('iframe');
      iframe.src = SPATIX_URL + '/m/' + mapId + '?embed=1';
      iframe.style.width = '100%';
      iframe.style.height = height + 'px';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '8px';
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('allowfullscreen', 'true');
      
      container.appendChild(iframe);
    });
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSpatixEmbeds);
  } else {
    initSpatixEmbeds();
  }
})();
