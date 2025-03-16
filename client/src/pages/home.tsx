import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MapView from "@/components/map-view";
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { insertMerchantSchema } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "@/hooks/use-theme";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Home() {
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [showMerchantForm, setShowMerchantForm] = useState(false);
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const locationForm = useForm({
    defaultValues: {
      latitude: selectedLocation?.lat?.toString() || "",
      longitude: selectedLocation?.lng?.toString() || ""
    }
  });

  // Update location form when marker changes
  useEffect(() => {
    if (selectedLocation) {
      locationForm.setValue("latitude", selectedLocation.lat.toString());
      locationForm.setValue("longitude", selectedLocation.lng.toString());
    }
  }, [selectedLocation]);

  const merchantForm = useForm({
    resolver: zodResolver(insertMerchantSchema),
    defaultValues: {
      name: "",
      address: "",
      description: "",
      type: "shop",
      latitude: selectedLocation?.lat || 0,
      longitude: selectedLocation?.lng || 0,
    }
  });

  // Update form values when selectedLocation changes
  useEffect(() => {
    if (selectedLocation) {
      merchantForm.setValue("latitude", selectedLocation.lat);
      merchantForm.setValue("longitude", selectedLocation.lng);
    }
  }, [selectedLocation, merchantForm]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/merchants", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Merchant added successfully!",
      });
      merchantForm.reset();
      setShowMerchantForm(false);
      setSelectedLocation(null);
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddLocation = () => {
    // If there's a selected location, pre-populate the form
    if (selectedLocation) {
      locationForm.setValue("latitude", selectedLocation.lat.toString());
      locationForm.setValue("longitude", selectedLocation.lng.toString());
    }
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

  function onSubmit(data: any) {
    // Use either manually entered coordinates or map selection
    const submitData = {
      ...data,
      latitude: data.latitude || selectedLocation?.lat || 0,
      longitude: data.longitude || selectedLocation?.lng || 0,
    };

    if (!submitData.latitude || !submitData.longitude) {
      toast({
        title: "Error",
        description: "Please select a location on the map or enter coordinates",
        variant: "destructive",
      });
      return;
    }

    mutation.mutate(submitData);
  }

  // Watch latitude and longitude values to sync with map
  const latitude = merchantForm.watch("latitude");
  const longitude = merchantForm.watch("longitude");

  // Update map when lat/lng inputs change
  const handleCoordinateChange = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
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
        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto">
          <img 
            src={theme === 'dark' 
              ? "https://cdn.prod.website-files.com/6720ed07d56bdfa402a08023/6720ed07d56bdfa402a081cc_logo%2520white%2520tagline-p-500.png"
              : "https://cdn.prod.website-files.com/6720ed07d56bdfa402a08023/6720ed07d56bdfa402a081b1_full%2520color%2520with%2520tag%2520line-p-500.png"
            } 
            alt="Logo" 
            className="h-16" 
          />
        </div>

        {/* Add Location Button */}
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-auto">
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
                <Form {...locationForm}>
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
                </Form>
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
                <Form {...merchantForm}>
                  <form onSubmit={merchantForm.handleSubmit(onSubmit)} className="space-y-4">
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
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="restaurant">Restaurant</SelectItem>
                              <SelectItem value="cafe">Cafe</SelectItem>
                              <SelectItem value="shop">Shop</SelectItem>
                              <SelectItem value="bar">Bar</SelectItem>
                              <SelectItem value="hotel">Hotel</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={merchantForm.control}
                        name="latitude"
                        render={({ field: { onChange, ...field } }) => (
                          <FormItem>
                            <FormLabel>Latitude</FormLabel>
                            <FormControl>
                              <Input 
                                {...field}
                                type="number"
                                step="any"
                                onChange={(e) => {
                                  const lat = parseFloat(e.target.value);
                                  onChange(e);
                                  if (!isNaN(lat)) {
                                    handleCoordinateChange(lat, longitude || 0);
                                  }
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={merchantForm.control}
                        name="longitude"
                        render={({ field: { onChange, ...field } }) => (
                          <FormItem>
                            <FormLabel>Longitude</FormLabel>
                            <FormControl>
                              <Input 
                                {...field}
                                type="number"
                                step="any"
                                onChange={(e) => {
                                  const lng = parseFloat(e.target.value);
                                  onChange(e);
                                  if (!isNaN(lng)) {
                                    handleCoordinateChange(latitude || 0, lng);
                                  }
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={merchantForm.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={merchantForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={merchantForm.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website (optional)</FormLabel>
                          <FormControl>
                            <Input {...field} type="url" />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={merchantForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone (optional)</FormLabel>
                          <FormControl>
                            <Input {...field} type="tel" />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-2 mt-8">
                      <Button variant="outline" onClick={handleCancel} className="flex-1">
                        Cancel
                      </Button>
                      <Button 
                        type="submit"
                        className="flex-1"
                        disabled={mutation.isPending}
                      >
                        {mutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Adding Merchant...
                          </>
                        ) : (
                          "Add Merchant"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}