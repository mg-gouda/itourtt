"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth-store";
import { useT } from "@/lib/i18n";

const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error, isAuthenticated, hydrate } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const t = useT();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    hydrate();
    setMounted(true);
  }, [hydrate]);

  useEffect(() => {
    if (mounted && isAuthenticated) {
      const user = useAuthStore.getState().user;
      router.replace(user?.role === 'REP' ? '/rep' : user?.role === 'DRIVER' ? '/driver' : '/dashboard');
    }
  }, [mounted, isAuthenticated, router]);

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data);
      const user = useAuthStore.getState().user;
      router.replace(user?.role === 'REP' ? '/rep' : user?.role === 'DRIVER' ? '/driver' : '/dashboard');
    } catch {
      // error is already set in the store
    }
  };

  if (!mounted) return null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black">
      {/* Background image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url('/login-bg.webp')",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      />

      {/* Login card – glass effect */}
      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
          {/* Logo / Brand */}
          <div className="mb-6 flex flex-col items-center gap-3">
            <Image
              src="/favicon.svg"
              alt="iTourTT"
              width={56}
              height={56}
            />
            <h1 className="text-xl font-semibold text-white">{t("sidebar.brand")}</h1>
            <p className="text-sm text-white/50">{t("login.system")}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm text-white/70">
                {t("login.email")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@itour.local"
                autoComplete="email"
                className="border-white/10 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:ring-white/20"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm text-white/70">
                {t("login.password")}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                autoComplete="current-password"
                className="border-white/10 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:ring-white/20"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            {error && (
              <p className="text-center text-sm text-red-400">{error}</p>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-white text-black hover:bg-white/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("login.signingIn")}
                </>
              ) : (
                t("login.signIn")
              )}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-white/30">
          {t("login.version")}
        </p>
      </div>
    </div>
  );
}
