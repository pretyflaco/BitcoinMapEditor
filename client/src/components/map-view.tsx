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

function MerchantMarkers() {
  const map = useMap();
  const { theme } = useTheme();
  const markersRef = new Map<string, L.Marker>();
  const MAX_NEW_MARKERS = 70;
  const MAX_TOTAL_MARKERS = 300;
  const GRID_SIZE = 5;

  // Helper functions
  const getAddress = (tags: any) => {
    const components = [
      tags['addr:street'],
      tags['addr:housenumber'],
      tags['addr:city'],
      tags['addr:country']
    ];
    return components.filter(Boolean).join(', ');
  };

  const getPaymentStatus = (tags: any, method: string) => {
    return tags[`payment:${method}`] === 'yes';
  };

  // Fetch merchants data
  const { data: merchants = [], isError } = useQuery({
    queryKey: ["/api/merchants"],
    queryFn: async () => {
      const response = await fetch("/api/merchants");
      if (!response.ok) {
        throw new Error('Failed to fetch merchants');
      }
      return response.json();
    }
  });

  const getMarkerDetails = useCallback((merchant: any) => {
    if (merchant.source === 'blink') {
      return {
        id: `blink-${merchant.id}`,
        lat: merchant.latitude,
        lng: merchant.longitude,
        name: merchant.title || 'Unknown Merchant',
        icon: blinkIcon,
        details: `
          <div class="text-center min-w-[280px]">
            <img
              src="/images/blink.png"
              alt="Blink Logo"
              class="w-12 h-12 mx-auto mb-2 object-contain"
            />
            <strong>${merchant.title || 'Unknown Merchant'}</strong><br/>
            <div class="flex justify-between items-center mt-2">
              <div class="flex gap-2">
                <img
                  src="https://btcmap.org/icons/ln-primary.svg"
                  alt="Lightning Network enabled"
                  class="w-6 h-6"
                />
              </div>
              <a href="javascript:void(0)"
                 onclick="window.location.href = '${getNavigationUrl(merchant.latitude, merchant.longitude)}'"
                 class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </a>
            </div>
          </div>`
      };
    } else {
      const tags = merchant.osm_json?.tags ?? {};
      return {
        id: `btcmap-${merchant.id}`,
        lat: merchant.osm_json?.lat,
        lng: merchant.osm_json?.lon,
        name: tags.name ?? 'Unknown Merchant',
        icon: btcmapIcon,
        details: `
          <div class="text-center min-w-[280px]">
            <img
              src="https://btcmap.org/images/logo.svg"
              alt="BTCMap Logo"
              class="w-12 h-12 mx-auto mb-2 object-contain"
            />
            <strong>${tags.name ?? 'Unknown Merchant'}</strong><br/>
            <em>${tags.amenity ?? tags.shop ?? tags.tourism ?? tags.leisure ?? 'Other'}</em><br/>
            ${getAddress(tags) ? `📍 ${getAddress(tags)}<br/>` : ''}
            ${tags.phone ?? tags['contact:phone'] ? `📞 ${tags.phone ?? tags['contact:phone']}<br/>` : ''}
            ${tags.website ?? tags['contact:website'] ? `🌐 <a href="${tags.website ?? tags['contact:website']}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${tags.website ?? tags['contact:website']}</a><br/>` : ''}
            ${tags['opening_hours'] ? `⏰ ${tags['opening_hours']}<br/>` : ''}
            ${tags['survey:date'] ? `📅 Last surveyed: ${tags['survey:date']}<br/>` : ''}
            <div class="flex justify-between items-center mt-2">
              <div class="flex gap-2">
                <img
                  src="https://btcmap.org/icons/${getPaymentStatus(tags, 'bitcoin') ? 'btc-primary' : 'btc'}.svg"
                  alt="Bitcoin payments"
                  class="w-6 h-6"
                />
                <img
                  src="https://btcmap.org/icons/${getPaymentStatus(tags, 'lightning') ? 'ln-primary' : 'ln-no'}.svg"
                  alt="Lightning payments"
                  class="w-6 h-6"
                />
                <img
                  src="https://btcmap.org/icons/${getPaymentStatus(tags, 'contactless') ? 'nfc-primary' : 'nfc-no'}.svg"
                  alt="Contactless payments"
                  class="w-6 h-6"
                />
              </div>
              <a href="javascript:void(0)"
                 onclick="window.location.href = '${getNavigationUrl(merchant.osm_json?.lat, merchant.osm_json?.lon)}'"
                 class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white hover:bg-gray-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </a>
            </div>
          </div>`
      };
    }
  }, []);

  const updateVisibleMarkers = useCallback(() => {
    if (!map) return;

    const bounds = map.getBounds();
    const grid: Array<{
      merchant: any;
      details: ReturnType<typeof getMarkerDetails>;
      cell: string;
    }> = [];

    // Process merchants within bounds
    merchants.forEach(merchant => {
      const details = getMarkerDetails(merchant);
      if (!details.lat || !details.lng) return;

      if (bounds.contains([details.lat, details.lng])) {
        const cellRow = Math.floor((details.lat - bounds.getSouth()) / ((bounds.getNorth() - bounds.getSouth()) / GRID_SIZE));
        const cellCol = Math.floor((details.lng - bounds.getWest()) / ((bounds.getEast() - bounds.getWest()) / GRID_SIZE));
        const cell = `${cellRow}-${cellCol}`;
        grid.push({ merchant, details, cell });
      }
    });

    // Add new markers
    let addedCount = 0;
    grid.forEach(({ details }) => {
      if (addedCount >= MAX_NEW_MARKERS) return;
      if (!markersRef.has(details.id)) {
        const marker = L.marker([details.lat, details.lng], { icon: details.icon })
          .bindPopup(details.details)
          .addTo(map);
        markersRef.set(details.id, marker);
        addedCount++;
      }
    });

    // Remove distant markers if needed
    if (markersRef.size > MAX_TOTAL_MARKERS) {
      const center = bounds.getCenter();
      const markersArray = Array.from(markersRef.entries())
        .map(([id, marker]) => ({
          id,
          marker,
          distance: marker.getLatLng().distanceTo(center)
        }))
        .sort((a, b) => b.distance - a.distance);

      const markersToRemove = markersArray.slice(0, markersArray.length - MAX_TOTAL_MARKERS);
      markersToRemove.forEach(({ id, marker }) => {
        map.removeLayer(marker);
        markersRef.delete(id);
      });
    }
  }, [map, merchants, getMarkerDetails]);

  useEffect(() => {
    if (!map) return;

    const throttledUpdate = L.Util.throttle(updateVisibleMarkers, 500, { leading: true });

    map.on('moveend', throttledUpdate);
    map.on('zoomend', throttledUpdate);

    updateVisibleMarkers();

    return () => {
      map.off('moveend', throttledUpdate);
      map.off('zoomend', throttledUpdate);
    };
  }, [map, updateVisibleMarkers]);

  return null;
}

// Add back the SearchAndLocate control definition at the top of the file
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
  }
});

// Add the control to Leaflet's control namespace
L.control.searchAndLocate = function(options?: L.ControlOptions & { onSearch?: (query: string, resultsContainer: HTMLDivElement) => void }) {
  return new (L.Control.SearchAndLocate as any)(options);
};

function MapLayer() {
  const map = useMap();
  const { theme } = useTheme();
  const { toast } = useToast();

  // Add search handler for merchants
  const handleSearch = useCallback((query: string, resultsContainer: HTMLDivElement) => {
    const { data: merchants = [] } = useQuery({ queryKey: ["/api/merchants"] });

    const searchResults: Array<{
      name: string;
      type: 'btcmap' | 'blink';
      lat: number;
      lng: number;
    }> = [];

    merchants.forEach(merchant => {
      let searchMatch = false;
      let name = '';
      let lat = 0;
      let lng = 0;
      let type: 'btcmap' | 'blink' = 'btcmap';

      if (merchant.source === 'blink') {
        name = merchant.title || 'Unknown Merchant';
        lat = merchant.latitude;
        lng = merchant.longitude;
        type = 'blink';
        searchMatch = name.toLowerCase().includes(query);
      } else {
        name = merchant.osm_json?.tags?.name || 'Unknown Merchant';
        lat = merchant.osm_json?.lat;
        lng = merchant.osm_json?.lon;
        type = 'btcmap';
        searchMatch = name.toLowerCase().includes(query);
      }

      if (searchMatch) {
        searchResults.push({ name, type, lat, lng });
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
  }, [map]);

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

      if (!isDestroyed && map && !map.hasLayer(maplibreLayer)) {
        map.addLayer(maplibreLayer);
      }
    } catch (error) {
      console.warn('Error adding maplibre layer:', error);
    }

    // Add custom controls with search handler
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

    return () => {
      isDestroyed = true;

      if (map) {
        map.off('locationfound', locationFoundHandler);
        map.off('locationerror', locationErrorHandler);
      }

      if (map && maplibreLayer) {
        try {
          if (map.hasLayer(maplibreLayer)) {
            map.removeLayer(maplibreLayer);
          }
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.warn('Error removing maplibre layer:', error);
          }
        }
      }

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

interface MapViewProps {
  selectedLocation: { lat: number; lng: number } | null;
  onLocationSelect: (location: { lat: number; lng: number }) => void;
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