import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MapView from "@/components/map-view";
import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
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
      paymentMethods: [], // Initialize paymentMethods as an array
      website: "",
      phone: "",
      twitterMerchant: "",
      twitterSubmitter: "",
      notes: "",
      dataSource: "",
      contact: ""
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
            <Card className="w-96 h-full flex flex-col">
              <CardContent className="p-4 flex flex-col h-full">
                <div className="flex-none mb-6">
                  <h2 className="text-2xl font-semibold mb-2">
                    Suggest Business
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Fill out the following form and one of our volunteer community members will add your location to the map.
                  </p>
                </div>

                <Form {...merchantForm}>
                  <form onSubmit={merchantForm.handleSubmit(onSubmit)} className="flex flex-col h-full">
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-6">
                      <FormField
                        control={merchantForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Merchant Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Satoshi's Comics" />
                            </FormControl>
                            <FormMessage />
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
                              <FormMessage />
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
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={merchantForm.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address (optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="2100 Freedom Drive..." />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={merchantForm.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category (optional)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Restaurant etc." />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={merchantForm.control}
                        name="paymentMethods"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Select accepted payment methods (optional)</FormLabel>
                            <div className="flex flex-col gap-2">
                              {["onchain", "lightning", "lightning_contactless"].map((method) => (
                                <div key={method} className="flex items-center space-x-2">
                                  <Checkbox
                                    checked={field.value?.includes(method)}
                                    onCheckedChange={(checked) => {
                                      const currentValue = field.value || [];
                                      const newValue = checked
                                        ? [...currentValue, method]
                                        : currentValue.filter((v) => v !== method);
                                      field.onChange(newValue);
                                    }}
                                  />
                                  <label className="text-sm font-medium leading-none">
                                    {method === "onchain" ? "On-chain" :
                                     method === "lightning" ? "Lightning" :
                                     "Lightning Contactless"}
                                  </label>
                                </div>
                              ))}
                            </div>
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
                              <Input {...field} type="url" placeholder="https://bitcoin.org" />
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
                              <Input {...field} type="tel" placeholder="+21 420 69 1337" />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={merchantForm.control}
                        name="twitterMerchant"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex justify-between">
                              X/Twitter handle (optional)
                              <span className="opacity-0">Placeholder</span>
                            </FormLabel>
                            <div className="flex gap-4">
                              <FormControl>
                                <Input {...field} placeholder="Merchant" />
                              </FormControl>
                              <FormField
                                control={merchantForm.control}
                                name="twitterSubmitter"
                                render={({ field: submitterField }) => (
                                  <FormControl>
                                    <Input {...submitterField} placeholder="Submitter" />
                                  </FormControl>
                                )}
                              />
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={merchantForm.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes (optional)</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Any other relevant details?" />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={merchantForm.control}
                        name="dataSource"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data Source (optional)</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select data source" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="I am the business owner">I am the business owner</SelectItem>
                                <SelectItem value="I visited as a customer">I visited as a customer</SelectItem>
                                <SelectItem value="Other method">Other method</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={merchantForm.control}
                        name="contact"
                        render={({ field }) => (
                          <FormItem className="mb-6">
                            <FormLabel>Public Contact (optional)</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" placeholder="hello@btcmap.org" />
                            </FormControl>
                            <p className="text-sm text-muted-foreground mt-1 break-normal whitespace-normal">
                              If we have any follow-up questions we will contact you in order to add your location successfully. To speed up the process please check your spam folder in case it ends up there.
                            </p>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex-none pt-4 mt-4 border-t bg-background sticky bottom-0">
                      <div className="flex gap-2">
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
                              Submitting...
                            </>
                          ) : (
                            "Submit"
                          )}
                        </Button>
                      </div>
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