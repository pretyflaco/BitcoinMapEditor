import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MerchantForm from "@/components/merchant-form";
import MapView from "@/components/map-view";
import { useState } from "react";

export default function Home() {
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
  
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Bitcoin Merchant Directory
          </h1>
          <p className="text-muted-foreground mt-2">
            Add Bitcoin-accepting merchants to help grow the network
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Add New Merchant</CardTitle>
            </CardHeader>
            <CardContent>
              <MerchantForm 
                selectedLocation={selectedLocation}
                onLocationChange={setSelectedLocation}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Select Location</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <MapView
                selectedLocation={selectedLocation}
                onLocationSelect={setSelectedLocation}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
