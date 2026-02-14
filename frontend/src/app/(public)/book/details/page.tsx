'use client';

import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  User,
  Mail,
  Phone,
  Globe,
  Plane,
  StickyNote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StepIndicator } from '@/components/public/step-indicator';
import { useBookingStore } from '@/stores/booking-store';

const STEPS = ['Search', 'Details', 'Payment', 'Confirmation'];

const SERVICE_LABELS: Record<string, string> = {
  ARR: 'Arrival Transfer',
  DEP: 'Departure Transfer',
  EXCURSION: 'Excursion',
  CITY: 'City Transfer',
};

export default function BookDetailsPage() {
  const router = useRouter();
  const store = useBookingStore();
  const isArrOrDep = store.serviceType === 'ARR' || store.serviceType === 'DEP';

  const canContinue =
    store.guestName.trim() !== '' &&
    store.guestEmail.trim() !== '' &&
    store.guestPhone.trim() !== '';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <StepIndicator steps={STEPS} currentStep={2} />

      {/* Trip Summary */}
      <Card className="mt-2 border-blue-100 bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-blue-800">Trip Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Service:</span>{' '}
              <span className="font-medium text-gray-900">
                {SERVICE_LABELS[store.serviceType] || store.serviceType}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Date:</span>{' '}
              <span className="font-medium text-gray-900">{store.jobDate}</span>
            </div>
            <div>
              <span className="text-gray-500">Time:</span>{' '}
              <span className="font-medium text-gray-900">{store.pickupTime}</span>
            </div>
            <div>
              <span className="text-gray-500">Passengers:</span>{' '}
              <span className="font-medium text-gray-900">{store.paxCount}</span>
            </div>
            {store.quotePrice !== null && (
              <div className="col-span-2">
                <span className="text-gray-500">Quote:</span>{' '}
                <span className="text-lg font-bold text-green-700">
                  {store.quoteCurrency} {store.quotePrice.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Guest Details Form */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-xl">Guest Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <User className="h-4 w-4 text-blue-600" />
              Full Name *
            </Label>
            <Input
              placeholder="John Doe"
              value={store.guestName}
              onChange={(e) => store.setField('guestName', e.target.value)}
            />
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-blue-600" />
                Email *
              </Label>
              <Input
                type="email"
                placeholder="guest@example.com"
                value={store.guestEmail}
                onChange={(e) => store.setField('guestEmail', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-blue-600" />
                Phone *
              </Label>
              <Input
                type="tel"
                placeholder="+20 1234567890"
                value={store.guestPhone}
                onChange={(e) => store.setField('guestPhone', e.target.value)}
              />
            </div>
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-blue-600" />
              Country
            </Label>
            <Input
              placeholder="e.g. United Kingdom"
              value={store.guestCountry}
              onChange={(e) => store.setField('guestCountry', e.target.value)}
            />
          </div>

          {/* Flight Details (ARR/DEP only) */}
          {isArrOrDep && (
            <>
              <div className="border-t pt-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-base font-semibold text-gray-900">
                  <Plane className="h-4 w-4 text-blue-600" />
                  Flight Details
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Flight Number</Label>
                  <Input
                    placeholder="MS 802"
                    value={store.flightNo}
                    onChange={(e) => store.setField('flightNo', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Carrier / Airline</Label>
                  <Input
                    placeholder="EgyptAir"
                    value={store.carrier}
                    onChange={(e) => store.setField('carrier', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Terminal</Label>
                  <Input
                    placeholder="Terminal 2"
                    value={store.terminal}
                    onChange={(e) => store.setField('terminal', e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Extras */}
          <div className="border-t pt-4">
            <h3 className="mb-3 text-base font-semibold text-gray-900">Extras</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Booster Seat</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={store.extras.boosterSeatQty}
                  onChange={(e) =>
                    store.setField('extras.boosterSeatQty', Math.max(0, parseInt(e.target.value) || 0))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Baby Seat</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={store.extras.babySeatQty}
                  onChange={(e) =>
                    store.setField('extras.babySeatQty', Math.max(0, parseInt(e.target.value) || 0))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Wheelchair</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={store.extras.wheelChairQty}
                  onChange={(e) =>
                    store.setField('extras.wheelChairQty', Math.max(0, parseInt(e.target.value) || 0))
                  }
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <StickyNote className="h-4 w-4 text-blue-600" />
              Additional Notes
            </Label>
            <Textarea
              placeholder="Any special requests or instructions..."
              value={store.notes}
              onChange={(e) => store.setField('notes', e.target.value)}
              rows={3}
            />
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => router.push('/book')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => router.push('/book/payment')}
              disabled={!canContinue}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
              size="lg"
            >
              Continue to Payment
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
