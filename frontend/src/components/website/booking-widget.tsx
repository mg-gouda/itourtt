'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Users,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  CalendarDays,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isBefore,
  startOfDay,
} from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useBookingStore } from '@/stores/booking-store';
import type { SiteSettings } from '@/lib/site-settings';
import { useWT } from '@/lib/website-i18n';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/public`;

type Tab = 'ARR' | 'DEP';

interface LocationNode {
  id: string;
  name: string;
  type: string;
  children?: LocationNode[];
}

interface BookingWidgetProps {
  settings: SiteSettings;
}

/* ─── Stepper ─── */
function Stepper({ value, onChange, min = 0, max = 50, color }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        className="flex h-6 w-6 items-center justify-center rounded-full text-white transition disabled:opacity-30 text-sm font-bold"
        style={{ backgroundColor: color }}>−</button>
      <span className="min-w-[2ch] text-center text-sm font-bold text-gray-900">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        className="flex h-6 w-6 items-center justify-center rounded-full text-white transition disabled:opacity-30 text-sm font-bold"
        style={{ backgroundColor: color }}>+</button>
    </div>
  );
}

/* ─── Date Picker ─── */
function DatePicker({ value, onChange, minDate, primaryColor, placeholder }: {
  value: string; onChange: (v: string) => void; minDate?: Date; primaryColor: string; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(value ? new Date(value + 'T12:00:00') : new Date());
  const selected = value ? new Date(value + 'T12:00:00') : null;
  const today = startOfDay(new Date());

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 }),
  });

  const isDisabled = (d: Date) => minDate ? isBefore(startOfDay(d), startOfDay(minDate)) : false;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-full w-full flex-col justify-center text-left">
          {selected
            ? <span className="text-sm font-medium text-gray-900">{format(selected, 'EEE, dd MMM yyyy')}</span>
            : <span className="text-sm text-gray-400">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white rounded-2xl shadow-2xl border border-gray-100" align="start" sideOffset={8}>
        <div className="p-4 w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 transition">
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <span className="text-sm font-semibold text-gray-900">{format(viewMonth, 'MMMM yyyy')}</span>
            <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 transition">
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {['Mo','Tu','We','Th','Fr','Sa','Su'].map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((day) => {
              const isSelected = selected && isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              const inMonth = isSameMonth(day, viewMonth);
              const disabled = isDisabled(day);
              return (
                <button key={day.toISOString()} type="button" disabled={disabled}
                  onClick={() => { onChange(format(day, 'yyyy-MM-dd')); setOpen(false); }}
                  className={[
                    'flex h-8 w-8 mx-auto items-center justify-center rounded-full text-xs font-medium transition',
                    !inMonth ? 'text-gray-300' : '',
                    disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100',
                    isToday && !isSelected ? 'ring-1 ring-gray-300' : '',
                    isSelected ? 'text-white font-bold' : inMonth && !disabled ? 'text-gray-800' : '',
                  ].join(' ')}
                  style={isSelected ? { backgroundColor: primaryColor } : {}}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Time Picker ─── */
function TimePicker({ value, onChange, primaryColor, placeholder }: {
  value: string; onChange: (v: string) => void; primaryColor: string; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = ['00','05','10','15','20','25','30','35','40','45','50','55'];
  const [selH, selM] = value ? value.split(':') : ['', ''];
  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (selH && hourRef.current) {
      const el = hourRef.current.querySelector(`[data-h="${selH}"]`) as HTMLElement;
      el?.scrollIntoView({ block: 'center' });
    }
    if (selM && minRef.current) {
      const el = minRef.current.querySelector(`[data-m="${selM}"]`) as HTMLElement;
      el?.scrollIntoView({ block: 'center' });
    }
  }, [open, selH, selM]);

  const pick = (h: string, m: string) => { if (h && m) { onChange(`${h}:${m}`); setOpen(false); } };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-full w-full flex-col justify-center text-left">
          {value
            ? <span className="text-sm font-medium text-gray-900">{value}</span>
            : <span className="text-sm text-gray-400">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white rounded-2xl shadow-2xl border border-gray-100" align="start" sideOffset={8}>
        <div className="flex">
          <div ref={hourRef} className="h-48 w-16 overflow-y-auto scrollbar-none border-r border-gray-100 py-2">
            {hours.map((h) => (
              <button key={h} data-h={h} type="button" onClick={() => pick(h, selM || '00')}
                className="flex h-9 w-full items-center justify-center text-sm font-medium transition rounded-lg"
                style={selH === h ? { backgroundColor: primaryColor, color: 'white' } : { color: '#374151' }}>{h}</button>
            ))}
          </div>
          <div ref={minRef} className="h-48 w-16 overflow-y-auto scrollbar-none py-2">
            {minutes.map((m) => (
              <button key={m} data-m={m} type="button" onClick={() => pick(selH || '08', m)}
                className="flex h-9 w-full items-center justify-center text-sm font-medium transition rounded-lg"
                style={selM === m ? { backgroundColor: primaryColor, color: 'white' } : { color: '#374151' }}>{m}</button>
            ))}
          </div>
        </div>
        <div className="border-t border-gray-100 px-3 py-2 text-center">
          <span className="text-xs text-gray-400">Hour · Minute</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Cell ─── */
function Cell({ icon: Icon, iconColor, label, children }: {
  icon: React.ElementType; iconColor: string; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex h-14 items-center gap-2.5 px-3">
      <div className="flex h-full items-center">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}

/* ─── Searchable combobox ───
 * Popover-based (no cmdk) so it drops into the public B2C site unchanged.
 * Options may carry an optional `group`; consecutive options sharing a group
 * render under one heading, and the query also matches on group name so e.g.
 * typing a zone reveals all its hotels. */
interface ComboOption { value: string; label: string; group?: string }

function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  primaryColor,
  disabled = false,
  emptyText = 'No results',
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: ComboOption[];
  placeholder: string;
  primaryColor: string;
  disabled?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q),
      )
    : options;

  // Group consecutive options, preserving the incoming order.
  const groups: { name: string | undefined; items: ComboOption[] }[] = [];
  for (const o of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.name === o.group) last.items.push(o);
    else groups.push({ name: o.group, items: [o] });
  }

  const close = () => { setOpen(false); setQuery(''); };

  return (
    <Popover open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" disabled={disabled}
          className="flex w-full items-center justify-between gap-1 text-left disabled:cursor-not-allowed disabled:opacity-50">
          <span className={cn('truncate text-sm', selected ? 'font-medium text-gray-900' : 'text-gray-400')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8}
        className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400" />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-400">{emptyText}</div>
          ) : (
            groups.map((g, gi) => (
              <div key={g.name ?? gi}>
                {g.name && (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {g.name}
                  </p>
                )}
                {g.items.map((o) => {
                  const active = o.value === value;
                  return (
                    <button key={o.value} type="button"
                      onClick={() => { onValueChange(o.value); close(); }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                      style={active ? { color: primaryColor } : undefined}>
                      <span className="truncate">{o.label}</span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Booking Widget ─── */
export function BookingWidget({ settings }: BookingWidgetProps) {
  const router = useRouter();
  const store = useBookingStore();

  const [activeTab, setActiveTab] = useState<Tab>('ARR');
  const [locations, setLocations] = useState<LocationNode[]>([]);

  const t = useWT();

  useEffect(() => {
    store.setField('serviceType', activeTab);
    store.setField('fromZoneId', '');
    store.setField('toZoneId', '');
    store.setField('originAirportId', '');
    store.setField('destinationAirportId', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    fetch(`${API}/locations`)
      .then((r) => r.json())
      .then((data) => setLocations(Array.isArray(data) ? data : data.data || []))
      .catch(() => setLocations([]));
  }, []);

  const airports = useCallback((nodes: LocationNode[]): { id: string; name: string }[] => {
    const list: { id: string; name: string }[] = [];
    const walk = (n: LocationNode) => { if (n.type === 'AIRPORT') list.push({ id: n.id, name: n.name }); n.children?.forEach(walk); };
    nodes.forEach(walk);
    return list;
  }, [])(locations);

  // Zones (each with its hotels) that sit under the selected airport, so the
  // destination list is cascaded to that airport instead of every zone globally.
  const zonesForAirport = useCallback(
    (nodes: LocationNode[], airportId: string): { id: string; name: string; hotels: { id: string; name: string }[] }[] => {
      if (!airportId) return [];
      const list: { id: string; name: string; hotels: { id: string; name: string }[] }[] = [];
      for (const country of nodes) {
        for (const airport of country.children ?? []) {
          if (airport.id !== airportId || airport.type !== 'AIRPORT') continue;
          for (const city of airport.children ?? []) {
            for (const zone of city.children ?? []) {
              if (zone.type !== 'ZONE') continue;
              list.push({
                id: zone.id,
                name: zone.name,
                hotels: (zone.children ?? [])
                  .filter((h) => h.type === 'HOTEL')
                  .map((h) => ({ id: h.id, name: h.name })),
              });
            }
          }
        }
      }
      return list;
    },
    [],
  );

  const firstZoneForAirport = useCallback((nodes: LocationNode[], airportId: string): string | null => {
    for (const country of nodes) {
      for (const airport of country.children ?? []) {
        if (airport.id !== airportId || airport.type !== 'AIRPORT') continue;

        const allZones: LocationNode[] = [];
        for (const city of airport.children ?? [])
          for (const zone of city.children ?? [])
            if (zone.type === 'ZONE') allZones.push(zone);

        if (!allZones.length) return null;

        // Prefer the zone whose name best matches the airport name
        // (admins typically create an "Airport Zone" named after the airport for pricing)
        const airWords = airport.name.toLowerCase().split(/\s+/);
        const scored = allZones.map((z) => {
          const zWords = z.name.toLowerCase().split(/\s+/);
          if (z.name.toLowerCase() === airport.name.toLowerCase()) return { id: z.id, score: 9999 };
          return { id: z.id, score: airWords.filter((w) => zWords.includes(w)).length };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored[0].id;
      }
    }
    return null;
  }, []);

  const handleAirportChange = (airportId: string) => {
    const isArr = activeTab === 'ARR';
    store.setField(isArr ? 'originAirportId' : 'destinationAirportId', airportId);
    const zoneId = firstZoneForAirport(locations, airportId);
    if (zoneId) store.setField(isArr ? 'fromZoneId' : 'toZoneId', zoneId);
    // Changing the airport changes which destinations are available, so reset
    // the previously chosen destination zone / hotel.
    store.setField(isArr ? 'toZoneId' : 'fromZoneId', '');
    store.setField('hotelId', '');
    store.setField('hotelName', '');
  };

  const isArr = activeTab === 'ARR';
  const airportValue = isArr ? store.originAirportId : store.destinationAirportId;
  const hotelZone = isArr ? store.toZoneId : store.fromZoneId;
  const pc = settings.primaryColor;

  // Destination options cascaded to the selected airport. The airport's own zone
  // (auto-selected as the airport side of the route) is excluded so it isn't
  // offered as a drop-off / pick-up hotel destination.
  const airportSideZone = isArr ? store.fromZoneId : store.toZoneId;
  const destZones = zonesForAirport(locations, airportValue).filter((z) => z.id !== airportSideZone);

  // Value encodes whether a specific hotel or a whole zone ("Anywhere in …") was
  // picked: `h:<hotelId>:<zoneId>` or `z:<zoneId>`.
  const selectedDestValue = store.hotelId
    ? `h:${store.hotelId}:${hotelZone}`
    : hotelZone
      ? `z:${hotelZone}`
      : '';

  const handleDestinationChange = (value: string) => {
    const [kind, a, b] = value.split(':');
    const zoneField = isArr ? 'toZoneId' : 'fromZoneId';
    if (kind === 'h') {
      store.setField(zoneField, b);
      store.setField('hotelId', a);
      const hotel = destZones.flatMap((z) => z.hotels).find((h) => h.id === a);
      store.setField('hotelName', hotel?.name ?? '');
    } else {
      store.setField(zoneField, a);
      store.setField('hotelId', '');
      store.setField('hotelName', '');
    }
  };

  const handleSearch = () => {
    router.push('/w/book');
  };

  const canSearch = airportValue && hotelZone && store.fromZoneId && store.toZoneId && store.jobDate && store.pickupTime && store.paxCount > 0;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">

      {/* Tabs */}
      <div className="flex items-center justify-center gap-1 border-b border-gray-100 px-3 py-2">
        {([
          { key: 'ARR' as Tab, label: t('booking.arrivalTransfer'), Icon: PlaneLanding },
          { key: 'DEP' as Tab, label: t('booking.departureTransfer'), Icon: PlaneTakeoff },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all"
            style={activeTab === key ? { backgroundColor: pc, color: 'white' } : { color: '#9ca3af' }}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Fields row */}
      <div className="p-3">
        <div className="grid grid-cols-2 sm:[grid-template-columns:2fr_2fr_1fr_1fr_1fr_auto] rounded-xl overflow-hidden">

          <Cell icon={Plane} iconColor={isArr ? '#16a34a' : '#dc2626'}
            label={isArr ? `${t('booking.arrivalAirport')} *` : `${t('booking.departureAirport')} *`}>
            <SearchableSelect
              value={isArr ? store.originAirportId : store.destinationAirportId}
              onValueChange={handleAirportChange}
              options={airports.map((a) => ({ value: a.id, label: a.name }))}
              placeholder={t('booking.selectAirport')}
              primaryColor={pc}
              emptyText={t('booking.selectAirport')}
            />
          </Cell>

          <Cell icon={MapPin} iconColor={isArr ? '#dc2626' : '#16a34a'}
            label={isArr ? `${t('booking.dropoffHotel')} *` : `${t('booking.pickupHotel')} *`}>
            <SearchableSelect
              value={selectedDestValue}
              onValueChange={handleDestinationChange}
              options={destZones.flatMap((z) => [
                { value: `z:${z.id}`, label: `Anywhere in ${z.name}`, group: z.name },
                ...z.hotels.map((h) => ({ value: `h:${h.id}:${z.id}`, label: h.name, group: z.name })),
              ])}
              placeholder={airportValue ? t('booking.searchLocation') : t('booking.selectAirport')}
              primaryColor={pc}
              disabled={!airportValue}
              emptyText="No destinations found for this airport."
            />
          </Cell>

          <Cell icon={CalendarDays} iconColor={pc} label={`${t('booking.date')} *`}>
            <DatePicker value={store.jobDate} onChange={(v) => store.setField('jobDate', v)}
              minDate={new Date()} primaryColor={pc} placeholder="Pick date" />
          </Cell>

          <Cell icon={Clock} iconColor={pc} label={`${t('booking.time')} *`}>
            <TimePicker value={store.pickupTime} onChange={(v) => store.setField('pickupTime', v)}
              primaryColor={pc} placeholder="Pick time" />
          </Cell>

          <Cell icon={Users} iconColor={pc} label={`${t('booking.passengers')} *`}>
            <Stepper value={store.paxCount} onChange={(v) => store.setField('paxCount', v)} min={1} max={50} color={pc} />
          </Cell>

          {/* Search button */}
          <div className="flex h-14 items-center justify-center px-3 col-span-2 sm:col-span-1">
            <button type="button" onClick={handleSearch} disabled={!canSearch}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-bold text-white shadow-md transition-opacity disabled:opacity-40"
              style={{ backgroundColor: pc }}>
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
