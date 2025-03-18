import { useEffect, useCallback, useState } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Merchant } from "@shared/schema";
import "@maplibre/maplibre-gl-leaflet";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { Search, Locate } from "lucide-react";
import { cacheService } from "@/lib/cache-service";

// Define the SearchAndLocate control
L.Control.SearchAndLocate = L.Control.extend({
  options: {
    position: 'topleft',
    onSearch: null as ((query: string, resultsContainer: HTMLDivElement) => void) | null
  },

  initialize: function(options: L.ControlOptions & { onSearch?: (query: string, resultsContainer: HTMLDivElement) => void }) {
    L.Util.setOptions(this, options);
  },

  onAdd: function(map: L.Map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
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

    // Locate button
    const locateButton = L.DomUtil.create('a', '', container);
    locateButton.href = '#';
    locateButton.title = 'Find my location';
    locateButton.style.display = 'block';
    locateButton.style.padding = '5px';
    locateButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><point cx="12" cy="12" r="3"></point></svg>`;

    // Event handlers
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    L.DomEvent.on(searchButton, 'click', (e) => {
      L.DomEvent.preventDefault(e);
      const isVisible = searchInput.style.display === 'block';
      searchInput.style.display = isVisible ? 'none' : 'block';
      searchResults.style.display = 'none';
      if (!isVisible) {
        searchInput.focus();
      }
    });

    L.DomEvent.on(searchInput, 'input', (e) => {
      const query = (e.target as HTMLInputElement).value.toLowerCase();
      if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
      }

      if (this.options.onSearch) {
        this.options.onSearch(query, searchResults);
      }
    });

    L.DomEvent.on(locateButton, 'click', (e) => {
      L.DomEvent.preventDefault(e);
      map.locate({ setView: true, maxZoom: 16 });
    });

    return container;
  },

  onRemove: function(map: L.Map) {
    // Cleanup will be handled automatically by Leaflet
  }
});

// Add the control to Leaflet's control namespace
L.control.searchAndLocate = function(options?: L.ControlOptions & { onSearch?: (query: string, resultsContainer: HTMLDivElement) => void }) {
  return new (L.Control.SearchAndLocate as any)(options);
};

// Add platform-specific navigation handler
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

// MapLayer component to handle MapLibre GL initialization
function MapLayer() {
  const map = useMap();
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch BTCMap merchants with caching
  const { data: btcMapMerchants = [] } = useQuery({
    queryKey: ["/api/btcmap/merchants"],
    queryFn: async () => {
      try {
        // Check if cache is stale
        const isStale = await cacheService.isCacheStale();

        if (!isStale) {
          const cachedData = await cacheService.getCachedMerchants();
          if (cachedData.length > 0) {
            return cachedData;
          }
        }

        // Fetch fresh data if cache is stale or empty
        const response = await fetch("/api/btcmap/merchants", {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'BTCMap-Frontend/1.0'
          }
        });

        if (!response.ok) {
          throw new Error(`BTCMap API error: ${response.statusText}`);
        }

        const data = await response.json();

        // Update cache with new data
        await cacheService.updateCache(data);
        await cacheService.pruneCache();

        return data;
      } catch (error) {
        console.error('Error fetching BTCMap merchants:', error);

        // Return cached data if available, even if stale
        const cachedData = await cacheService.getCachedMerchants();
        if (cachedData.length > 0) {
          return cachedData;
        }

        throw error;
      }
    },
    gcTime: 30 * 60 * 1000, // 30 minutes
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleSearch = useCallback((query: string, resultsContainer: HTMLDivElement) => {
    const searchResults: Array<{
      name: string;
      type: 'btcmap';
      lat: number;
      lng: number;
    }> = [];

    // Search in BTCMap merchants
    if (btcMapMerchants) {
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
    }

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
  }, [map, btcMapMerchants]);

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
    const searchAndLocateControl = L.control.searchAndLocate({
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

// Create custom icon definitions
const createCustomIcon = (type: 'btcmap' | 'blink' | 'default') => {
  let color: string;
  switch (type) {
    case 'blink':
      color = '#FB5607'; // orange
      break;
    case 'btcmap':
      color = '#0891B2'; // cyan
      break;
    default:
      color = '#10B981'; // green
  }

  return L.divIcon({
    className: `custom-marker marker-${type}`,
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

const blinkIcon = createCustomIcon('blink');
const btcmapIcon = createCustomIcon('btcmap');
const defaultIcon = createCustomIcon('default');

function MerchantMarkers() {
  const map = useMap();
  const { theme } = useTheme();
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
  const removeDistantMarkers = () => {
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
  };

  // Fetch BTCMap merchants with caching - This is now handled in MapLayer
  const { data: btcMapMerchants = [], isError } = useQuery({
    queryKey: ["/api/btcmap/merchants"],
    queryFn: async () => {
      try {
        // Check if cache is stale
        const isStale = await cacheService.isCacheStale();

        if (!isStale) {
          const cachedData = await cacheService.getCachedMerchants();
          if (cachedData.length > 0) {
            return cachedData;
          }
        }

        // Fetch fresh data if cache is stale or empty
        const response = await fetch("/api/btcmap/merchants", {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'BTCMap-Frontend/1.0'
          }
        });

        if (!response.ok) {
          throw new Error(`BTCMap API error: ${response.statusText}`);
        }

        const data = await response.json();

        // Update cache with new data
        await cacheService.updateCache(data);
        await cacheService.pruneCache();

        return data;
      } catch (error) {
        console.error('Error fetching BTCMap merchants:', error);

        // Return cached data if available, even if stale
        const cachedData = await cacheService.getCachedMerchants();
        if (cachedData.length > 0) {
          return cachedData;
        }

        throw error;
      }
    },
    gcTime: 30 * 60 * 1000, // 30 minutes
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const updateVisibleMarkers = useCallback(() => {
    if (!map) return;

    const bounds = map.getBounds();

    // Create grid system
    const latSpan = bounds.getNorth() - bounds.getSouth();
    const lngSpan = bounds.getEast() - bounds.getWest();
    const cellLatSize = latSpan / GRID_SIZE;
    const cellLngSize = lngSpan / GRID_SIZE;
    const grid: Array<{
      merchant: any;
      source: 'btcmap' | 'blink';
      cell: string;
    }> = [];

    // Process BTCMap merchants
    if (btcMapMerchants) {
      btcMapMerchants.forEach(merchant => {
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
    }


    // Find new markers that aren't already on the map
    const newMarkers = grid.filter(item => {
      const id = item.source === 'btcmap' ? `btcmap-${item.merchant.id}` : `blink-${item.merchant.id}`;
      return !markersRef.has(id);
    });

    // Group new markers by cell
    const newMarkersGroups = newMarkers.reduce((acc, item) => {
      if (!acc[item.cell]) {
        acc[item.cell] = {
          btcmap: [],
          blink: []
        };
      }
      acc[item.cell][item.source].push(item);
      return acc;
    }, {} as Record<string, { btcmap: typeof newMarkers; blink: typeof newMarkers }>);

    // Add new markers up to the limit
    let addedCount = 0;
    const maxPerSource = Math.floor(MAX_NEW_MARKERS / 2); // Distribute markers evenly
    const maxPerCellPerSource = Math.ceil(maxPerSource / (GRID_SIZE * GRID_SIZE));

    Object.values(newMarkersGroups).forEach(cellSources => {
      if (addedCount >= MAX_NEW_MARKERS) return;

      ['btcmap', 'blink'].forEach(source => {
        if (addedCount >= MAX_NEW_MARKERS) return;

        const markers = cellSources[source];
        if (markers.length === 0) return;

        const take = Math.min(maxPerCellPerSource, MAX_NEW_MARKERS - addedCount, markers.length);
        const step = Math.max(1, Math.floor(markers.length / take));

        for (let i = 0; i < markers.length && addedCount < MAX_NEW_MARKERS; i += step) {
          const { merchant } = markers[i];
          let lat: number, lng: number, id: string, name: string, details: string, icon: L.Icon;

          if (source === 'btcmap') {
            lat = merchant.osm_json?.lat;
            lng = merchant.osm_json?.lon;
            id = `btcmap-${merchant.id}`;
            const tags = merchant.osm_json?.tags ?? {};
            name = tags.name ?? 'Unknown Merchant';

            // Helper function to safely access address components
            const getAddress = () => {
              const components = [
                tags['addr:street'],
                tags['addr:housenumber'],
                tags['addr:city'],
                tags['addr:country']
              ];
              return components.filter(Boolean).join(', ');
            };

            // Helper function to safely get payment status
            const getPaymentStatus = (method: string) => {
              return tags[`payment:${method}`] === 'yes';
            };

            const address = getAddress();
            const phone = tags.phone ?? tags['contact:phone'];
            const website = tags.website ?? tags['contact:website'];
            const type = tags.amenity ?? tags.shop ?? tags.tourism ?? tags.leisure ?? 'Other';
            const openingHours = tags['opening_hours'];
            const surveyDate = tags['survey:date'];

            details = `
              <div class="text-center min-w-[280px]">
                <img
                  src="https://btcmap.org/images/logo.svg"
                  alt="BTCMap Logo"
                  class="w-12 h-12 mx-auto mb-2 object-contain"
                />
                <strong>${name}</strong><br/>
                <em>${type}</em><br/>
                ${address ? `📍 ${address}<br/>` : ''}
                ${phone ? `📞 ${phone}<br/>` : ''}
                ${website ? `🌐 <a href="${website}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${website}</a><br/>` : ''}
                ${openingHours ? `⏰ ${openingHours}<br/>` : ''}
                ${surveyDate ? `📅 Last surveyed: ${surveyDate}<br/>` : ''}
                <div class="flex justify-between items-center mt-2">
                  <div class="flex gap-2">
                    <img
                      src="https://btcmap.org/icons/${getPaymentStatus('bitcoin') ? 'btc-primary' : 'btc'}.svg"
                      alt="Bitcoin payments"
                      class="w-6 h-6"
                    />
                    <img
                      src="https://btcmap.org/icons/${getPaymentStatus('lightning') ? 'ln-primary' : 'ln-no'}.svg"
                      alt="Lightning payments"
                      class="w-6 h-6"
                    />
                    <img
                      src="https://btcmap.org/icons/${getPaymentStatus('contactless') ? 'nfc-primary' : 'nfc-no'}.svg"
                      alt="Contactless payments"
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
            icon = btcmapIcon;
          } else { //source === 'blink'
            lat = merchant.latitude;
            lng = merchant.longitude;
            id = `blink-${merchant.id}`;
            name = merchant.title || 'Unknown Merchant';
            details = `
              <div class="text-center min-w-[280px]">
                <img
                  src="/images/blink.png"
                  alt="Blink Logo"
                  class="w-12 h-12 mx-auto mb-2 object-contain"
                />
                <strong>${name}</strong><br/>
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
            icon = blinkIcon;
          }

          if (!markersRef.has(id) && lat && lng) {
            const marker = L.marker([lat, lng], { icon })
              .bindPopup(details)
              .addTo(map);
            markersRef.set(id, marker);
            addedCount++;
          }
        }
      });
    });

    // After adding new markers, check if we need to remove distant ones
    removeDistantMarkers();

  }, [map, btcMapMerchants, theme, removeDistantMarkers, btcmapIcon, blinkIcon]);

  useEffect(() => {
    if (!map) return;

    const throttledUpdate = L.Util.throttle(updateVisibleMarkers, 500, { leading: true });

    // Only add event listeners if map is mounted
    const moveHandler = () => {
      if (map) throttledUpdate();
    };

    const zoomHandler = () => {
      if (map) throttledUpdate();
    };

    map.on('moveend', moveHandler);
    map.on('zoomend', zoomHandler);

    // Initial update with error handling
    try {
      updateVisibleMarkers();
    } catch (error) {
      console.warn('Error during initial marker update:', error);
    }

    return () => {
      // Cleanup with error handling
      try {
        if (map) {
          map.off('moveend', moveHandler);
          map.off('zoomend', zoomHandler);
        }
      } catch (error) {
        console.warn('Error during map event cleanup:', error);
      }
    };
  }, [map, updateVisibleMarkers]);

  return null;
}

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

export default function MapView({ selectedLocation, onLocationSelect }: MapViewProps) {
  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      style={{ height: "100%", width: "100%" }}
      className="absolute inset-0"
      zoomControl={true}
      preferCanvas={true}
    >
      <MapLayer />
      <LocationMarker
        selectedLocation={selectedLocation}
        onLocationSelect={onLocationSelect}
      />
      <MerchantMarkers />
    </MapContainer>
  );
}