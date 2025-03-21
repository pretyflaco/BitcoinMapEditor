import { useEffect, useCallback, useState } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import { useQuery } from "@tanstack/react-query";
import type { Merchant } from "@shared/schema";
import "@maplibre/maplibre-gl-leaflet";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { Search, Locate } from "lucide-react";
import { deduplicateMerchants } from "@/lib/deduplication";

// Function to truncate URLs for display
function truncateUrl(url: string, maxLength: number = 30): string {
  if (!url) return '';
  // Remove protocol (http:// or https://)
  const cleanUrl = url.replace(/^https?:\/\//i, '');
  if (cleanUrl.length <= maxLength) return cleanUrl;
  return cleanUrl.substring(0, maxLength - 3) + '...';
}

// Add platform-specific navigation handler at the top of the file
function getNavigationUrl(lat: number, lng: number): string {
  // Check if it's iOS
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    return `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  }
  // Check if it's Android
  else if (/Android/.test(navigator.userAgent)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  // Fallback for desktop/other platforms
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// Update the SearchAndLocate control to handle mobile positioning
L.Control.SearchAndLocate = L.Control.extend({
  onAdd: function(map: L.Map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control mobile-controls');
    container.style.backgroundColor = 'transparent';
    container.style.padding = '5px';

    // Search container
    const searchContainer = L.DomUtil.create('div', '', container);
    searchContainer.style.display = 'flex';
    searchContainer.style.alignItems = 'center';
    searchContainer.style.marginBottom = '5px';

    // Search button
    const searchButton = L.DomUtil.create('a', '', searchContainer);
    searchButton.href = '#';
    searchButton.title = 'Search merchants';
    searchButton.style.display = 'block';
    searchButton.style.padding = '5px';
    searchButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;

    // Search input (hidden by default)
    const searchInput = L.DomUtil.create('input', '', searchContainer);
    searchInput.type = 'text';
    searchInput.placeholder = 'Search merchants...';
    searchInput.style.display = 'none';
    searchInput.style.marginLeft = '5px';
    searchInput.style.padding = '4px 8px';
    searchInput.style.border = '1px solid var(--border)';
    searchInput.style.borderRadius = '4px';
    searchInput.style.width = '200px';
    searchInput.style.backgroundColor = 'var(--background)';
    searchInput.style.color = 'var(--foreground)';

    // Search results container
    const searchResults = L.DomUtil.create('div', '', container);
    searchResults.style.display = 'none';
    searchResults.style.position = 'absolute';
    searchResults.style.backgroundColor = 'var(--background)';
    searchResults.style.border = '1px solid var(--border)';
    searchResults.style.borderRadius = '4px';
    searchResults.style.marginTop = '5px';
    searchResults.style.maxHeight = '200px';
    searchResults.style.overflowY = 'auto';
    searchResults.style.width = '250px';
    searchResults.style.zIndex = '1000';

    // Locate button in a separate container
    const locateContainer = L.DomUtil.create('div', 'locate-container', container);
    const locateButton = L.DomUtil.create('a', '', locateContainer);
    locateButton.href = '#';
    locateButton.title = 'Find my location';
    locateButton.style.display = 'block';
    locateButton.style.padding = '5px';
    locateButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><point cx="12" cy="12" r="3"></point></svg>`;

    // Prevent map click events when clicking controls
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    // Add click handlers
    L.DomEvent.on(searchButton, 'click', function(e) {
      L.DomEvent.preventDefault(e);
      const isVisible = searchInput.style.display === 'block';
      searchInput.style.display = isVisible ? 'none' : 'block';
      searchResults.style.display = 'none';
      if (!isVisible) {
        searchInput.focus();
      }
    });

    // Search input handler
    L.DomEvent.on(searchInput, 'input', function(e) {
      const query = (e.target as HTMLInputElement).value.toLowerCase();
      if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
      }

      // Get current markers from the map's global scope
      if (this.options.onSearch) {
        this.options.onSearch(query, searchResults);
      }
    }, this);

    L.DomEvent.on(locateButton, 'click', function(e) {
      L.DomEvent.preventDefault(e);
      if (map.locate) {
        map.locate({setView: true, maxZoom: 16});
      }
    });

    return container;
  }
});

