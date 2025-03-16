import { useEffect, useCallback } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import { useQuery } from "@tanstack/react-query";
import type { Merchant } from "@shared/schema";
import "@maplibre/maplibre-gl-leaflet";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";

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

// MapLayer component to handle MapLibre GL initialization
function MapLayer() {
  const map = useMap();
  const { theme } = useTheme();
  const { toast } = useToast();

  useEffect(() => {
    const style = theme === 'dark'
      ? 'https://tiles.openfreemap.org/styles/dark'
      : 'https://tiles.openfreemap.org/styles/positron';

    const maplibreLayer = (L as any).maplibreGL({
      style,
      attribution: '© OpenFreeMap contributors'
    });

    map.addLayer(maplibreLayer);

    // Request user's location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          map.flyTo([latitude, longitude], 13);
        },
        (error) => {
          console.log("Geolocation error or permission denied:", error);
          // Only show toast for explicit denials, not timeouts or other errors
          if (error.code === error.PERMISSION_DENIED) {
            toast({
              description: "Location access denied. You can still use the map normally.",
            });
          }
        }
      );
    }

    return () => {
      if (map && map.hasLayer(maplibreLayer)) {
        map.removeLayer(maplibreLayer);
      }
    };
  }, [map, theme, toast]);

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

// Add custom icon definitions
const createCustomIcon = (type: 'blink' | 'btcmap' | 'default') => {
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
  const MAX_MARKERS = 100;
  const GRID_SIZE = 5;

  // Fetch merchants data from all sources
  const { data: localMerchants = [] } = useQuery<Merchant[]>({
    queryKey: ["/api/merchants"],
  });

  const { data: btcMapMerchants = [] } = useQuery<any[]>({
    queryKey: ["/api/btcmap/merchants"],
  });

  const { data: blinkMerchants = [] } = useQuery<any[]>({
    queryKey: ["/api/blink/merchants"],
  });

  const updateVisibleMarkers = useCallback(() => {
    if (!map) return;

    const bounds = map.getBounds();

    // Remove existing markers
    markersRef.forEach((marker) => {
      map.removeLayer(marker);
    });
    markersRef.clear();

    // Create grid system
    const latSpan = bounds.getNorth() - bounds.getSouth();
    const lngSpan = bounds.getEast() - bounds.getWest();
    const cellLatSize = latSpan / GRID_SIZE;
    const cellLngSize = lngSpan / GRID_SIZE;
    const grid: Array<{
      merchant: any;
      source: 'local' | 'btcmap' | 'blink';
      cell: string;
    }> = [];

    // Process local merchants
    localMerchants.forEach(merchant => {
      const lat = Number(merchant.latitude);
      const lng = Number(merchant.longitude);
      if (!isNaN(lat) && !isNaN(lng) && bounds.contains([lat, lng])) {
        const cellRow = Math.floor((lat - bounds.getSouth()) / cellLatSize);
        const cellCol = Math.floor((lng - bounds.getWest()) / cellLngSize);
        const cell = `${cellRow}-${cellCol}`;
        grid.push({ merchant, source: 'local', cell });
      }
    });

    // Process BTCMap merchants
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

    // Process Blink merchants
    blinkMerchants.forEach(marker => {
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

    // Group by grid cells and data source
    const cellGroups = grid.reduce((acc, item) => {
      if (!acc[item.cell]) {
        acc[item.cell] = {
          blink: [],
          btcmap: [],
          local: []
        };
      }
      acc[item.cell][item.source].push(item);
      return acc;
    }, {} as Record<string, Record<'blink' | 'btcmap' | 'local', typeof grid>>);

    // Select markers evenly from cells and sources
    const selectedMarkers: typeof grid = [];
    const maxPerSource = Math.floor(MAX_MARKERS / 3); // Distribute evenly among sources
    const maxPerCellPerSource = Math.ceil(maxPerSource / (GRID_SIZE * GRID_SIZE));

    Object.values(cellGroups).forEach(cellSources => {
      // For each cell, take an equal number from each source
      ['blink', 'btcmap', 'local'].forEach(source => {
        const markers = cellSources[source as 'blink' | 'btcmap' | 'local'];
        if (markers.length === 0) return;

        // Sort by distance from cell center for better distribution
        const cellCenter = markers.reduce(
          (acc, m) => {
            const lat = m.source === 'blink'
              ? m.merchant.mapInfo.coordinates.latitude
              : m.source === 'btcmap'
                ? m.merchant.osm_json.lat
                : Number(m.merchant.latitude);
            const lng = m.source === 'blink'
              ? m.merchant.mapInfo.coordinates.longitude
              : m.source === 'btcmap'
                ? m.merchant.osm_json.lon
                : Number(m.merchant.longitude);
            return { lat: acc.lat + lat / markers.length, lng: acc.lng + lng / markers.length };
          },
          { lat: 0, lng: 0 }
        );

        // Take evenly spaced markers
        const sourceCount = selectedMarkers.filter(m => m.source === source).length;
        if (sourceCount >= maxPerSource) return;

        const available = maxPerSource - sourceCount;
        const take = Math.min(maxPerCellPerSource, available, markers.length);
        const step = Math.max(1, Math.floor(markers.length / take));

        for (let i = 0; i < markers.length && selectedMarkers.length < MAX_MARKERS; i += step) {
          if (selectedMarkers.filter(m => m.source === source).length >= maxPerSource) break;
          selectedMarkers.push(markers[i]);
        }
      });
    });

    // Create markers for selected points
    selectedMarkers.forEach(({ merchant, source }) => {
      let lat, lng, id, name, details, icon;

      switch (source) {
        case 'blink':
          lat = merchant.mapInfo.coordinates.latitude;
          lng = merchant.mapInfo.coordinates.longitude;
          id = `blink-${merchant.username}`;
          name = merchant.mapInfo.title;
          details = `
            <div class="text-center">
              <img 
                src="https://cdn.prod.website-files.com/6720ed07d56bdfa402a08023/6720ed07d56bdfa402a081b7_blink-icon-p-500.png"
                alt="Blink Logo" 
                class="w-12 h-12 mx-auto mb-2 object-contain"
              />
              <strong>${merchant.mapInfo.title}</strong><br/>
              <span>@${merchant.username}</span><br/>
              <a href="https://pay.blink.sv/${merchant.username}" 
                 target="_blank" 
                 rel="noopener noreferrer" 
                 class="inline-block mt-2 px-3 py-1 bg-[#FB5607] text-white font-bold rounded-full hover:bg-opacity-90 text-sm">
                Pay this user
              </a>
            </div>`;
          icon = blinkIcon;
          break;

        case 'btcmap':
          lat = merchant.osm_json.lat;
          lng = merchant.osm_json.lon;
          id = merchant.id;
          name = merchant.osm_json.tags?.name || 'Unknown Merchant';
          const tags = merchant.osm_json.tags || {};
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

          details = `
            <div class="text-center">
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
              ${openingHours ? `⏰ ${openingHours}` : ''}
            </div>`;
          icon = btcmapIcon;
          break;

        default:
          lat = Number(merchant.latitude);
          lng = Number(merchant.longitude);
          id = `local-${merchant.id}`;
          name = merchant.name;
          details = `${merchant.address}<br/><em>${merchant.type}</em>`;
          icon = defaultIcon;
      }

      const marker = L.marker([lat, lng], { icon });
      marker.on('click', () => {
        marker.bindPopup(`<div>${details}</div>`).openPopup();
      });

      marker.addTo(map);
      markersRef.set(id, marker);
    });

  }, [map, localMerchants, btcMapMerchants, blinkMerchants, blinkIcon, btcmapIcon, defaultIcon, theme]);

  useEffect(() => {
    if (!map) return;

    const throttledUpdate = L.Util.throttle(updateVisibleMarkers, 500, { leading: true });
    map.on('moveend', throttledUpdate);
    map.on('zoomend', throttledUpdate);

    updateVisibleMarkers();

    return () => {
      map.off('moveend', throttledUpdate);
      map.off('zoomend', throttledUpdate);
      markersRef.forEach(marker => map.removeLayer(marker));
      markersRef.clear();
    };
  }, [map, updateVisibleMarkers]);

  return null;
}


// Remove the old styleSheet creation since we're using inline styles now

export default function MapView({ selectedLocation, onLocationSelect }: MapViewProps) {
  return (
    <MapContainer
      center={[0, 0]}
      zoom={2}
      style={{ height: "100%", width: "100%" }}
      className="absolute inset-0"
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