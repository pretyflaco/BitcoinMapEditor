import { useEffect, useCallback } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import { useQuery } from "@tanstack/react-query";
import type { Merchant } from "@shared/schema";
import "@maplibre/maplibre-gl-leaflet";

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

  useEffect(() => {
    const maplibreLayer = (L as any).maplibreGL({
      style: 'https://tiles.openfreemap.org/styles/dark',
      attribution: '© OpenFreeMap contributors'
    });

    map.addLayer(maplibreLayer);

    return () => {
      if (map && map.hasLayer(maplibreLayer)) {
        map.removeLayer(maplibreLayer);
      }
    };
  }, [map]);

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
  const markersMap = new Map<string, L.Marker>();

  // Fetch merchants data
  const { data: localMerchants = [] } = useQuery<Merchant[]>({
    queryKey: ["/api/merchants"],
  });

  const { data: btcMapMerchants = [] } = useQuery<any[]>({
    queryKey: ["/api/btcmap/merchants"],
  });

  // Debounced function to update markers based on viewport
  const updateVisibleMarkers = useCallback(() => {
    if (!map) return;

    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // Clear existing markers outside viewport
    markersMap.forEach((marker, id) => {
      const pos = marker.getLatLng();
      if (!bounds.contains(pos)) {
        map.removeLayer(marker);
        markersMap.delete(id);
      }
    });

    // Add markers for merchants in viewport
    const addMarkerIfInBounds = (merchant: any, isLocal: boolean) => {
      let lat, lng, id, name, details;

      if (isLocal) {
        lat = Number(merchant.latitude);
        lng = Number(merchant.longitude);
        id = `local-${merchant.id}`;
        name = merchant.name;
        details = `${merchant.address}<br/><em>${merchant.type}</em>`;
      } else {
        if (!merchant.osm_json?.lat || !merchant.osm_json?.lon) return;
        lat = merchant.osm_json.lat;
        lng = merchant.osm_json.lon;
        id = merchant.id;
        name = merchant.osm_json.tags?.name || 'Unknown Merchant';
        details = `${merchant.osm_json.tags?.['addr:street'] || ''}<br/>
                  <em>${merchant.osm_json.tags?.tourism || merchant.osm_json.tags?.shop || 'Other'}</em>`;
      }

      if (!isNaN(lat) && !isNaN(lng) && bounds.contains([lat, lng]) && !markersMap.has(id)) {
        const marker = L.marker([lat, lng]);
        marker.bindPopup(`<strong>${name}</strong><br/>${details}`);
        marker.addTo(map);
        markersMap.set(id, marker);
      }
    };

    // Only process visible area merchants
    localMerchants.forEach(m => addMarkerIfInBounds(m, true));
    btcMapMerchants.forEach(m => addMarkerIfInBounds(m, false));

  }, [map, localMerchants, btcMapMerchants]);

  useEffect(() => {
    if (!map) return;

    // Add event listeners for map movement
    const debouncedUpdate = L.Util.throttle(updateVisibleMarkers, 300);
    map.on('moveend', debouncedUpdate);
    map.on('zoomend', debouncedUpdate);

    // Initial update
    updateVisibleMarkers();

    return () => {
      map.off('moveend', debouncedUpdate);
      map.off('zoomend', debouncedUpdate);
      markersMap.forEach(marker => map.removeLayer(marker));
      markersMap.clear();
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