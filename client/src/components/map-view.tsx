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

function MerchantMarkers() {
    const map = useMap();
    const markersRef = new Map<string, L.Marker>();
    const MAX_MARKERS = 100;
    const GRID_SIZE = 5; // 5x5 grid for distribution

    // Fetch merchants data
    const { data: localMerchants = [] } = useQuery<Merchant[]>({
      queryKey: ["/api/merchants"],
    });

    const { data: btcMapMerchants = [] } = useQuery<any[]>({
      queryKey: ["/api/btcmap/merchants"],
    });

    const updateVisibleMarkers = useCallback(() => {
      if (!map) return;

      const bounds = map.getBounds();
      const zoom = map.getZoom();

      // Remove all existing markers
      markersRef.forEach((marker) => {
        map.removeLayer(marker);
      });
      markersRef.clear();

      // Create a grid system for the visible area
      const latSpan = bounds.getNorth() - bounds.getSouth();
      const lngSpan = bounds.getEast() - bounds.getWest();
      const cellLatSize = latSpan / GRID_SIZE;
      const cellLngSize = lngSpan / GRID_SIZE;
      const grid: Array<{ merchant: any; isLocal: boolean; cell: string }> = [];

      // Process local merchants
      localMerchants.forEach(merchant => {
        const lat = Number(merchant.latitude);
        const lng = Number(merchant.longitude);
        if (!isNaN(lat) && !isNaN(lng) && bounds.contains([lat, lng])) {
          // Calculate grid cell for this marker
          const cellRow = Math.floor((lat - bounds.getSouth()) / cellLatSize);
          const cellCol = Math.floor((lng - bounds.getWest()) / cellLngSize);
          const cell = `${cellRow}-${cellCol}`;
          grid.push({ merchant, isLocal: true, cell });
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
          grid.push({ merchant, isLocal: false, cell });
        }
      });

      // Group markers by grid cell
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
            const lat = m.isLocal ? Number(m.merchant.latitude) : m.merchant.osm_json.lat;
            const lng = m.isLocal ? Number(m.merchant.longitude) : m.merchant.osm_json.lon;
            return { lat: acc.lat + lat / cellMarkers.length, lng: acc.lng + lng / cellMarkers.length };
          },
          { lat: 0, lng: 0 }
        );

        // Sort by distance from cell center to spread markers
        cellMarkers.sort((a, b) => {
          const aLat = a.isLocal ? Number(a.merchant.latitude) : a.merchant.osm_json.lat;
          const aLng = a.isLocal ? Number(a.merchant.longitude) : a.merchant.osm_json.lon;
          const bLat = b.isLocal ? Number(b.merchant.latitude) : b.merchant.osm_json.lat;
          const bLng = b.isLocal ? Number(b.merchant.longitude) : b.merchant.osm_json.lon;

          const aDist = Math.pow(aLat - cellCenter.lat, 2) + Math.pow(aLng - cellCenter.lng, 2);
          const bDist = Math.pow(bLat - cellCenter.lat, 2) + Math.pow(bLng - cellCenter.lng, 2);
          return aDist - bDist;
        });

        // Take evenly spaced markers up to maxPerCell
        const step = Math.max(1, Math.floor(cellMarkers.length / maxPerCell));
        for (let i = 0; i < cellMarkers.length && selectedMarkers.length < MAX_MARKERS; i += step) {
          selectedMarkers.push(cellMarkers[i]);
        }
      });

      // Create markers for selected points
      selectedMarkers.forEach(({ merchant, isLocal }) => {
        const lat = isLocal ? Number(merchant.latitude) : merchant.osm_json.lat;
        const lng = isLocal ? Number(merchant.longitude) : merchant.osm_json.lon;
        const id = isLocal ? `local-${merchant.id}` : merchant.id;

        const marker = L.marker([lat, lng]);
        marker.on('click', () => {
          const name = isLocal ? merchant.name : merchant.osm_json.tags?.name || 'Unknown Merchant';
          const details = isLocal
            ? `${merchant.address}<br/><em>${merchant.type}</em>`
            : `${merchant.osm_json.tags?.['addr:street'] || ''}<br/>
               <em>${merchant.osm_json.tags?.tourism || merchant.osm_json.tags?.shop || 'Other'}</em>`;

          marker.bindPopup(`<strong>${name}</strong><br/>${details}`).openPopup();
        });

        marker.addTo(map);
        markersRef.set(id, marker);
      });

    }, [map, localMerchants, btcMapMerchants]);

    useEffect(() => {
      if (!map) return;

      // Throttle updates to prevent too frequent refreshes
      const throttledUpdate = L.Util.throttle(updateVisibleMarkers, 500, { leading: true });
      map.on('moveend', throttledUpdate);
      map.on('zoomend', throttledUpdate);

      // Initial update
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