// MapLayer component to handle MapLibre GL initialization
function MapLayer() {
  const map = useMap();
  const { theme } = useTheme();
  const { toast } = useToast();
  const markersRef = new Map<string, L.Marker>();
  const MAX_NEW_MARKERS = 70;
  const MAX_TOTAL_MARKERS = 300;
  const GRID_SIZE = 5;

  // Helper function to calculate distance from viewport center
  const getDistanceFromViewport = (lat: number, lng: number) => {
    const bounds = map.getBounds();
    const center = bounds.getCenter();
    return Math.sqrt(
      Math.pow(center.lat - lat, 2) +
      Math.pow(center.lng - lng, 2)
    );
  };

  // Helper function to remove distant markers
  const removeDistantMarkers = useCallback(() => {
    if (markersRef.size <= MAX_TOTAL_MARKERS) return;

    const bounds = map.getBounds();
    const center = bounds.getCenter();

    // Create array of markers with their distances
    const markersWithDistance = Array.from(markersRef.entries()).map(([id, marker]) => {
      const pos = marker.getLatLng();
      return {
        id,
        marker,
        distance: getDistanceFromViewport(pos.lat, pos.lng)
      };
    });

    // Sort by distance (farthest first)
    markersWithDistance.sort((a, b) => b.distance - a.distance);

    // Remove markers until we're under the limit
    const markersToRemove = markersWithDistance.slice(0, markersWithDistance.length - MAX_TOTAL_MARKERS);
    markersToRemove.forEach(({ id, marker }) => {
      map.removeLayer(marker);
      markersRef.delete(id);
    });
  }, [map, markersRef]);

  // Get all merchants data
  const { data: merchantsData } = useQuery({
    queryKey: ["/api/merchants"],
  });

  // Extract individual merchant lists
  const btcMapMerchants = merchantsData?.btcmap || [];
  const blinkMerchants = merchantsData?.blink || [];
  const bitcoinJungleMerchants = merchantsData?.bitcoinjungle || [];

  const updateVisibleMarkers = useCallback(() => {
    if (!map) return;

    const bounds = map.getBounds();

    // Apply deduplication and get matches
    const { 
      blinkMerchants: uniqueBlinkMerchants, 
      bitcoinJungleMerchants: uniqueBitcoinJungleMerchants, 
      stats,
      blinkBtcMapMatches 
    } = deduplicateMerchants(
      btcMapMerchants,
      blinkMerchants,
      bitcoinJungleMerchants
    );

    // Find matching Blink merchant for a BTCMap ID
    const getMatchingBlinkMerchant = (btcMapId: string) => {
      const blinkUsername = Object.entries(blinkBtcMapMatches)
        .find(([_, matchedBtcMapId]) => matchedBtcMapId === btcMapId)?.[0];
      if (blinkUsername) {
        return blinkMerchants.find(m => m.username === blinkUsername);
      }
      return null;
    };

    // Log deduplication stats
    console.log('Deduplication stats:', stats);

    // Create grid system
    const latSpan = bounds.getNorth() - bounds.getSouth();
    const lngSpan = bounds.getEast() - bounds.getWest();
    const cellLatSize = latSpan / GRID_SIZE;
    const cellLngSize = lngSpan / GRID_SIZE;
    const grid: Array<{
      merchant: any;
      source: 'btcmap' | 'blink' | 'bitcoinjungle';
      cell: string;
    }> = [];

    // Process BTCMap merchants
    btcMapMerchants
      .filter(merchant => !merchant.osm_json?.tags?.deleted_at && !merchant.deleted_at)
      .forEach(merchant => {
        if (!merchant.osm_json?.lat || !merchant.osm_json?.lon) return;
        const lat = merchant.osm_json.lat;
        const lng = merchant.osm_json.lon;
        if (bounds.contains([lat, lng])) {
          const cellRow = Math.floor((lat - bounds.getSouth()) / cellLatSize);
          const cellCol = Math.floor((lng - bounds.getWest()) / cellLngSize);
          const cell = `${cellRow}-${cellCol}`;
          grid.push({ merchant, source: 'btcmap', cell });
        }
      });

    // Process unique Blink merchants
    uniqueBlinkMerchants.forEach(marker => {
      const { coordinates, title } = marker.mapInfo;
      const lat = coordinates.latitude;
      const lng = coordinates.longitude;
      if (bounds.contains([lat, lng])) {
        const cellRow = Math.floor((lat - bounds.getSouth()) / cellLatSize);
        const cellCol = Math.floor((lng - bounds.getWest()) / cellLngSize);
        const cell = `${cellRow}-${cellCol}`;
        grid.push({ merchant: marker, source: 'blink', cell });
      }
    });

    // Process unique Bitcoin Jungle merchants
    uniqueBitcoinJungleMerchants.forEach(merchant => {
      const lat = merchant.coordinates?.latitude;
      const lng = merchant.coordinates?.longitude;
      if (lat && lng && bounds.contains([lat, lng])) {
        const cellRow = Math.floor((lat - bounds.getSouth()) / cellLatSize);
        const cellCol = Math.floor((lng - bounds.getWest()) / cellLngSize);
        const cell = `${cellRow}-${cellCol}`;
        grid.push({ merchant, source: 'bitcoinjungle', cell });
      }
    });

    // Group markers by cell
    const newMarkersGroups = grid.reduce((acc, item) => {
      if (!acc[item.cell]) {
        acc[item.cell] = {
          blink: [],
          btcmap: [],
          bitcoinjungle: [],
        };
      }
      acc[item.cell][item.source].push(item);
      return acc;
    }, {} as Record<string, Record<'blink' | 'btcmap' | 'bitcoinjungle', typeof grid>>);

    // Add new markers up to the limit
    let addedCount = 0;
    Object.values(newMarkersGroups).forEach(cellSources => {
      if (addedCount >= MAX_NEW_MARKERS) return;

      ['bitcoinjungle', 'blink', 'btcmap'].forEach(source => {
        if (addedCount >= MAX_NEW_MARKERS) return;

        const markers = cellSources[source as 'bitcoinjungle' | 'blink' | 'btcmap'];
        markers.forEach(({ merchant, source }) => {
          if (addedCount >= MAX_NEW_MARKERS) return;

          let lat, lng, id, details, icon;

          switch (source) {
            case 'bitcoinjungle':
              lat = merchant.coordinates.latitude;
              lng = merchant.coordinates.longitude;
              id = `bitcoinjungle-${merchant.id}`;
              details = `
                <div class="text-center min-w-[280px]">
                  <img
                    src="/images/bitcoinjungle.png"
                    alt="Bitcoin Jungle Logo"
                    class="w-12 h-12 mx-auto mb-2 object-contain"
                  />
                  <strong>${merchant.name}</strong><br/>
                  ${merchant.categories?.map((cat: any) => cat.name).join(', ')}<br/>
                  ${merchant.phone ? `📞 ${merchant.phone}<br/>` : ''}
                  ${merchant.website ? `🌐 <a href="${merchant.website}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${truncateUrl(merchant.website)}</a><br/>` : ''}
                  ${merchant.description ? `<div class="mt-2">${merchant.description}</div>` : ''}
                  <div class="flex justify-between items-center mt-2">
                    <div class="flex gap-2">
                      <img
                        src="https://btcmap.org/icons/ln-primary.svg"
                        alt="Lightning Network enabled"
                        class="w-6 h-6"
                      />
                    </div>
                    <a href="javascript:void(0)"
                       onclick="window.location.href = '${getNavigationUrl(lat, lng)}'"
                       class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                    </a>
                  </div>
                </div>`;
              icon = bitcoinJungleIcon;
              break;

            case 'blink':
              lat = merchant.mapInfo.coordinates.latitude;
              lng = merchant.mapInfo.coordinates.longitude;
              id = `blink-${merchant.username}`;
              details = `
                <div class="text-center min-w-[280px]">
                  <img
                    src="/images/blink.png"
                    alt="Blink Logo"
                    class="w-12 h-12 mx-auto mb-2 object-contain"
                  />
                  <strong>${merchant.mapInfo.title}</strong><br/>
                  <span>@${merchant.username}</span><br/>
                  <div class="flex justify-between items-center mt-2">
                    <div class="flex gap-2">
                      <img
                        src="https://btcmap.org/icons/ln-primary.svg"
                        alt="Lightning Network enabled"
                        class="w-6 h-6"
                      />
                    </div>
                    <div class="flex gap-2">
                      <a href="https://pay.blink.sv/${merchant.username}"
                         target="_blank"
                         rel="noopener noreferrer"
                         class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="2" y="5" width="20" height="14" rx="2"/>
                          <line x1="2" y1="10" x2="22" y2="10"/>
                        </svg>
                      </a>
                      <a href="javascript:void(0)"
                         onclick="window.location.href = '${getNavigationUrl(lat, lng)}'"
                         class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>`;
              icon = blinkIcon;
              break;

            case 'btcmap':
              lat = merchant.osm_json.lat;
              lng = merchant.osm_json.lon;
              id = `btcmap-${merchant.id}`;
              const tags = merchant.osm_json?.tags || {};
              const address = [
                tags['addr:street'],
                tags['addr:housenumber'],
                tags['addr:city'],
                tags['addr:country']
              ].filter(Boolean).join(', ');
              const type = tags.amenity || tags.shop || tags.tourism || tags.leisure || 'Other';
              const phone = tags.phone || tags['contact:phone'];
              const website = tags.website || tags['contact:website'];
              const openingHours = tags['opening_hours'];
              const lastSurveyed = tags['survey:date'] || null;
              const paymentMethods = {
                bitcoin: tags['payment:bitcoin'],
                lightning: tags['payment:lightning'],
                contactless: tags['payment:contactless']
              };

              // Check if there's a matching Blink merchant
              const matchingBlinkMerchant = getMatchingBlinkMerchant(merchant.id);
              const blinkPaymentButton = matchingBlinkMerchant ? `
                <a href="https://pay.blink.sv/${matchingBlinkMerchant.username}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2"/>
                    <line x1="2" y1="10" x2="22" y2="10"/>
                  </svg>
                </a>
              ` : '';

              details = `
                <div class="text-center min-w-[280px]">
                  <img
                    src="https://btcmap.org/images/logo.svg"
                    alt="BTCMap Logo"
                    class="w-12 h-12 mx-auto mb-2 object-contain"
                  />
                  <strong>${merchant.osm_json?.tags?.name || 'Unknown Merchant'}</strong><br/>
                  <em>${type}</em><br/>
                  ${address ? `📍 ${address}<br/>` : ''}
                  ${phone ? `📞 ${phone}<br/>` : ''}
                  ${website ? `🌐 <a href="${website}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${truncateUrl(website)}</a><br/>` : ''}
                  ${openingHours ? `⏰ ${openingHours}<br/>` : ''}
                  ${lastSurveyed ? `📅 Last surveyed: ${lastSurveyed}<br/>` : ''}
                  <div class="flex justify-between items-center mt-2">
                    <div class="flex gap-2">
                      <img
                        src="https://btcmap.org/icons/${paymentMethods.bitcoin === 'yes' ? 'btc-primary' : 'btc'}.svg"
                        alt="Bitcoin payments"
                        class="w-6 h-6"
                      />
                      <img
                        src="https://btcmap.org/icons/${paymentMethods.lightning === 'yes' ? 'ln-primary' : 'ln'}.svg"
                        alt="Lightning payments"
                        class="w-6 h-6"
                      />
                      <img
                        src="https://btcmap.org/icons/${paymentMethods.contactless === 'yes' ? 'nfc-primary' : 'nfc'}.svg"
                        alt="Contactless payments"
                        class="w-6 h-6"
                      />
                    </div>
                    <div class="flex gap-2">
                      ${blinkPaymentButton}
                      <a href="javascript:void(0)"
                         onclick="window.location.href = '${getNavigationUrl(lat, lng)}'"
                         class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>`;
              icon = btcmapIcon;
              break;
          }

          if (!markersRef.has(id)) {
            const marker = L.marker([lat, lng], { icon })
              .bindPopup(details)
              .addTo(map);
            markersRef.set(id, marker);
            addedCount++;
          }
        });
      });
    });

    // After adding new markers, check if we need to remove distant ones
    removeDistantMarkers();
  }, [map, btcMapMerchants, blinkMerchants, bitcoinJungleMerchants, markersRef, removeDistantMarkers]);

  // Initialize markers and set up map event listeners
  useEffect(() => {
    if (!map) return;

    const throttledUpdate = L.Util.throttle(() => updateVisibleMarkers(), 500, { leading: true });

    console.log('Merchant data received:', {
      btcMap: btcMapMerchants.length,
      blink: blinkMerchants.length,
      bitcoinJungle: bitcoinJungleMerchants.length
    });

    map.on('moveend', throttledUpdate);
    map.on('zoomend', throttledUpdate);

    // Initial update
    updateVisibleMarkers();

    return () => {
      map.off('moveend', throttledUpdate);
      map.off('zoomend', throttledUpdate);
    };
  }, [map, merchantsData, updateVisibleMarkers]);

  // Function to handle search
  const handleSearch = useCallback((query: string, resultsContainer: HTMLDivElement) => {
    const searchResults: Array<{
      name: string;
      type: 'local' | 'btcmap' | 'blink' | 'bitcoinjungle';
      lat: number;
      lng: number;
    }> = [];

    // Search in local merchants (This part needs to be adjusted based on the new data structure)
    // Assuming localMerchants is still available in the new data structure.  Adjust accordingly.

    // Search in BTCMap merchants
    btcMapMerchants.forEach(merchant => {
      const name = merchant.osm_json?.tags?.name || '';
      if (name.toLowerCase().includes(query)) {
        searchResults.push({
          name,
          type: 'btcmap',
          lat: merchant.osm_json.lat,
          lng: merchant.osm_json.lon
        });
      }
    });

    // Search in Blink merchants
    blinkMerchants.forEach(merchant => {
      if (merchant.mapInfo.title.toLowerCase().includes(query)) {
        searchResults.push({
          name: merchant.mapInfo.title,
          type: 'blink',
          lat: merchant.mapInfo.coordinates.latitude,
          lng: merchant.mapInfo.coordinates.longitude
        });
      }
    });

    // Display results
    resultsContainer.innerHTML = '';
    resultsContainer.style.display = searchResults.length ? 'block' : 'none';

    searchResults.forEach(result => {
      const resultItem = document.createElement('div');
      resultItem.style.padding = '8px';
      resultItem.style.cursor = 'pointer';
      resultItem.style.borderBottom = '1px solid var(--border)';
      resultItem.style.color = 'var(--foreground)';
      resultItem.innerHTML = `
        <div style="font-weight: bold;">${result.name}</div>
        <div style="color: var(--muted-foreground); font-size: 0.9em;">${result.type}</div>
      `;

      resultItem.addEventListener('mouseover', () => {
        resultItem.style.backgroundColor = 'var(--accent)';
      });

      resultItem.addEventListener('mouseout', () => {
        resultItem.style.backgroundColor = 'transparent';
      });

      resultItem.addEventListener('click', () => {
        map.flyTo([result.lat, result.lng], 16);
        resultsContainer.style.display = 'none';
      });

      resultsContainer.appendChild(resultItem);
    });
  }, [btcMapMerchants, blinkMerchants]);

  useEffect(() => {
    const style = theme === 'dark'
      ? 'https://tiles.openfreemap.org/styles/dark'
      : 'https://tiles.openfreemap.org/styles/positron';

    let maplibreLayer: any = null;
    let isDestroyed = false;

    try {
      maplibreLayer = (L as any).maplibreGL({
        style,
        attribution: '© OpenFreeMap contributors'
      });

      // Only add the layer if it doesn't exist and map is still valid
      if (!isDestroyed && map && !map.hasLayer(maplibreLayer)) {
        map.addLayer(maplibreLayer);
      }
    } catch (error) {
      console.warn('Error adding maplibre layer:', error);
    }

    // Add custom controls
    const searchAndLocateControl = new (L.Control as any).SearchAndLocate({
      position: 'topleft',
      onSearch: handleSearch
    });

    if (!isDestroyed && map) {
      try {
        map.addControl(searchAndLocateControl);
      } catch (error) {
        console.warn('Error adding search control:', error);
      }
    }

    // Handle location events
    const locationFoundHandler = (e: L.LocationEvent) => {
      if (isDestroyed) return;
      const radius = e.accuracy;
      L.marker(e.latlng).addTo(map)
        .bindPopup("You are within " + Math.round(radius) + " meters from this point").openPopup();
      L.circle(e.latlng, radius).addTo(map);
    };

    const locationErrorHandler = (error: L.ErrorEvent) => {
      if (isDestroyed) return;
      toast({
        description: "Location access error. Please check your browser settings.",
      });
    };

    if (map) {
      map.on('locationfound', locationFoundHandler);
      map.on('locationerror', locationErrorHandler);
    }

    // Clean up function
    return () => {
      isDestroyed = true;

      // Remove event listeners first
      if (map) {
        map.off('locationfound', locationFoundHandler);
        map.off('locationerror', locationErrorHandler);
      }

      // Cleanup layer with proper checks
      if (map && maplibreLayer) {
        try {
          // Check if the map still exists and has the layer
          if (map.hasLayer(maplibreLayer)) {
            map.removeLayer(maplibreLayer);
          }
        } catch (error) {
          // Ignore AbortError as it's expected during cleanup
          if (error instanceof Error && error.name !== 'AbortError') {
            console.warn('Error removing maplibre layer:', error);
          }
        }
      }

      // Remove control with proper checks
      if (map && searchAndLocateControl) {
        try {
          map.removeControl(searchAndLocateControl);
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.warn('Error removing search control:', error);
          }
        }
      }
    };
  }, [map, theme, toast, handleSearch]);

  return null;
}

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface MapViewProps {
  selectedLocation: { lat: number; lng: number } | null;
  onLocationSelect: (location: { lat: number; lng: number }) => void;
}

function LocationMarker({ selectedLocation, onLocationSelect }: MapViewProps) {
  const map = useMapEvents({
    click(e) {
      onLocationSelect(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return selectedLocation ? (
    <Marker
      position={selectedLocation}
      icon={L.icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        shadowSize: [41, 41],
      })}
    />
  ) : null;
}

// Add custom icon definitions
const createCustomIcon = (type: 'blink' | 'btcmap' | 'default' | 'bitcoinjungle') => {
  let color: string;
  switch (type) {
    case 'blink':
      color = '#FB5607'; // orange
      break;
    case 'btcmap':
      color = '#0891B2'; // cyan
      break;
    case 'bitcoinjungle':
      color = '#75B5A2'; // sage green
      break;
    default:
      color = '#10B981'; // green
  }

  return L.divIcon({
    className: `custom-marker marker-${type}`,
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

const blinkIcon = createCustomIcon('blink');
const btcmapIcon = createCustomIcon('btcmap');
const defaultIcon = createCustomIcon('default');
const bitcoinJungleIcon = createCustomIcon('bitcoinjungle');

export default function MapView({ selectedLocation, onLocationSelect }: MapViewProps) {
  return (
    <MapContainer
      center={[13.7942, -88.8965]}
      zoom={13}
      style={{ height: "100vh", width: "100%" }}
    >
      <MapLayer />
      <LocationMarker
        selectedLocation={selectedLocation}
        onLocationSelect={onLocationSelect}
      />
    </MapContainer>
  );
}