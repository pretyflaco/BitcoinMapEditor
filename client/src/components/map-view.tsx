import { useEffect } from "react";
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

function LocationMarker({
  selectedLocation,
  onLocationSelect
}: MapViewProps) {
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

  // Fetch merchants data
  const { data: localMerchants = [] } = useQuery<Merchant[]>({
    queryKey: ["/api/merchants"],
  });

  const { data: btcMapMerchants = [], error } = useQuery<any[]>({
    queryKey: ["/api/btcmap/merchants"],
  });

  useEffect(() => {
    if (!map) return;

    console.log('Local merchants:', localMerchants);
    console.log('BTCMap merchants:', btcMapMerchants);

    // Add local merchants
    localMerchants.forEach(merchant => {
      const lat = Number(merchant.latitude);
      const lng = Number(merchant.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        const marker = L.marker([lat, lng]);
        marker.bindPopup(`
          <strong>${merchant.name}</strong><br/>
          ${merchant.address}<br/>
          <em>${merchant.type}</em>
        `);
        marker.addTo(map);
      }
    });

    // Add BTCMap merchants
    btcMapMerchants.forEach(merchant => {
      if (!merchant.osm_json || 
          typeof merchant.osm_json.lat !== 'number' || 
          typeof merchant.osm_json.lon !== 'number') {
        return;
      }
      const marker = L.marker([merchant.osm_json.lat, merchant.osm_json.lon]);
      marker.bindPopup(`
        <strong>${merchant.osm_json.tags?.name || 'Unknown Merchant'}</strong><br/>
        ${merchant.osm_json.tags?.['addr:street'] || ''}<br/>
        <em>${merchant.osm_json.tags?.tourism || merchant.osm_json.tags?.shop || 'Other'}</em>
      `);
      marker.addTo(map);
    });

    return () => {
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          map.removeLayer(layer);
        }
      });
    };
  }, [map, localMerchants, btcMapMerchants]);

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