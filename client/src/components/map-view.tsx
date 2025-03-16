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
// Define marker icons with proper className handling for color filters
const createCustomIcon = (type: 'blink' | 'btcmap' | 'default') => L.divIcon({
  className: `marker-${type}`,
  html: '<img src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png" />',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const blinkIcon = createCustomIcon('blink');
const btcmapIcon = createCustomIcon('btcmap');
const defaultIcon = createCustomIcon('default');

function MerchantMarkers() {
  const map = useMap();
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

    // Group by grid cells
    const cellGroups = grid.reduce((acc, item) => {
      if (!acc[item.cell]) {
        acc[item.cell] = [];
      }
      acc[item.cell].push(item);
      return acc;
    }, {} as Record<string, typeof grid>);

    // Select markers evenly from cells
    const selectedMarkers: typeof grid = [];
    const maxPerCell = Math.ceil(MAX_MARKERS / (GRID_SIZE * GRID_SIZE));

    Object.values(cellGroups).forEach(cellMarkers => {
      // Sort markers within cell by spreading them out
      const cellCenter = cellMarkers.reduce(
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
          return { lat: acc.lat + lat / cellMarkers.length, lng: acc.lng + lng / cellMarkers.length };
        },
        { lat: 0, lng: 0 }
      );

      // Sort by distance from cell center
      cellMarkers.sort((a, b) => {
        const aLat = a.source === 'blink'
          ? a.merchant.mapInfo.coordinates.latitude
          : a.source === 'btcmap'
            ? a.merchant.osm_json.lat
            : Number(a.merchant.latitude);
        const aLng = a.source === 'blink'
          ? a.merchant.mapInfo.coordinates.longitude
          : a.source === 'btcmap'
            ? a.merchant.osm_json.lon
            : Number(a.merchant.longitude);
        const bLat = b.source === 'blink'
          ? b.merchant.mapInfo.coordinates.latitude
          : b.source === 'btcmap'
            ? b.merchant.osm_json.lat
            : Number(b.merchant.latitude);
        const bLng = b.source === 'blink'
          ? b.merchant.mapInfo.coordinates.longitude
          : b.source === 'btcmap'
            ? b.merchant.osm_json.lon
            : Number(b.merchant.longitude);

        const aDist = Math.pow(aLat - cellCenter.lat, 2) + Math.pow(aLng - cellCenter.lng, 2);
        const bDist = Math.pow(bLat - cellCenter.lat, 2) + Math.pow(bLng - cellCenter.lng, 2);
        return aDist - bDist;
      });

      // Take evenly spaced markers
      const step = Math.max(1, Math.floor(cellMarkers.length / maxPerCell));
      for (let i = 0; i < cellMarkers.length && selectedMarkers.length < MAX_MARKERS; i += step) {
        selectedMarkers.push(cellMarkers[i]);
      }
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
          details = `Username: ${merchant.username}`;
          icon = blinkIcon;
          break;

        case 'btcmap':
          lat = merchant.osm_json.lat;
          lng = merchant.osm_json.lon;
          id = merchant.id;
          name = merchant.osm_json.tags?.name || 'Unknown Merchant';
          details = `${merchant.osm_json.tags?.['addr:street'] || ''}<br/>
            <em>${merchant.osm_json.tags?.tourism || merchant.osm_json.tags?.shop || 'Other'}</em>`;
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
        marker.bindPopup(`<strong>${name}</strong><br/>${details}`).openPopup();
      });

      marker.addTo(map);
      markersRef.set(id, marker);
    });

  }, [map, localMerchants, btcMapMerchants, blinkMerchants]);

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

// Add custom marker colors to CSS
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  .marker-blink {
    background-color: #FB5607; /* For #FB5607 orange */
  }
  .marker-btcmap {
    background-color: #0891B2; /* For #0891B2 cyan */
  }
  .marker-default {
    background-color: #10B981; /* For #10B981 green */
  }
`;
document.head.appendChild(styleSheet);

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