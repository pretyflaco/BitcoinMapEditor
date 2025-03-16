import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InsertMerchant, insertMerchantSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

interface MerchantFormProps {
  selectedLocation: { lat: number; lng: number } | null;
  onLocationChange: (location: { lat: number; lng: number } | null) => void;
}

export default function MerchantForm({
  selectedLocation,
  onLocationChange,
}: MerchantFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertMerchant>({
    resolver: zodResolver(insertMerchantSchema),
    defaultValues: {
      name: "",
      address: "",
      description: "",
      type: "shop",
      latitude: selectedLocation?.lat || 0,
      longitude: selectedLocation?.lng || 0,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: InsertMerchant) => {
      const res = await apiRequest("POST", "/api/merchants", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Merchant added successfully!",
      });
      form.reset();
      onLocationChange(null);
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

  // Watch latitude and longitude values to sync with map
  const latitude = form.watch("latitude");
  const longitude = form.watch("longitude");

  // Update map when lat/lng inputs change
  const handleCoordinateChange = (lat: number, lng: number) => {
    onLocationChange({ lat, lng });
  };

  function onSubmit(data: InsertMerchant) {
    // Use either manually entered coordinates or map selection
    const submitData = {
      ...data,
      latitude: latitude || selectedLocation?.lat || 0,
      longitude: longitude || selectedLocation?.lng || 0,
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Business Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
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
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
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
            control={form.control}
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
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website (optional)</FormLabel>
              <FormControl>
                <Input {...field} type="url" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone (optional)</FormLabel>
              <FormControl>
                <Input {...field} type="tel" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
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
      </form>
    </Form>
  );
}