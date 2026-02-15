'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Clock,
  Users,
  Car,
  ArrowRight,
  Loader2,
  Plane,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StepIndicator } from '@/components/public/step-indicator';
import { useBookingStore } from '@/stores/booking-store';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api`;
const STEPS = ['Search', 'Details', 'Payment', 'Confirmation'];

const SERVICE_TYPES = [
  { value: 'ARR', label: 'Arrival Transfer' },
  { value: 'DEP', label: 'Departure Transfer' },
  { value: 'EXCURSION', label: 'Excursion' },
  { value: 'CITY', label: 'City Transfer' },
];

interface LocationNode {
  id: string;
  name: string;
  type: string;
  children?: LocationNode[];
}

interface VehicleType {
  id: string;
  name: string;
  capacity: number;
}

export default function BookSearchPage() {
  const router = useRouter();
  const store = useBookingStore();

  const [locations, setLocations] = useState<LocationNode[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [showQuote, setShowQuote] = useState(false);

  // Extract zones from location tree
  const extractZones = useCallback((nodes: LocationNode[]): { label: string; zones: { id: string; name: string }[] }[] => {
    const groups: { label: string; zones: { id: string; name: string }[] }[] = [];

    const traverse = (node: LocationNode, path: string) => {
      if (node.type === 'ZONE') {
        // Find or create group
        const groupLabel = path || 'Other';
        let group = groups.find((g) => g.label === groupLabel);
        if (!group) {
          group = { label: groupLabel, zones: [] };
          groups.push(group);
        }
        group.zones.push({ id: node.id, name: node.name });
        return;
      }
      if (node.children) {
        const nextPath = node.type === 'COUNTRY' || node.type === 'CITY'
          ? (path ? `${path} > ${node.name}` : node.name)
          : path;
        node.children.forEach((child) => traverse(child, nextPath));
      }
    };

    nodes.forEach((n) => traverse(n, ''));
    return groups;
  }, []);

  // Extract airports from location tree
  const extractAirports = useCallback((nodes: LocationNode[]): { id: string; name: string }[] => {
    const airports: { id: string; name: string }[] = [];

    const traverse = (node: LocationNode) => {
      if (node.type === 'AIRPORT') {
        airports.push({ id: node.id, name: node.name });
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    nodes.forEach(traverse);
    return airports;
  }, []);

  // Extract hotels for a given zone
  const extractHotels = useCallback((nodes: LocationNode[], zoneId: string): { id: string; name: string }[] => {
    const hotels: { id: string; name: string }[] = [];

    const traverse = (node: LocationNode) => {
      if (node.id === zoneId && node.children) {
        node.children.forEach((child) => {
          if (child.type === 'HOTEL') {
            hotels.push({ id: child.id, name: child.name });
          }
        });
        return;
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    nodes.forEach(traverse);
    return hotels;
  }, []);

  useEffect(() => {
    // Fetch locations
    fetch(`${API}/public/locations`)
      .then((r) => r.json())
      .then((data) => setLocations(Array.isArray(data) ? data : data.data || []))
      .catch(() => setLocations([]))
      .finally(() => setLoadingLocations(false));

    // Fetch vehicle types
    fetch(`${API}/public/vehicle-types`)
      .then((r) => r.json())
      .then((data) => setVehicleTypes(Array.isArray(data) ? data : data.data || []))
      .catch(() => setVehicleTypes([]))
      .finally(() => setLoadingVehicles(false));
  }, []);

  const zoneGroups = extractZones(locations);
  const airports = extractAirports(locations);
  const isArrOrDep = store.serviceType === 'ARR' || store.serviceType === 'DEP';

  // Hotels based on the destination zone (for ARR) or origin zone (for DEP)
  const relevantZoneId = store.serviceType === 'ARR' ? store.toZoneId : store.fromZoneId;
  const hotels = relevantZoneId ? extractHotels(locations, relevantZoneId) : [];

  const handleGetQuote = async () => {
    setQuoteError('');
    setQuoting(true);
    setShowQuote(false);

    try {
      const body: Record<string, unknown> = {
        serviceType: store.serviceType,
        fromZoneId: store.fromZoneId,
        toZoneId: store.toZoneId,
        jobDate: store.jobDate,
        pickupTime: store.pickupTime,
        paxCount: store.paxCount,
        vehicleTypeId: store.vehicleTypeId,
      };

      if (store.hotelId) body.hotelId = store.hotelId;
      if (store.originAirportId) body.originAirportId = store.originAirportId;
      if (store.destinationAirportId) body.destinationAirportId = store.destinationAirportId;

      const res = await fetch(`${API}/public/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to get quote');
      }

      const json = await res.json();
      const data = json.data ?? json;
      store.setQuote(
        data.total ?? data.price ?? data.totalPrice ?? 0,
        data.currency ?? 'USD',
        data
      );
      setShowQuote(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get quote. Please try again.';
      setQuoteError(message);
    } finally {
      setQuoting(false);
    }
  };

  const canQuote =
    store.serviceType &&
    store.fromZoneId &&
    store.toZoneId &&
    store.jobDate &&
    store.pickupTime &&
    store.paxCount > 0 &&
    store.vehicleTypeId;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <StepIndicator steps={STEPS} currentStep={1} />

      <Card className="mt-2">
        <CardHeader>
          <CardTitle className="text-xl">Search Transfers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Service Type */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Car className="h-4 w-4 text-blue-600" />
              Service Type
            </Label>
            <Select
              value={store.serviceType}
              onValueChange={(v) => store.setField('serviceType', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select service type" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((st) => (
                  <SelectItem key={st.value} value={st.value}>
                    {st.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Airport (if ARR or DEP) */}
          {isArrOrDep && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Plane className="h-4 w-4 text-blue-600" />
                {store.serviceType === 'ARR' ? 'Arrival Airport' : 'Departure Airport'}
              </Label>
              <Select
                value={store.serviceType === 'ARR' ? store.originAirportId : store.destinationAirportId}
                onValueChange={(v) =>
                  store.setField(
                    store.serviceType === 'ARR' ? 'originAirportId' : 'destinationAirportId',
                    v
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select airport" />
                </SelectTrigger>
                <SelectContent>
                  {airports.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Pickup / Dropoff Zones */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-green-600" />
                Pickup Zone
              </Label>
              <Select
                value={store.fromZoneId}
                onValueChange={(v) => store.setField('fromZoneId', v)}
                disabled={loadingLocations}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={loadingLocations ? 'Loading...' : 'Select zone'} />
                </SelectTrigger>
                <SelectContent>
                  {zoneGroups.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.zones.map((z) => (
                        <SelectItem key={z.id} value={z.id}>
                          {z.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-red-600" />
                Drop-off Zone
              </Label>
              <Select
                value={store.toZoneId}
                onValueChange={(v) => store.setField('toZoneId', v)}
                disabled={loadingLocations}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={loadingLocations ? 'Loading...' : 'Select zone'} />
                </SelectTrigger>
                <SelectContent>
                  {zoneGroups.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.zones.map((z) => (
                        <SelectItem key={z.id} value={z.id}>
                          {z.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Hotel (optional) */}
          {hotels.length > 0 && (
            <div className="space-y-1.5">
              <Label>Hotel (optional)</Label>
              <Select
                value={store.hotelId}
                onValueChange={(v) => store.setField('hotelId', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select hotel" />
                </SelectTrigger>
                <SelectContent>
                  {hotels.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-blue-600" />
                Date
              </Label>
              <Input
                type="date"
                value={store.jobDate}
                onChange={(e) => store.setField('jobDate', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-blue-600" />
                Pickup Time
              </Label>
              <Input
                type="time"
                value={store.pickupTime}
                onChange={(e) => store.setField('pickupTime', e.target.value)}
              />
            </div>
          </div>

          {/* Passengers & Vehicle */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-blue-600" />
                Passengers
              </Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={store.paxCount}
                onChange={(e) =>
                  store.setField('paxCount', Math.max(1, parseInt(e.target.value) || 1))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Car className="h-4 w-4 text-blue-600" />
                Vehicle Type
              </Label>
              <Select
                value={store.vehicleTypeId}
                onValueChange={(v) => store.setField('vehicleTypeId', v)}
                disabled={loadingVehicles}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={loadingVehicles ? 'Loading...' : 'Select vehicle'} />
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypes.map((vt) => (
                    <SelectItem key={vt.id} value={vt.id}>
                      {vt.name} (up to {vt.capacity} pax)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Get Quote Button */}
          <div className="pt-2">
            <Button
              onClick={handleGetQuote}
              disabled={!canQuote || quoting}
              className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700"
              size="lg"
            >
              {quoting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Getting Quote...
                </>
              ) : (
                'Get Quote'
              )}
            </Button>
          </div>

          {/* Quote Error */}
          {quoteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {quoteError}
            </div>
          )}

          {/* Quote Result */}
          {showQuote && store.quotePrice !== null && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-5">
              <div className="text-center">
                <p className="text-sm font-medium text-green-700">Your Quote</p>
                <p className="mt-1 text-3xl font-bold text-green-800">
                  {store.quoteCurrency} {store.quotePrice.toFixed(2)}
                </p>
                {store.quoteBreakdown && (
                  <div className="mt-3 space-y-1 text-left text-sm text-green-700">
                    {Object.entries(store.quoteBreakdown).map(([key, val]) => {
                      if (['price', 'total', 'totalPrice', 'currency', 'vehicleType', 'seatCapacity', 'extras'].includes(key)) return null;
                      if (typeof val !== 'number' || val === 0) return null;
                      return (
                        <div key={key} className="flex justify-between">
                          <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <span>{val.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Button
                onClick={() => router.push('/book/details')}
                className="mt-5 w-full gap-2 bg-green-600 text-white hover:bg-green-700"
                size="lg"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
