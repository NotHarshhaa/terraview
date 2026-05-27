/** @type {import('next').NextConfig} */
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig = {
  ...(isStaticExport ? { output: "export" } : {}),
  async rewrites() {
    if (isStaticExport) return [];
    const api =
      process.env.NEXT_PUBLIC_TERRAVIEW_API || "http://localhost:7777";
    return [
      {
        source: "/api/:path*",
        destination: `${api.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
