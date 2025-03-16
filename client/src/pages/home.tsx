import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MapView from "@/components/map-view";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { insertMerchantSchema } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";

export default function Home() {
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [showMerchantForm, setShowMerchantForm] = useState(false);

  const locationForm = useForm({
    defaultValues: {
      latitude: "",
      longitude: ""
    }
  });

  const merchantForm = useForm({
    resolver: zodResolver(insertMerchantSchema),
    defaultValues: {
      name: "",
      username: "",
      latitude: selectedLocation?.lat || 0,
      longitude: selectedLocation?.lng || 0,
      address: "",
      description: "",
      type: "shop"
    }
  });

  const handleAddLocation = () => {
    setShowLocationInput(true);
  };

  const handleConfirmLocation = () => {
    const lat = parseFloat(locationForm.getValues("latitude"));
    const lng = parseFloat(locationForm.getValues("longitude"));
    if (!isNaN(lat) && !isNaN(lng)) {
      setSelectedLocation({ lat, lng });
      setShowLocationInput(false);
      setShowMerchantForm(true);
    }
  };

  const handleCancel = () => {
    setShowLocationInput(false);
    setShowMerchantForm(false);
    setSelectedLocation(null);
    locationForm.reset();
    merchantForm.reset();
  };

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* Map as base layer */}
      <div className="absolute inset-0 z-0">
        <MapView
          selectedLocation={selectedLocation}
          onLocationSelect={setSelectedLocation}
        />
      </div>

      {/* UI Layer */}
      <div className="absolute inset-0 pointer-events-none z-50">
        {/* Logo */}
        <div className="absolute top-4 left-4 pointer-events-auto">
          <img src="https://map.blink.sv/logo.svg" alt="Logo" className="h-12" />
        </div>

        {/* Add Location Button */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto">
          {!showLocationInput && !showMerchantForm && (
            <Button 
              onClick={handleAddLocation}
              className="rounded-full shadow-lg"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add new location
            </Button>
          )}
        </div>

        {/* Forms Layer */}
        {showLocationInput && (
          <div className="absolute top-4 right-4 pointer-events-auto">
            <Card className="w-72">
              <CardContent className="p-4">
                <form className="space-y-4">
                  <FormField
                    control={locationForm.control}
                    name="latitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Latitude</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. 41.080895" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={locationForm.control}
                    name="longitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Longitude</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. 29.034343" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleCancel} className="flex-1">
                      Cancel
                    </Button>
                    <Button onClick={handleConfirmLocation} className="flex-1">
                      Confirm
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {showMerchantForm && (
          <div className="absolute top-0 right-0 h-full pointer-events-auto">
            <Card className="w-80 h-full">
              <CardContent className="p-4">
                <h2 className="text-lg font-semibold mb-4">
                  Suggest Business - Fill the Details of the Business you want to Add
                </h2>
                <form className="space-y-4">
                  <FormField
                    control={merchantForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Title</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={merchantForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={merchantForm.control}
                    name="latitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Latitude</FormLabel>
                        <FormControl>
                          <Input {...field} value={selectedLocation?.lat} disabled />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={merchantForm.control}
                    name="longitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Longitude</FormLabel>
                        <FormControl>
                          <Input {...field} value={selectedLocation?.lng} disabled />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2 mt-8">
                    <Button variant="outline" onClick={handleCancel} className="flex-1">
                      Cancel
                    </Button>
                    <Button type="submit" className="flex-1">
                      Submit Merchant
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}