"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import {
  PriceListGrid,
  type PriceGridItem,
  type PriceGridVehicleType,
} from "@/components/price-list-grid";
import { useT } from "@/lib/i18n";

export default function PublicPricesPage() {
  const t = useT();
  const [items, setItems] = useState<PriceGridItem[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<PriceGridVehicleType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pricesRes, vtRes] = await Promise.all([
        api.get("/public-prices"),
        api.get("/vehicles/types"),
      ]);
      setItems(
        (pricesRes.data.data || pricesRes.data || []).map((p: any) => ({
          ...p,
          price: Number(p.price),
          driverTip: Number(p.driverTip),
        }))
      );
      setVehicleTypes(vtRes.data.data || vtRes.data || []);
    } catch {
      toast.error("Failed to load public prices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (
    rows: {
      serviceType: string;
      fromZoneId: string;
      toZoneId: string;
      vehicleTypeId: string;
      price: number;
      driverTip: number;
    }[]
  ) => {
    await api.post("/public-prices/bulk", {
      items: rows.map((r) => ({
        serviceType: r.serviceType,
        fromZoneId: r.fromZoneId,
        toZoneId: r.toZoneId,
        vehicleTypeId: r.vehicleTypeId,
        price: r.price,
        driverTip: r.driverTip,
      })),
    });
    toast.success("Public prices saved");
    await fetchData();
  };

  const handleDelete = async (itemIds: string[]) => {
    for (const id of itemIds) {
      await api.delete(`/public-prices/${id}`);
    }
    toast.success("Route deleted");
    await fetchData();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("publicPrices.title") || "Public Prices (B2C)"}
        description={
          t("publicPrices.description") ||
          "Manage the public price list for direct guest bookings"
        }
      />
      <PriceListGrid
        items={items}
        vehicleTypes={vehicleTypes}
        priceFieldName="price"
        onSave={handleSave}
        onDeleteRoute={handleDelete}
        onRefresh={fetchData}
      />
    </div>
  );
}
