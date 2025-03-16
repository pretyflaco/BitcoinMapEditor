import { useEffect, useRef } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import { useQuery } from "@tanstack/react-query";
import type { Merchant } from "@shared/schema";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
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
    <Marker position={selectedLocation} />
  ) : null;
}

function createClusterCustomIcon(cluster: any) {
  const count = cluster.getChildCount();
  let size = 40;
  if (count > 100) size = 60;
  else if (count > 10) size = 50;

  return L.divIcon({
    html: `<div class="cluster-icon">${count}</div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(size, size)
  });
}

function ExistingMerchants() {
  const mapRef = useRef<L.Map | null>(null);
  const markerClusterRef = useRef<any>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Get map instance from parent
  const map = useMap();
  mapRef.current = map;

  // Fetch merchants data
  const { data: localMerchants = [] } = useQuery<Merchant[]>({
    queryKey: ["/api/merchants"],
  });

  const { data: btcMapMerchants = [], error } = useQuery<any[]>({
    queryKey: ["/api/btcmap/merchants"],
  });

  if (error) {
    console.error('Error fetching BTCMap merchants:', error);
  }

  useEffect(() => {
    if (!mapRef.current) return;

    // Clean up old markers and cluster group
    if (markerClusterRef.current) {
      mapRef.current.removeLayer(markerClusterRef.current);
    }
    markersRef.current.forEach(marker => {
      if (marker && mapRef.current) {
        mapRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];

    // Create new cluster group
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: (zoom: number) => {
        // Adjust cluster radius based on zoom level
        if (zoom <= 3) return 120; // Continent level
        if (zoom <= 6) return 80;  // Country level
        if (zoom <= 10) return 60; // City level
        return 40; // Individual markers
      },
      iconCreateFunction: createClusterCustomIcon,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    });

    // Add markers in chunks to prevent browser freezing
    const addMarkersInChunks = (merchants: any[], isLocal: boolean) => {
      const chunkSize = 100;
      let currentChunk = 0;

      const processChunk = () => {
        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, merchants.length);

        for (let i = start; i < end; i++) {
          const merchant = merchants[i];
          let lat, lng;

          if (isLocal) {
            lat = Number(merchant.latitude);
            lng = Number(merchant.longitude);
          } else {
            if (!merchant.osm_json || 
                typeof merchant.osm_json.lat !== 'number' || 
                typeof merchant.osm_json.lon !== 'number') {
              continue;
            }
            lat = merchant.osm_json.lat;
            lng = merchant.osm_json.lon;
          }

          if (!isNaN(lat) && !isNaN(lng)) {
            const marker = L.marker([lat, lng]);
            console.log(`Adding marker at: ${lat}, ${lng} for ${isLocal ? 'local' : 'BTCMap'} merchant`);
            markersRef.current.push(marker);
            clusterGroup.addLayer(marker);
          }
        }

        if (end < merchants.length) {
          currentChunk++;
          setTimeout(processChunk, 10); // Process next chunk after a small delay
        }
      };

      processChunk();
    };

    // Process local and BTCMap merchants
    console.log('Local merchants:', localMerchants);
    console.log('BTCMap merchants:', btcMapMerchants);

    addMarkersInChunks(localMerchants, true);
    addMarkersInChunks(btcMapMerchants, false);

    // Add cluster group to map
    mapRef.current.addLayer(clusterGroup);
    markerClusterRef.current = clusterGroup;

    return () => {
      if (markerClusterRef.current && mapRef.current) {
        mapRef.current.removeLayer(markerClusterRef.current);
      }
    };
  }, [localMerchants, btcMapMerchants]);

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
      <ExistingMerchants />
    </MapContainer>
  );
}