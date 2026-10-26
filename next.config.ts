import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables forbidden()/unauthorized() so pages return real 403/401 responses.
  experimental: { authInterrupts: true },
};

export default nextConfig;
