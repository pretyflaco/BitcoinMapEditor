import { useEffect, useCallback } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import { useQuery } from "@tanstack/react-query";
import type { Merchant } from "@shared/schema";
import "@maplibre/maplibre-gl-leaflet";
import { useTheme } from "@/hooks/use-theme";

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

  useEffect(() => {
    const style = theme === 'dark' 
      ? 'https://tiles.openfreemap.org/styles/dark'
      : 'https://tiles.openfreemap.org/styles/positron';

    const maplibreLayer = (L as any).maplibreGL({
      style,
      attribution: '© OpenFreeMap contributors'
    });

    map.addLayer(maplibreLayer);

    return () => {
      if (map && map.hasLayer(maplibreLayer)) {
        map.removeLayer(maplibreLayer);
      }
    };
  }, [map, theme]);

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

    // Filter and sort merchants by distance to center
    const center = map.getCenter();
    const visibleMerchants = [];

    // Process local merchants
    for (const merchant of localMerchants) {
      const lat = Number(merchant.latitude);
      const lng = Number(merchant.longitude);
      if (!isNaN(lat) && !isNaN(lng) && bounds.contains([lat, lng])) {
        const distance = center.distanceTo([lat, lng]);
        visibleMerchants.push({ merchant, isLocal: true, distance });
      }
    }

    // Process BTCMap merchants
    for (const merchant of btcMapMerchants) {
      if (!merchant.osm_json?.lat || !merchant.osm_json?.lon) continue;
      const lat = merchant.osm_json.lat;
      const lng = merchant.osm_json.lon;
      if (bounds.contains([lat, lng])) {
        const distance = center.distanceTo([lat, lng]);
        visibleMerchants.push({ merchant, isLocal: false, distance });
      }
    }

    // Sort by distance and limit
    visibleMerchants
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_MARKERS)
      .forEach(({ merchant, isLocal }) => {
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
    const throttledUpdate = L.Util.throttle(updateVisibleMarkers, 500);
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
      style={{ height: "500px", width: "100%" }}
      className="rounded-lg"
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