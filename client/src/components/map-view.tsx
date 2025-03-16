import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useQuery } from "@tanstack/react-query";
import type { Merchant } from "@shared/schema";

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

function ExistingMerchants() {
  // Fetch our local merchants
  const { data: localMerchants = [] } = useQuery<Merchant[]>({
    queryKey: ["/api/merchants"],
  });

  // Fetch btcmap.org merchants through our proxy
  const { data: btcMapMerchants = [] } = useQuery<any[]>({
    queryKey: ["/api/btcmap/merchants"],
  });

  return (
    <>
      {/* Show local merchants */}
      {localMerchants.map((merchant) => (
        <Marker
          key={`local-${merchant.id}`}
          position={[Number(merchant.latitude), Number(merchant.longitude)]}
        />
      ))}

      {/* Show btcmap.org merchants */}
      {btcMapMerchants.map((merchant) => (
        <Marker
          key={`btcmap-${merchant.id}`}
          position={[merchant.lat, merchant.lon]}
        />
      ))}
    </>
  );
}

export default function MapView({ selectedLocation, onLocationSelect }: MapViewProps) {
  const mapRef = useRef<L.Map>(null);

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
    }
  }, []);

  return (
    <MapContainer
      ref={mapRef}
      center={[0, 0]}
      zoom={2}
      style={{ height: "500px", width: "100%" }}
      className="rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocationMarker
        selectedLocation={selectedLocation}
        onLocationSelect={onLocationSelect}
      />
      <ExistingMerchants />
    </MapContainer>
  );
}